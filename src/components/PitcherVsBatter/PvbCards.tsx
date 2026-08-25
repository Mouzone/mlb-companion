import type {
  PitcherSeasonStat,
  SeasonStat,
  StatSplit,
} from '../../api/types'
import { LEAGUE_ERA } from '../../utils/leagueConstants'
import {
  computeBBpct,
  computeERAplus,
  computeFIP,
  computeHR9,
  computeISO,
  computeKpct,
  ipToDecimal,
  parseStat,
} from '../../utils/sabermetrics'
import type { StatTone } from '../ui'
import type { StatBenchmark } from '../../utils/percentile'
import { compareTo, fixed, percent, rate3, rateText, whole } from './PvbShared'

/**
 * The Pitcher-vs-Batter card strip. Two cards — pitcher and batter — for the
 * scope the parent selected, so both are structurally identical and therefore
 * exactly the same height under `align-items: stretch`. That symmetry is what
 * removes the empty lower interior the old four-card carousel produced.
 */

export interface Cell {
  readonly label: string
  readonly value: string
  readonly tone?: StatTone
  readonly benchmark?: StatBenchmark
}

export interface PlatoonBlock {
  readonly title: string
  readonly cells: ReadonlyArray<Cell>
}

/**
 * Reads a key the frozen interfaces in `api/types.ts` do not declare. StatsAPI
 * publishes real columns those interfaces omit — `saves`, `totalBases`,
 * `groundOutsToAirouts`, `battersFaced` on a split — and iterating the entries
 * reaches them without a cast. Returns null when the endpoint genuinely does
 * not publish the key, so an absent stat renders as an em dash and is never
 * invented.
 */
export function extraStat(source: object, key: string): number | null {
  for (const [name, raw] of Object.entries(source)) {
    if (name !== key) continue
    return typeof raw === 'number' || typeof raw === 'string' ? parseStat(raw) : null
  }
  return null
}

/** The same reader for rate strings, which must keep their published form. */
export function extraText(source: object, key: string): string | undefined {
  for (const [name, raw] of Object.entries(source)) {
    if (name !== key) continue
    if (typeof raw === 'string') return raw
    return typeof raw === 'number' ? String(raw) : undefined
  }
  return undefined
}

/** ERA+ is indexed so that the league average is exactly 100. */
const ERA_PLUS_BASELINE = 100

export function pitcherSeasonCells(stat: PitcherSeasonStat, parkFactor: number): Cell[] {
  const innings = ipToDecimal(stat.inningsPitched)
  const battersFaced = stat.battersFaced ?? null
  const eraPlus = computeERAplus(parseStat(stat.era), LEAGUE_ERA, parkFactor)
  const verdict = compareTo(eraPlus, ERA_PLUS_BASELINE, false)
  return [
    { label: 'ERA', value: rateText(stat.era) },
    { label: 'WHIP', value: rateText(stat.whip) },
    { label: 'K%', value: percent(computeKpct(stat.strikeOuts, battersFaced)) },
    {
      label: 'FIP',
      value: fixed(
        computeFIP(stat.homeRuns, stat.baseOnBalls, stat.hitBatsmen ?? 0, stat.strikeOuts, innings),
        2,
      ),
    },
    { label: 'ERA+', value: `${whole(eraPlus)}${verdict.mark}`, tone: verdict.tone },
    { label: 'BB%', value: percent(computeBBpct(stat.baseOnBalls, battersFaced)) },
    { label: 'HR/9', value: fixed(computeHR9(stat.homeRuns, innings), 2) },
    { label: 'Opp AVG', value: rateText(stat.avg) },
    { label: 'SV', value: whole(extraStat(stat, 'saves')) },
  ]
}

/**
 * wRC+ and wOBA are absent. The batting endpoint publishes no wOBA, and the
 * Savant CSV only carries wOBA on batted balls — summing it would understate
 * the rate by excluding walks and strikeouts. Both cells are dropped rather
 * than filled with a number that does not mean what its label claims.
 */
export function batterSeasonCells(stat: SeasonStat): Cell[] {
  return [
    { label: 'AVG', value: rateText(stat.avg) },
    { label: 'OBP', value: rateText(stat.obp) },
    { label: 'SLG', value: rateText(stat.slg) },
    { label: 'OPS', value: rateText(stat.ops) },
    { label: 'ISO', value: rate3(computeISO(parseStat(stat.avg), parseStat(stat.slg))) },
    { label: 'HR', value: whole(stat.homeRuns) },
    { label: 'K%', value: percent(computeKpct(stat.strikeOuts, stat.plateAppearances)) },
    { label: 'BB%', value: percent(computeBBpct(stat.baseOnBalls, stat.plateAppearances)) },
    { label: 'BABIP', value: rateText(stat.babip) },
  ]
}

/**
 * The situational line for the handedness the player is about to face,
 * benchmarked against his own overall line in the grid directly above — the
 * only comparison stated on this card, and therefore the only coloured one
 * (DESIGN.md §2.3).
 */
export function platoonCells(
  split: StatSplit,
  avgBenchmark: number | null,
  opsBenchmark: number | null,
  lowerIsBetter: boolean,
  facedLabel: string,
): Cell[] {
  const avg = compareTo(parseStat(split.stat.avg), avgBenchmark, lowerIsBetter)
  const ops = compareTo(parseStat(split.stat.ops), opsBenchmark, lowerIsBetter)
  const faced = extraStat(split.stat, 'battersFaced') ?? extraStat(split.stat, 'plateAppearances')
  return [
    { label: 'AVG', value: `${rateText(split.stat.avg)}${avg.mark}`, tone: avg.tone },
    { label: 'OPS', value: `${rateText(split.stat.ops)}${ops.mark}`, tone: ops.tone },
    { label: 'K', value: whole(split.stat.strikeOuts) },
    { label: facedLabel, value: whole(faced) },
  ]
}
