import { fetchGameLog } from './mlb'
import type { GameLogEntry } from './types'

const gameLogRequests = new Map<string, Promise<GameLogEntry[]>>()

export function fetchCachedGameLog(
  personId: number,
  season: string,
  group: 'hitting' | 'pitching',
): Promise<GameLogEntry[]> {
  const cacheKey = `${personId}:${season}:${group}`
  const cachedRequest = gameLogRequests.get(cacheKey)
  if (cachedRequest !== undefined) return cachedRequest

  const request = fetchGameLog(personId, season, group)
  gameLogRequests.set(cacheKey, request)
  void request.catch(() => {
    gameLogRequests.delete(cacheKey)
  })
  return request
}
