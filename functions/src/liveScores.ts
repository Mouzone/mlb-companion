/**
 * liveScores — HTTP Cloud Function.
 *
 * Returns watchability scores and current pitchers for all games on a
 * given date's slate. The frontend polls this single endpoint every 15s
 * instead of issuing N per-game winProbability requests.
 *
 * Query params:
 *   date — YYYY-MM-DD (defaults to today in America/New_York)
 *
 * Response:
 *   { date, games: { [gamePk]: { score, tier, pregame, live, liveWeight,
 *     currentPitcher: { id, fullName, fieldingSide } | null,
 *     currentBatter: { id, fullName, battingSide } | null } } }
 */

import { onRequest } from 'firebase-functions/v2/https'

import { computeWatchability, PARK_FACTORS, tierFor } from './scoring.js'
import { ensureFresh, todayET } from './watchability-store.js'

import type { WinProbabilityPlay } from '../../shared/scoring-types.js'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

interface ScheduleGame {
  gamePk: number
  abstractGameState: 'Preview' | 'Live' | 'Final'
  awayAbbr: string
  homeAbbr: string
}

interface CurrentPitcher {
  id: number
  fullName: string
  fieldingSide: 'away' | 'home'
}

interface CurrentBatter {
  id: number
  fullName: string
  battingSide: 'away' | 'home'
}

interface GameScoreEntry {
  score: number
  tier: string
  pregame: number
  live: number | null
  liveWeight: number
  currentPitcher: CurrentPitcher | null
  currentBatter: CurrentBatter | null
}

async function fetchSchedule(date: string): Promise<ScheduleGame[]> {
  const res = await fetch(
    `${MLB_API}/schedule?sportId=1&date=${date}&hydrate=probablePitcher,team`,
  )
  if (!res.ok) throw new Error(`Schedule fetch failed: ${res.status}`)
  const data = await res.json() as { dates: { games: any[] }[] }

  return data.dates
    .flatMap((d) => d.games ?? [])
    .map((g) => ({
      gamePk: g.gamePk,
      abstractGameState: g.status?.abstractGameState ?? 'Preview',
      awayAbbr: g.teams?.away?.team?.abbreviation ?? '',
      homeAbbr: g.teams?.home?.team?.abbreviation ?? '',
    }))
}

async function fetchWinProbability(gamePk: number): Promise<WinProbabilityPlay[]> {
  const res = await fetch(`${MLB_API}/game/${gamePk}/winProbability`)
  if (!res.ok) return []
  const data: unknown = await res.json()
  if (!Array.isArray(data)) return []

  return data.map((raw: any) => {
    const play = raw ?? {}
    const about = play.about ?? {}
    return {
      homeTeamWinProbability: play.homeTeamWinProbability ?? null,
      homeTeamWinProbabilityAdded: play.homeTeamWinProbabilityAdded ?? null,
      leverageIndex: play.leverageIndex ?? null,
      dramaIndex: play.dramaIndex ?? null,
      inning: about.inning ?? null,
      captivatingIndex: about.captivatingIndex ?? null,
    }
  })
}

async function fetchCurrentPlayers(gamePk: number): Promise<{ pitcher: CurrentPitcher | null; batter: CurrentBatter | null }> {
  const res = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`)
  if (!res.ok) return { pitcher: null, batter: null }
  const data = await res.json() as any
  const linescore = data?.liveData?.linescore
  if (!linescore) return { pitcher: null, batter: null }

  const isTopInning = linescore?.isTopInning ?? true
  const fieldingSide: 'away' | 'home' = isTopInning ? 'home' : 'away'
  const battingSide: 'away' | 'home' = isTopInning ? 'away' : 'home'

  let pitcher: CurrentPitcher | null = null
  const p = linescore?.defense?.pitcher
  if (p && typeof p.id === 'number' && typeof p.fullName === 'string') {
    pitcher = { id: p.id, fullName: p.fullName, fieldingSide }
  }

  let batter: CurrentBatter | null = null
  const b = linescore?.offense?.batter
  if (b && typeof b.id === 'number' && typeof b.fullName === 'string') {
    batter = { id: b.id, fullName: b.fullName, battingSide }
  }

  return { pitcher, batter }
}

function progressFor(state: 'Preview' | 'Live' | 'Final'): 'preview' | 'live' | 'final' {
  switch (state) {
    case 'Live':
      return 'live'
    case 'Final':
      return 'final'
    default:
      return 'preview'
  }
}

export const liveScores = onRequest(
  {
    memory: '512MiB' as const,
    timeoutSeconds: 540,
    cors: true,
  },
  async (req, res) => {
    const date = (req.query.date as string) || todayET()

    try {
      const [scheduleGames, payload] = await Promise.all([
        fetchSchedule(date),
        ensureFresh(date),
      ])

      const inputsByGame = new Map(payload.games.map((g) => [g.gamePk, g]))

      const games: Record<string, GameScoreEntry> = {}

      const liveOrFinal = scheduleGames.filter(
        (g) => g.abstractGameState === 'Live' || g.abstractGameState === 'Final',
      )

      const results = await Promise.allSettled(
        liveOrFinal.map(async (game) => {
          const inputs = inputsByGame.get(game.gamePk)
          if (!inputs) return null

          const plays = await fetchWinProbability(game.gamePk)
          if (plays.length === 0) return null

          const fullInputs = {
            ...inputs,
            parkFactor: PARK_FACTORS[inputs.home.abbreviation] ?? 1,
          }

          const state = progressFor(game.abstractGameState)
          const result = computeWatchability(fullInputs, payload.baseline, plays, state)

          let currentPitcher: CurrentPitcher | null = null
          let currentBatter: CurrentBatter | null = null
          if (game.abstractGameState === 'Live') {
            const players = await fetchCurrentPlayers(game.gamePk)
            currentPitcher = players.pitcher
            currentBatter = players.batter
          }

          return {
            gamePk: game.gamePk,
            entry: {
              score: result.score,
              tier: tierFor(result.score),
              pregame: result.pregame,
              live: result.live,
              liveWeight: result.liveWeight,
              currentPitcher,
              currentBatter,
            } satisfies GameScoreEntry,
          }
        }),
      )

      for (const entry of results) {
        if (entry.status === 'fulfilled' && entry.value !== null) {
          games[String(entry.value.gamePk)] = entry.value.entry
        }
      }

      for (const game of scheduleGames) {
        if (games[String(game.gamePk)]) continue
        const inputs = inputsByGame.get(game.gamePk)
        if (!inputs) continue

        const fullInputs = {
          ...inputs,
          parkFactor: PARK_FACTORS[inputs.home.abbreviation] ?? 1,
        }
        const result = computeWatchability(fullInputs, payload.baseline, null, 'preview')
        games[String(game.gamePk)] = {
          score: result.score,
          tier: tierFor(result.score),
          pregame: result.pregame,
          live: result.live,
          liveWeight: result.liveWeight,
          currentPitcher: null,
          currentBatter: null,
        }
      }

      res.json({ date, games })
    } catch (err) {
      console.error('[liveScores] Error:', err)
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
    }
  },
)
