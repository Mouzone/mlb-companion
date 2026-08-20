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

export function useCareerMatchupStats(
  pitcherId: number | null,
  batterId: number | null,
): CareerMatchupStats {
  const [stats, setStats] = useState<CareerMatchupStats>({ pitcher: null, batter: null })

  useEffect(() => {
    let active = true
    const pitcherRequest =
      pitcherId === null
        ? Promise.resolve(null)
        : fetchCareerStats(pitcherId, 'pitching').catch(() => null)
    const batterRequest =
      batterId === null ? Promise.resolve(null) : fetchCareerStats(batterId, 'hitting').catch(() => null)

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
