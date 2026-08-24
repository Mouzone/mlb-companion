/**
 * notify-live — scheduled Cloud Function (every 1 minute).
 *
 * Checks live watchability scores for games in progress using a 15-second
 * in-function polling loop. Sends Telegram notifications when:
 *   - A game's live score first crosses 65 (crossing trigger)
 *   - A game's live score jumps +10 from its last notified score (jump trigger)
 *
 * The function exits within 60 seconds to avoid overlapping with the next
 * cron invocation.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { initializeApp } from 'firebase-admin/app'

import { computeWatchability, PARK_FACTORS, tierFor } from './scoring.js'
import { sendTelegramNotification, type NotificationPayload } from './telegram.js'

import type { WatchabilityPayload, WinProbabilityPlay } from '../../shared/scoring-types.js'

const POLL_INTERVAL_MS = 15_000
const MAX_RUNTIME_MS = 55_000
const MLB_API = 'https://statsapi.mlb.com/api/v1'

interface LiveGame {
  gamePk: number
  awayAbbr: string
  homeAbbr: string
}

initializeApp()

async function fetchLiveGames(date: string): Promise<LiveGame[]> {
  const res = await fetch(
    `${MLB_API}/schedule?sportId=1&date=${date}&hydrate=probablePitcher,team`,
  )
  if (!res.ok) throw new Error(`Schedule fetch failed: ${res.status}`)
  const data = await res.json() as { dates: { games: any[] }[] }

  return data.dates
    .flatMap((d) => d.games ?? [])
    .filter((g) => g.status?.abstractGameState === 'Live')
    .map((g) => ({
      gamePk: g.gamePk,
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

async function fetchScheduleScores(date: string): Promise<Map<number, { awayScore: number; homeScore: number; inning: number | null }>> {
  const res = await fetch(
    `${MLB_API}/schedule?sportId=1&date=${date}&hydrate=linescore,team`,
  )
  if (!res.ok) return new Map()
  const data = await res.json() as { dates: { games: any[] }[] }

  const map = new Map<number, { awayScore: number; homeScore: number; inning: number | null }>()
  for (const game of data.dates?.flatMap((d) => d.games ?? []) ?? []) {
    const linescore = game.linescore
    map.set(game.gamePk, {
      awayScore: game.teams?.away?.score ?? 0,
      homeScore: game.teams?.home?.score ?? 0,
      inning: linescore?.currentInning ?? null,
    })
  }
  return map
}

export const notifyLive = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'America/New_York',
    secrets: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'WATCHABILITY_JSON_URL'],
    memory: '256MiB' as const,
    timeoutSeconds: 60,
  },
  async () => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    const payloadUrl = process.env.WATCHABILITY_JSON_URL

    if (!botToken || !chatId || !payloadUrl) {
      console.warn('[notify-live] Missing secrets, skipping')
      return
    }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

    const liveGames = await fetchLiveGames(today)
    if (liveGames.length === 0) {
      console.log('[notify-live] No live games, exiting')
      return
    }

    const payloadRes = await fetch(payloadUrl, { cache: 'no-cache' })
    if (!payloadRes.ok) throw new Error(`watchability.json fetch failed: ${payloadRes.status}`)
    const payload = (await payloadRes.json()) as WatchabilityPayload

    const inputsByGame = new Map(payload.games.map((g) => [g.gamePk, g]))
    const db = getFirestore()

    const startTime = Date.now()

    while (Date.now() - startTime < MAX_RUNTIME_MS) {
      const scores = await fetchScheduleScores(today)

      for (const game of liveGames) {
        const inputs = inputsByGame.get(game.gamePk)
        if (!inputs) continue

        const plays = await fetchWinProbability(game.gamePk)
        if (plays.length === 0) continue

        const fullInputs = {
          ...inputs,
          parkFactor: PARK_FACTORS[inputs.home.abbreviation] ?? 1,
        }

        const result = computeWatchability(fullInputs, payload.baseline, plays, 'live')
        const score = result.score
        const tier = tierFor(score)

        const scoreInfo = scores.get(game.gamePk)

        const docRef = db.collection('notifications').doc(today).collection('games').doc(String(game.gamePk))
        const docSnap = await docRef.get()
        const data = docSnap.exists ? docSnap.data() : null

        const crossingNotified = data?.crossingNotified ?? false
        const lastNotifiedScore = data?.lastNotifiedScore ?? null

        // Crossing trigger: score >= 65, not yet notified for this crossing
        if (score >= 65 && !crossingNotified) {
          const notification: NotificationPayload = {
            gamePk: game.gamePk,
            date: today,
            awayTeam: game.awayAbbr,
            homeTeam: game.homeAbbr,
            awayAbbr: game.awayAbbr,
            homeAbbr: game.homeAbbr,
            score,
            tier,
            pregame: result.pregame,
            live: result.live,
            liveWeight: result.liveWeight,
            state: 'live',
            trigger: 'crossing',
            inning: scoreInfo?.inning ?? null,
            awayScore: scoreInfo?.awayScore ?? null,
            homeScore: scoreInfo?.homeScore ?? null,
          }

          await sendTelegramNotification(botToken, chatId, notification)
          console.log(`[notify-live] Crossing alert for ${game.gamePk}: score ${score}`)

          await docRef.set(
            {
              crossingNotified: true,
              lastNotifiedScore: score,
              lastNotifiedAt: new Date(),
              gamePk: game.gamePk,
              awayAbbr: game.awayAbbr,
              homeAbbr: game.homeAbbr,
              createdAt: docSnap.exists ? data?.createdAt : new Date(),
            },
            { merge: true },
          )
          continue
        }

        // Jump trigger: score >= 65 and jumped +10 from last notified score
        if (score >= 65 && lastNotifiedScore !== null && score - lastNotifiedScore >= 10 && lastNotifiedScore >= 65) {
          const notification: NotificationPayload = {
            gamePk: game.gamePk,
            date: today,
            awayTeam: game.awayAbbr,
            homeTeam: game.homeAbbr,
            awayAbbr: game.awayAbbr,
            homeAbbr: game.homeAbbr,
            score,
            tier,
            pregame: result.pregame,
            live: result.live,
            liveWeight: result.liveWeight,
            state: 'live',
            trigger: 'jump',
            previousScore: lastNotifiedScore,
            inning: scoreInfo?.inning ?? null,
            awayScore: scoreInfo?.awayScore ?? null,
            homeScore: scoreInfo?.homeScore ?? null,
          }

          await sendTelegramNotification(botToken, chatId, notification)
          console.log(`[notify-live] Jump alert for ${game.gamePk}: ${lastNotifiedScore} → ${score}`)

          await docRef.set(
            {
              lastNotifiedScore: score,
              lastNotifiedAt: new Date(),
            },
            { merge: true },
          )
          continue
        }

        // Reset crossing flag when score drops below 65, allowing re-crossing alerts
        if (score < 65 && crossingNotified) {
          await docRef.set(
            { crossingNotified: false },
            { merge: true },
          )
        }
      }

      if (Date.now() - startTime >= MAX_RUNTIME_MS) break
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }

    console.log('[notify-live] Polling loop complete')
  },
)
