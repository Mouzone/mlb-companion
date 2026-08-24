/**
 * Adaptive schedule polling for the slate view.
 *
 * GameSelect calls this instead of a one-shot `fetchSchedule` so scores, game
 * status (Preview→Live→Final), and inning detail reflect real-time game state.
 *
 * Polling cadence adapts to what's on the slate:
 *   - Any Live game  → 15s
 *   - All Preview    → 30s
 *   - All Final      → stop polling
 *
 * Uses recursive `setTimeout` (not `setInterval`) so cadence adapts after each
 * fetch — a game going Live mid-session speeds up the next poll. Pauses when
 * the tab is hidden; resumes with an immediate refresh on visibilitychange.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchSchedule } from '../api/mlb'
import type { ScheduledGame } from '../api/types'

const LIVE_CADENCE = 15_000
const PREVIEW_CADENCE = 30_000

export interface UseLiveSlateResult {
  games: ScheduledGame[]
  loading: boolean
  refresh: () => void
}

function cadenceFor(games: ScheduledGame[]): number | null {
  const hasLive = games.some((g) => g.status.abstractGameState === 'Live')
  if (hasLive) return LIVE_CADENCE
  const allFinal = games.length > 0 && games.every((g) => g.status.abstractGameState === 'Final')
  if (allFinal) return null
  return PREVIEW_CADENCE
}

export function useLiveSlate(date: string): UseLiveSlateResult {
  const [games, setGames] = useState<ScheduledGame[]>([])
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelledRef = useRef(false)
  const gamesRef = useRef<ScheduledGame[]>([])

  gamesRef.current = games

  const doFetch = useCallback(async () => {
    if (cancelledRef.current) return
    try {
      const scheduled = await fetchSchedule(date)
      if (cancelledRef.current) return
      gamesRef.current = scheduled
      setGames(scheduled)
      setLoading(false)
    } catch {
      if (cancelledRef.current) return
      setLoading(false)
    }
    scheduleNext()
  }, [date])

  const scheduleNext = useCallback(() => {
    if (cancelledRef.current) return
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const delay = cadenceFor(gamesRef.current)
    if (delay === null) return
    timerRef.current = setTimeout(() => void doFetch(), delay)
  }, [doFetch])

  const refresh = useCallback(() => {
    void doFetch()
  }, [doFetch])

  useEffect(() => {
    cancelledRef.current = false
    setLoading(true)
    void doFetch()

    function onVisibilityChange() {
      if (cancelledRef.current) return
      if (!document.hidden) void doFetch()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelledRef.current = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [date, doFetch])

  return { games, loading, refresh }
}

export default useLiveSlate
