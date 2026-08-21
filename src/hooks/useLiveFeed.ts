import { useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '../store/gameStore'
import { fetchLiveFeed, fetchDiffPatch } from '../api/mlb'
import type { LiveFeed } from '../api/types'

const POLL_INTERVAL = 4000

function shallowClone(node: unknown): unknown {
  if (Array.isArray(node)) return [...node]
  if (typeof node === 'object' && node !== null) return { ...(node as Record<string, unknown>) }
  return node
}

// Applies a diffPatch immutably: every node along a mutated path is cloned so
// Zustand's Object.is subscribers actually see a new reference and re-render.
function applyDiff(feed: LiveFeed, diff: { path: string; value: unknown }[]): LiveFeed {
  const root = shallowClone(feed) as Record<string, unknown>
  for (const entry of diff) {
    const pathParts = entry.path.split('/').filter(Boolean)
    if (pathParts.length === 0) continue

    let target = root
    let ok = true
    for (let i = 0; i < pathParts.length - 1; i++) {
      const key = pathParts[i]
      const child = target[key]
      if (typeof child !== 'object' || child === null) {
        ok = false
        break
      }
      const cloned = shallowClone(child) as Record<string, unknown>
      target[key] = cloned
      target = cloned
    }
    if (!ok) continue

    const lastKey = pathParts[pathParts.length - 1]
    if (entry.value === null) {
      delete target[lastKey]
    } else {
      target[lastKey] = entry.value
    }
  }
  return root as unknown as LiveFeed
}

export function useLiveFeed() {
  const gamePk = useGameStore((s) => s.gamePk)
  const isPolling = useGameStore((s) => s.isPolling)
  const setLiveFeed = useGameStore((s) => s.setLiveFeed)
  const setTimecode = useGameStore((s) => s.setTimecode)
  const setPolling = useGameStore((s) => s.setPolling)
  const setError = useGameStore((s) => s.setError)
  const lastTimecodeRef = useRef<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const feedRef = useRef<LiveFeed | null>(null)

  useEffect(() => {
    feedRef.current = useGameStore.getState().liveFeed
  })

  const poll = useCallback(async () => {
    if (!gamePk || !lastTimecodeRef.current) return
    // Skip network work while the tab is backgrounded; the next visible tick
    // requests a diff from the same timecode and catches up in one call.
    if (typeof document !== 'undefined' && document.hidden) return
    try {
      const diff = await fetchDiffPatch(gamePk, lastTimecodeRef.current)
      if (diff.diff && diff.diff.length > 0 && feedRef.current) {
        const updated = applyDiff(feedRef.current, diff.diff)
        feedRef.current = updated
        setLiveFeed(updated)
      }
      if (diff.metaData?.timecode) {
        lastTimecodeRef.current = diff.metaData.timecode
        setTimecode(diff.metaData.timecode)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Polling error')
    }
  }, [gamePk, setLiveFeed, setTimecode, setError])

  useEffect(() => {
    if (!gamePk) return

    let cancelled = false

    async function init(pk: number) {
      try {
        setPolling(true)
        setError(null)

        // If the deep-link path already loaded the feed for this game, reuse it
        // instead of re-fetching.
        const existing = useGameStore.getState().liveFeed
        if (existing && useGameStore.getState().gamePk === pk) {
          feedRef.current = existing
          lastTimecodeRef.current = existing.metaData.timecode
          const status = existing.gameData.status.abstractGameState
          if (status === 'Live' && intervalRef.current === null) {
            intervalRef.current = setInterval(poll, POLL_INTERVAL)
          }
          return
        }

        const feed = await fetchLiveFeed(pk)
        if (cancelled) return
        feedRef.current = feed
        lastTimecodeRef.current = feed.metaData.timecode
        setLiveFeed(feed)

        const status = feed.gameData.status.abstractGameState
        if (status === 'Live') {
          intervalRef.current = setInterval(poll, POLL_INTERVAL)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load live feed')
        }
      } finally {
        if (!cancelled) setPolling(false)
      }
    }

    init(gamePk)

    return () => {
      cancelled = true
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [gamePk, setLiveFeed, setPolling, setError, poll])

  return { isPolling }
}
