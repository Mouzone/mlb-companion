import { useState, useEffect, useCallback } from 'react'
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
}

const currentYear = new Date().getFullYear().toString()

export function usePlayerStats(
  batterId: number | null,
  pitcherId: number | null,
): PlayerStatsData {
  const [data, setData] = useState<PlayerStatsData>({
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
  })

  const fetchAll = useCallback(async () => {
    if (!batterId || !pitcherId) return
    setData((prev) => ({ ...prev, loading: true }))

    try {
      const [
        batterSeason,
        pitcherSeason,
        pitchArsenal,
        batterHotCold,
        pitcherHotCold,
        batterSplits,
        pitcherSplits,
        gameLog,
        vsPlayer,
        savantData,
      ] = await Promise.all([
        fetchSeasonStats(batterId, 'hitting', currentYear).catch(() => null),
        fetchSeasonStats(pitcherId, 'pitching', currentYear).catch(() => null),
        fetchPitchArsenal(pitcherId, currentYear).catch(() => []),
        fetchHotColdZones(batterId, 'hitting', currentYear).catch(() => []),
        fetchHotColdZones(pitcherId, 'pitching', currentYear).catch(() => []),
        fetchStatSplits(batterId, 'hitting', currentYear).catch(() => []),
        fetchStatSplits(pitcherId, 'pitching', currentYear).catch(() => []),
        fetchGameLog(batterId, currentYear).catch(() => []),
        fetchVsPlayer(batterId, pitcherId, currentYear).catch(() => null),
        fetchSavantBattedBalls(batterId, currentYear, 'batter').catch(() => []),
      ])

      setData({
        batterSeason: batterSeason as SeasonStat | null,
        pitcherSeason: pitcherSeason as PitcherSeasonStat | null,
        pitchArsenal,
        batterHotCold,
        pitcherHotCold,
        batterSplits,
        pitcherSplits,
        gameLog: gameLog.slice(0, 5),
        vsPlayer,
        savantData: savantData.filter((r: SavantBattedBall) => r.hc_x && r.hc_y),
        loading: false,
      })
    } catch {
      setData((prev) => ({ ...prev, loading: false }))
    }
  }, [batterId, pitcherId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return data
}
