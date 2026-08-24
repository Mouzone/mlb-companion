import { useEffect, useRef, useCallback } from 'react'
import { useGameStore } from '../store/gameStore'
import { fetchLiveFeed, fetchDiffPatch } from '../api/mlb'
import type { LiveFeed, DiffPatchOperation, DiffPatchResponse } from '../api/types'

const POLL_INTERVAL = 4000
const PREVIEW_POLL_INTERVAL = 30_000

function shallowClone(node: unknown): unknown {
  if (Array.isArray(node)) return [...node]
  if (typeof node === 'object' && node !== null) return { ...(node as Record<string, unknown>) }
  return node
}

function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~')
}

function readPointer(root: Record<string, unknown>, pointer: string): unknown {
  const parts = pointer.split('/').filter(Boolean).map(decodePointerSegment)
  let node: unknown = root
  for (const key of parts) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[key]
  }
  return node
}

// Walks to the parent of `pointer`, cloning every node along the way so
// Zustand's Object.is subscribers actually see a new reference and re-render.
function cloneToParent(
  root: Record<string, unknown>,
  pointer: string,
): { parent: Record<string, unknown>; key: string } | null {
  const parts = pointer.split('/').filter(Boolean).map(decodePointerSegment)
  if (parts.length === 0) return null

  let target = root
  for (let i = 0; i < parts.length - 1; i++) {
    const child = target[parts[i]]
    if (typeof child !== 'object' || child === null) return null
    const cloned = shallowClone(child) as Record<string, unknown>
    target[parts[i]] = cloned
    target = cloned
  }
  return { parent: target, key: parts[parts.length - 1] }
}

function removeAt(parent: Record<string, unknown>, key: string) {
  if (Array.isArray(parent)) {
    const index = key === '-' ? parent.length - 1 : Number(key)
    if (Number.isInteger(index)) (parent as unknown[]).splice(index, 1)
    return
  }
  delete parent[key]
}

function insertAt(parent: Record<string, unknown>, key: string, value: unknown, isAdd: boolean) {
  if (Array.isArray(parent)) {
    const arr = parent as unknown[]
    const index = key === '-' ? arr.length : Number(key)
    if (!Number.isInteger(index)) return
    if (isAdd) arr.splice(index, 0, value)
    else arr[index] = value
    return
  }
  parent[key] = value
}

// Applies one RFC 6902 patch set immutably.
function applyDiff(feed: LiveFeed, ops: DiffPatchOperation[]): LiveFeed {
  const root = shallowClone(feed) as Record<string, unknown>
  for (const op of ops) {
    // `copy`/`move` read from the pre-mutation tree at `from`.
    const sourceValue =
      op.op === 'copy' || op.op === 'move' ? readPointer(root, op.from ?? '') : undefined

    if (op.op === 'move' && op.from) {
      const src = cloneToParent(root, op.from)
      if (src) removeAt(src.parent, src.key)
    }

    const dest = cloneToParent(root, op.path)
    if (!dest) continue

    switch (op.op) {
      case 'remove':
        removeAt(dest.parent, dest.key)
        break
      case 'add':
        insertAt(dest.parent, dest.key, op.value, true)
        break
      case 'copy':
      case 'move':
        insertAt(dest.parent, dest.key, sourceValue, true)
        break
      default:
        insertAt(dest.parent, dest.key, op.value, false)
    }
  }
  return root as unknown as LiveFeed
}

function isPatchArray(res: DiffPatchResponse): res is { diff: DiffPatchOperation[] }[] {
  return Array.isArray(res)
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
      const res = await fetchDiffPatch(gamePk, lastTimecodeRef.current)

      // No changes since `startTimecode`: the API replies with the whole feed
      // instead of a patch array.
      if (!isPatchArray(res)) {
        if (res.metaData?.timeStamp) {
          feedRef.current = res
          setLiveFeed(res)
          lastTimecodeRef.current = res.metaData.timeStamp
          setTimecode(res.metaData.timeStamp)
        }
        return
      }

      if (res.length === 0 || !feedRef.current) return

      let updated = feedRef.current
      for (const entry of res) {
        if (entry.diff?.length) updated = applyDiff(updated, entry.diff)
      }
      feedRef.current = updated
      setLiveFeed(updated)

      const nextTimecode = updated.metaData?.timeStamp
      if (nextTimecode && nextTimecode !== lastTimecodeRef.current) {
        lastTimecodeRef.current = nextTimecode
        setTimecode(nextTimecode)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Polling error')
    }
  }, [gamePk, setLiveFeed, setTimecode, setError])

  const previewPoll = useCallback(async () => {
    if (!gamePk) return
    if (typeof document !== 'undefined' && document.hidden) return
    try {
      const feed = await fetchLiveFeed(gamePk)
      feedRef.current = feed
      lastTimecodeRef.current = feed.metaData.timeStamp
      setLiveFeed(feed)
      setTimecode(feed.metaData.timeStamp)

      const status = feed.gameData.status.abstractGameState
      if (status === 'Live' && intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = setInterval(poll, POLL_INTERVAL)
      } else if (status === 'Final' && intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview poll error')
    }
  }, [gamePk, setLiveFeed, setTimecode, setError, poll])

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
          lastTimecodeRef.current = existing.metaData.timeStamp
          const status = existing.gameData.status.abstractGameState
          if (status === 'Live' && intervalRef.current === null) {
            intervalRef.current = setInterval(poll, POLL_INTERVAL)
          } else if (status === 'Preview' && intervalRef.current === null) {
            intervalRef.current = setInterval(previewPoll, PREVIEW_POLL_INTERVAL)
          }
          return
        }

        const feed = await fetchLiveFeed(pk)
        if (cancelled) return
        feedRef.current = feed
        lastTimecodeRef.current = feed.metaData.timeStamp
        setLiveFeed(feed)

        const status = feed.gameData.status.abstractGameState
        if (status === 'Live') {
          intervalRef.current = setInterval(poll, POLL_INTERVAL)
        } else if (status === 'Preview') {
          intervalRef.current = setInterval(previewPoll, PREVIEW_POLL_INTERVAL)
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
  }, [gamePk, setLiveFeed, setPolling, setError, poll, previewPoll])

  return { isPolling }
}
