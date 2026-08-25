/**
 * Live scores from the `liveScores` Cloud Function.
 *
 * Replaces the per-game winProbability polling that useWatchability did
 * client-side. A single HTTP call to the Cloud Function returns watchability
 * scores AND current pitchers for the entire slate, so the frontend makes
 * 1 request every 15s instead of N requests every 30s.
 *
 * If the Cloud Function is unreachable, scores simply don't update — the
 * same degradation as a failed winProbability fetch in the old hook.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { gameDateStr } from '../utils/gameDay'
import { useGameStore } from '../store/gameStore'

const ENDPOINT =
  'https://us-central1-mlb-companion-pwa.cloudfunctions.net/liveScores'

const POLL_INTERVAL = 15_000

export interface CurrentPitcher {
  readonly id: number
  readonly fullName: string
  readonly fieldingSide: 'away' | 'home'
}

export interface CurrentBatter {
  readonly id: number
  readonly fullName: string
  readonly battingSide: 'away' | 'home'
}

interface LiveScoreEntry {
  score: number
  tier: string
  pregame: number
  live: number | null
  liveWeight: number
  currentPitcher: CurrentPitcher | null
  currentBatter: CurrentBatter | null
}

interface LiveScoresResponse {
  date: string
  games: Record<string, LiveScoreEntry>
}

export interface LiveScoresState {
  readonly scores: ReadonlyMap<number, number>
  readonly pitchers: ReadonlyMap<number, CurrentPitcher>
  readonly batters: ReadonlyMap<number, CurrentBatter>
  readonly loading: boolean
}

export function useLiveScores(date: string = gameDateStr()): LiveScoresState {
  const scoreCache = useGameStore((s) => s.scoreCache)
  const pitcherCache = useGameStore((s) => s.pitcherCache)
  const batterCache = useGameStore((s) => s.batterCache)
  const setLiveScoresCache = useGameStore((s) => s.setLiveScoresCache)

  const [scores, setScores] = useState<ReadonlyMap<number, number>>(scoreCache)
  const [pitchers, setPitchers] = useState<ReadonlyMap<number, CurrentPitcher>>(pitcherCache)
  const [batters, setBatters] = useState<ReadonlyMap<number, CurrentBatter>>(batterCache)
  const [loading, setLoading] = useState(scoreCache.size === 0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dateRef = useRef(date)

  dateRef.current = date

  const poll = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return

    try {
      const res = await fetch(`${ENDPOINT}?date=${dateRef.current}`, { cache: 'no-cache' })
      if (!res.ok) return
      const data = (await res.json()) as LiveScoresResponse

      const scoreMap = new Map<number, number>()
      const pitcherMap = new Map<number, CurrentPitcher>()
      const batterMap = new Map<number, CurrentBatter>()

      for (const [gamePkStr, entry] of Object.entries(data.games)) {
        const gamePk = Number(gamePkStr)
        scoreMap.set(gamePk, entry.score)
        if (entry.currentPitcher !== null) {
          pitcherMap.set(gamePk, entry.currentPitcher)
        }
        if (entry.currentBatter !== null) {
          batterMap.set(gamePk, entry.currentBatter)
        }
      }

      setScores(scoreMap)
      setPitchers(pitcherMap)
      setBatters(batterMap)
      setLiveScoresCache(scoreMap, pitcherMap, batterMap)
    } catch {
      // Network error or CF unreachable — keep prior scores, don't crash UI
    } finally {
      setLoading(false)
    }
  }, [setLiveScoresCache])

  useEffect(() => {
    void poll()

    function onVisibility(): void {
      if (!document.hidden) void poll()
    }

    document.addEventListener('visibilitychange', onVisibility)

    intervalRef.current = setInterval(() => void poll(), POLL_INTERVAL)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [poll])

  return { scores, pitchers, batters, loading }
}

export default useLiveScores
