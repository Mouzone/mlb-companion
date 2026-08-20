import type {
  CareerBatterStat,
  CareerPitcherStat,
  PitcherSeasonStat,
  SeasonStat,
} from '../../api/types'
import type {
  BenchmarkPlayerStat,
  BenchmarkScope,
  PitcherRole,
} from '../../api/benchmarks'
import {
  computeBBpct,
  computeFIP,
  computeHR9,
  computeISO,
  computeKpct,
  ipToDecimal,
  parseStat,
} from '../../utils/sabermetrics'
import { percentileBenchmark } from '../../utils/percentile'
import type { Cell } from './PvbCards'
import { extraStat } from './PvbCards'

type BatterStat = SeasonStat | CareerBatterStat
type PitcherStat = PitcherSeasonStat | CareerPitcherStat

interface MetricValue {
  readonly value: number | null
  readonly lowerIsBetter: boolean
}

export interface BatterBenchmarkContext<T extends BatterStat> {
  readonly scope: BenchmarkScope
  readonly cohort: ReadonlyArray<BenchmarkPlayerStat<T>>
}

export interface PitcherBenchmarkContext<T extends PitcherStat> {
  readonly scope: BenchmarkScope
  readonly role: PitcherRole
  readonly cohort: ReadonlyArray<BenchmarkPlayerStat<T>>
}

function perNine(count: number, innings: number): number | null {
  return innings === 0 ? null : (count / innings) * 9
}

function batterMetric(stat: BatterStat, label: string): MetricValue | null {
  switch (label) {
    case 'AVG':
      return { value: parseStat(stat.avg), lowerIsBetter: false }
    case 'OBP':
      return { value: parseStat(stat.obp), lowerIsBetter: false }
    case 'SLG':
      return { value: parseStat(stat.slg), lowerIsBetter: false }
    case 'OPS':
      return { value: parseStat(stat.ops), lowerIsBetter: false }
    case 'ISO':
      return {
        value: computeISO(parseStat(stat.avg), parseStat(stat.slg)),
        lowerIsBetter: false,
      }
    case 'BABIP':
      return { value: extraStat(stat, 'babip'), lowerIsBetter: false }
    case 'K%':
      return {
        value: computeKpct(stat.strikeOuts, stat.plateAppearances),
        lowerIsBetter: true,
      }
    case 'BB%':
      return {
        value: computeBBpct(stat.baseOnBalls, stat.plateAppearances),
        lowerIsBetter: false,
      }
    case 'HR':
      return { value: stat.homeRuns, lowerIsBetter: false }
    case 'RBI':
      return { value: stat.rbi, lowerIsBetter: false }
    case 'H':
      return { value: stat.hits, lowerIsBetter: false }
    case 'TB':
      return { value: extraStat(stat, 'totalBases'), lowerIsBetter: false }
    case '2B':
      return { value: extraStat(stat, 'doubles'), lowerIsBetter: false }
    default:
      return null
  }
}

function pitcherMetric(stat: PitcherStat, label: string): MetricValue | null {
  const innings = ipToDecimal(stat.inningsPitched)
  const battersFaced = stat.battersFaced ?? null

  switch (label) {
    case 'ERA':
    case 'ERA+':
      return { value: parseStat(stat.era), lowerIsBetter: true }
    case 'WHIP':
      return { value: parseStat(stat.whip), lowerIsBetter: true }
    case 'FIP':
      return {
        value: computeFIP(
          stat.homeRuns,
          stat.baseOnBalls,
          stat.hitBatsmen ?? 0,
          stat.strikeOuts,
          innings,
        ),
        lowerIsBetter: true,
      }
    case 'K%':
      return { value: computeKpct(stat.strikeOuts, battersFaced), lowerIsBetter: false }
    case 'BB%':
      return { value: computeBBpct(stat.baseOnBalls, battersFaced), lowerIsBetter: true }
    case 'K/9':
      return { value: perNine(stat.strikeOuts, innings), lowerIsBetter: false }
    case 'BB/9':
      return { value: perNine(stat.baseOnBalls, innings), lowerIsBetter: true }
    case 'HR/9':
      return { value: computeHR9(stat.homeRuns, innings), lowerIsBetter: true }
    case 'GO/AO':
      return { value: extraStat(stat, 'groundOutsToAirouts'), lowerIsBetter: false }
    case 'Opp AVG':
      return { value: parseStat(stat.avg), lowerIsBetter: true }
    case 'SV':
      return { value: extraStat(stat, 'saves'), lowerIsBetter: false }
    case 'H':
      return { value: stat.hits, lowerIsBetter: true }
    default:
      return null
  }
}

export function benchmarkBatterCells<T extends BatterStat>(
  cells: readonly Cell[],
  stat: T,
  context: BatterBenchmarkContext<T>,
): Cell[] {
  const cohortName = `active MLB batters (${context.scope})`
  return cells.map((cell) => {
    const metric = batterMetric(stat, cell.label)
    if (metric === null) return cell
    const cohortValues = context.cohort.flatMap(({ stat: candidate }) => {
      const candidateMetric = batterMetric(candidate, cell.label)
      return candidateMetric?.value === null || candidateMetric === null
        ? []
        : [candidateMetric.value]
    })
    const benchmark = percentileBenchmark(
      metric.value,
      cohortValues,
      metric.lowerIsBetter,
      cohortName,
    )
    return benchmark === undefined ? cell : { label: cell.label, value: cell.value, benchmark }
  })
}

export function benchmarkPitcherCells<T extends PitcherStat>(
  cells: readonly Cell[],
  stat: T,
  context: PitcherBenchmarkContext<T>,
): Cell[] {
  const roleName = context.role === 'starter' ? 'starting pitchers' : 'relief pitchers'
  const cohortName = `active MLB ${roleName} (${context.scope})`
  return cells.map((cell) => {
    const metric = pitcherMetric(stat, cell.label)
    if (metric === null) return cell
    const cohortValues = context.cohort.flatMap(({ stat: candidate }) => {
      const candidateMetric = pitcherMetric(candidate, cell.label)
      return candidateMetric?.value === null || candidateMetric === null
        ? []
        : [candidateMetric.value]
    })
    const benchmark = percentileBenchmark(
      metric.value,
      cohortValues,
      metric.lowerIsBetter,
      cohortName,
    )
    return benchmark === undefined ? cell : { label: cell.label, value: cell.value, benchmark }
  })
}
