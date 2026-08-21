import { useEffect, useState } from 'react'
import { fetchCareerStats } from '../api/mlb'
import type { CareerBatterStat, CareerPitcherStat } from '../api/types'

interface CareerMatchupStats {
  readonly pitcher: CareerPitcherStat | null
  readonly batter: CareerBatterStat | null
}

function isCareerPitcher(stat: CareerBatterStat | CareerPitcherStat): stat is CareerPitcherStat {
  return 'era' in stat
}

const careerPitcherRequests = new Map<string, Promise<CareerPitcherStat | null>>()
const careerBatterRequests = new Map<string, Promise<CareerBatterStat | null>>()

function fetchCachedCareerPitcher(pitcherId: number): Promise<CareerPitcherStat | null> {
  const cacheKey = String(pitcherId)
  const cached = careerPitcherRequests.get(cacheKey)
  if (cached !== undefined) return cached

  const request = fetchCareerStats(pitcherId, 'pitching')
    .then((stat) => (stat !== null && isCareerPitcher(stat) ? stat : null))
    .catch(() => null)
  careerPitcherRequests.set(cacheKey, request)
  // The promise above never rejects, so evict on an empty result instead so a
  // failure while offline does not poison the cache for the whole session.
  void request.then((stat) => {
    if (stat === null) careerPitcherRequests.delete(cacheKey)
  })
  return request
}

function fetchCachedCareerBatter(batterId: number): Promise<CareerBatterStat | null> {
  const cacheKey = String(batterId)
  const cached = careerBatterRequests.get(cacheKey)
  if (cached !== undefined) return cached

  const request = fetchCareerStats(batterId, 'hitting')
    .then((stat) => (stat !== null && !isCareerPitcher(stat) ? stat : null))
    .catch(() => null)
  careerBatterRequests.set(cacheKey, request)
  void request.then((stat) => {
    if (stat === null) careerBatterRequests.delete(cacheKey)
  })
  return request
}

export function preloadCareerMatchupStats(pitcherId: number, batterId: number): void {
  void fetchCachedCareerPitcher(pitcherId)
  void fetchCachedCareerBatter(batterId)
}

export function useCareerMatchupStats(
  pitcherId: number | null,
  batterId: number | null,
): CareerMatchupStats {
  const [stats, setStats] = useState<CareerMatchupStats>({ pitcher: null, batter: null })

  useEffect(() => {
    let active = true
    const pitcherRequest =
      pitcherId === null ? Promise.resolve(null) : fetchCachedCareerPitcher(pitcherId)
    const batterRequest =
      batterId === null ? Promise.resolve(null) : fetchCachedCareerBatter(batterId)

    void Promise.all([pitcherRequest, batterRequest]).then(([pitcher, batter]) => {
      if (!active) return
      setStats({
        pitcher: pitcher !== null && isCareerPitcher(pitcher) ? pitcher : null,
        batter: batter !== null && !isCareerPitcher(batter) ? batter : null,
      })
    })

    return () => {
      active = false
    }
  }, [pitcherId, batterId])

  return stats
}
