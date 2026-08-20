import { fetchCareerVsPlayer, fetchGameLog } from './mlb'
import type { GameLogEntry, VsPlayerStat } from './types'

const gameLogRequests = new Map<string, Promise<GameLogEntry[]>>()
const careerVsPlayerRequests = new Map<string, Promise<VsPlayerStat | null>>()

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

export function fetchCachedCareerVsPlayer(
  batterId: number,
  pitcherId: number,
): Promise<VsPlayerStat | null> {
  const cacheKey = `${batterId}:${pitcherId}`
  const cachedRequest = careerVsPlayerRequests.get(cacheKey)
  if (cachedRequest !== undefined) return cachedRequest

  const request = fetchCareerVsPlayer(batterId, pitcherId)
  careerVsPlayerRequests.set(cacheKey, request)
  void request.catch(() => {
    careerVsPlayerRequests.delete(cacheKey)
  })
  return request
}
