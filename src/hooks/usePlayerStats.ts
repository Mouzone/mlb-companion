import { useEffect, useState } from 'react'
import {
  fetchSeasonStats,
  fetchPitchArsenal,
  fetchHotColdZones,
  fetchStatSplits,
  fetchGameLog,
  fetchVsPlayer,
} from '../api/mlb'
import { fetchSavantBattedBalls } from '../api/savant'
import type {
  SeasonStat,
  PitcherSeasonStat,
  PitchArsenalItem,
  HotColdZone,
  StatSplit,
  GameLogEntry,
  VsPlayerStat,
  SavantBattedBall,
} from '../api/types'

interface PlayerStatsData {
  batterSeason: SeasonStat | null
  pitcherSeason: PitcherSeasonStat | null
  pitchArsenal: PitchArsenalItem[]
  batterHotCold: HotColdZone[]
  pitcherHotCold: HotColdZone[]
  batterSplits: StatSplit[]
  pitcherSplits: StatSplit[]
  gameLog: GameLogEntry[]
  vsPlayer: VsPlayerStat | null
  savantData: SavantBattedBall[]
  loading: boolean
  pitcherLoading: boolean
  batterLoading: boolean
}

const currentYear = new Date().getFullYear().toString()

const EMPTY_PLAYER_STATS: PlayerStatsData = {
  batterSeason: null,
  pitcherSeason: null,
  pitchArsenal: [],
  batterHotCold: [],
  pitcherHotCold: [],
  batterSplits: [],
  pitcherSplits: [],
  gameLog: [],
  vsPlayer: null,
  savantData: [],
  loading: false,
  pitcherLoading: false,
  batterLoading: false,
}

interface PitcherBundle {
  pitcherSeason: PitcherSeasonStat | null
  pitchArsenal: PitchArsenalItem[]
  pitcherHotCold: HotColdZone[]
  pitcherSplits: StatSplit[]
}

interface BatterBundle {
  batterSeason: SeasonStat | null
  batterHotCold: HotColdZone[]
  batterSplits: StatSplit[]
  gameLog: GameLogEntry[]
  savantData: SavantBattedBall[]
}

const pitcherBundleRequests = new Map<string, Promise<PitcherBundle>>()
const batterBundleRequests = new Map<string, Promise<BatterBundle>>()
const vsPlayerRequests = new Map<string, Promise<VsPlayerStat | null>>()

function fetchPitcherBundle(pitcherId: number): Promise<PitcherBundle> {
  const cacheKey = `${currentYear}:${pitcherId}`
  const cached = pitcherBundleRequests.get(cacheKey)
  if (cached !== undefined) return cached

  const request = Promise.all([
    fetchSeasonStats(pitcherId, 'pitching', currentYear).catch(() => null),
    fetchPitchArsenal(pitcherId, currentYear).catch(() => []),
    fetchHotColdZones(pitcherId, 'pitching', currentYear).catch(() => []),
    fetchStatSplits(pitcherId, 'pitching', currentYear).catch(() => []),
  ]).then(([pitcherSeason, pitchArsenal, pitcherHotCold, pitcherSplits]): PitcherBundle => ({
    pitcherSeason: pitcherSeason as PitcherSeasonStat | null,
    pitchArsenal,
    pitcherHotCold,
    pitcherSplits,
  }))

  pitcherBundleRequests.set(cacheKey, request)
  // Each constituent fetch already swallows its own error, so the bundle never
  // rejects. Evict on a fully-empty result instead, otherwise a bundle first
  // requested while offline stays empty for the entire session.
  void request.then((bundle) => {
    if (bundle.pitcherSeason === null && bundle.pitchArsenal.length === 0) {
      pitcherBundleRequests.delete(cacheKey)
    }
  })
  return request
}

function fetchBatterBundle(batterId: number): Promise<BatterBundle> {
  const cacheKey = `${currentYear}:${batterId}`
  const cached = batterBundleRequests.get(cacheKey)
  if (cached !== undefined) return cached

  const request = Promise.all([
    fetchSeasonStats(batterId, 'hitting', currentYear).catch(() => null),
    fetchHotColdZones(batterId, 'hitting', currentYear).catch(() => []),
    fetchStatSplits(batterId, 'hitting', currentYear).catch(() => []),
    fetchGameLog(batterId, currentYear).catch(() => []),
    fetchSavantBattedBalls(batterId, currentYear, 'batter').catch(() => []),
  ]).then(([batterSeason, batterHotCold, batterSplits, gameLog, savantData]): BatterBundle => ({
    batterSeason: batterSeason as SeasonStat | null,
    batterHotCold,
    batterSplits,
    gameLog: gameLog.slice(0, 5),
    savantData: savantData.filter((result) => result.hc_x && result.hc_y),
  }))

  batterBundleRequests.set(cacheKey, request)
  void request.then((bundle) => {
    if (bundle.batterSeason === null && bundle.gameLog.length === 0) {
      batterBundleRequests.delete(cacheKey)
    }
  })
  return request
}

function fetchVsPlayerCached(batterId: number, pitcherId: number): Promise<VsPlayerStat | null> {
  const cacheKey = `${currentYear}:${batterId}:${pitcherId}`
  const cached = vsPlayerRequests.get(cacheKey)
  if (cached !== undefined) return cached

  const request = fetchVsPlayer(batterId, pitcherId, currentYear).catch(() => null)
  vsPlayerRequests.set(cacheKey, request)
  void request.then((stat) => {
    if (stat === null) vsPlayerRequests.delete(cacheKey)
  })
  return request
}

export function preloadPlayerStats(batterId: number, pitcherId: number): void {
  void fetchPitcherBundle(pitcherId)
  void fetchBatterBundle(batterId)
  void fetchVsPlayerCached(batterId, pitcherId)
}

export function usePlayerStats(
  batterId: number | null,
  pitcherId: number | null,
): PlayerStatsData {
  const [data, setData] = useState<PlayerStatsData>(EMPTY_PLAYER_STATS)

  useEffect(() => {
    if (batterId === null || pitcherId === null) {
      setData(EMPTY_PLAYER_STATS)
      return
    }

    let active = true

    setData((prev) => ({
      ...prev,
      loading: true,
      pitcherLoading: true,
      batterLoading: true,
    }))

    const pitcherP = fetchPitcherBundle(pitcherId).then((bundle) => {
      if (!active) return
      setData((prev) => ({
        ...prev,
        ...bundle,
        pitcherLoading: false,
        loading: prev.batterLoading,
      }))
    })

    const batterP = fetchBatterBundle(batterId).then((bundle) => {
      if (!active) return
      setData((prev) => ({
        ...prev,
        ...bundle,
        batterLoading: false,
        loading: prev.pitcherLoading,
      }))
    })

    const vsP = fetchVsPlayerCached(batterId, pitcherId).then((vsPlayer) => {
      if (!active) return
      setData((prev) => ({ ...prev, vsPlayer }))
    })

    void Promise.all([pitcherP, batterP, vsP]).then(() => {
      if (!active) return
      setData((prev) => ({ ...prev, loading: false, pitcherLoading: false, batterLoading: false }))
    })

    return () => {
      active = false
    }
  }, [batterId, pitcherId])

  return data
}
