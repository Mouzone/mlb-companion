import type { ReactElement } from 'react'
import type { GameLogEntry, PitchArsenalItem, PitcherSeasonStat, StatSplit } from '../../api/types'
import { LEAGUE_ERA } from '../../utils/leagueConstants'
import {
  computeBBpct,
  computeERAplus,
  computeFIP,
  computeHR9,
  computeKpct,
  ipToDecimal,
  parseStat,
} from '../../utils/sabermetrics'
import { ArsenalBars } from '../Canvas/ArsenalBars'
import type { DataTableColumn, DataTableRow } from '../ui'
import { EmptyPanel, Stat, StatGrid } from '../ui'
import { Panel, SkeletonRows, TablePanel } from './PvbPanels'
import { compareTo, fixed, percent, rate3, rateText, ratio, sumOptional, whole } from './PvbShared'

/** Pitching aggregation, table shapes, and the two pitcher-only panels. */

export const SPLIT_COLUMNS: ReadonlyArray<DataTableColumn> = [
  { key: 'split', label: 'Split' },
  { key: 'ab', label: 'AB', align: 'right' },
  { key: 'h', label: 'H', align: 'right' },
  { key: 'avg', label: 'AVG', align: 'right' },
  { key: 'hr', label: 'HR', align: 'right' },
  { key: 'k', label: 'K', align: 'right' },
  { key: 'bb', label: 'BB', align: 'right' },
]

export const LOG_COLUMNS: ReadonlyArray<DataTableColumn> = [
  { key: 'date', label: 'Date' },
  { key: 'ip', label: 'IP', align: 'right' },
  { key: 'h', label: 'H', align: 'right' },
  { key: 'er', label: 'ER', align: 'right' },
  { key: 'bb', label: 'BB', align: 'right' },
  { key: 'k', label: 'K', align: 'right' },
]

const ARSENAL_COLUMNS: ReadonlyArray<DataTableColumn> = [
  { key: 'pitch', label: 'Pitch' },
  { key: 'use', label: 'Use', align: 'right' },
  { key: 'velo', label: 'Velo', align: 'right' },
  { key: 'count', label: 'No.', align: 'right' },
]

export interface PitchLine {
  readonly games: number
  readonly innings: number
  readonly hits: number
  readonly earnedRuns: number
  readonly strikeOuts: number
  readonly baseOnBalls: number
  readonly homeRuns: number
  readonly atBats: number | null
  readonly era: number | null
  readonly whip: number | null
  readonly avg: number | null
  readonly k9: number | null
  readonly bb9: number | null
}

export function aggregate(entries: readonly GameLogEntry[]): PitchLine {
  let innings = 0
  let hits = 0
  let earnedRuns = 0
  let strikeOuts = 0
  let baseOnBalls = 0
  let homeRuns = 0

  for (const entry of entries) {
    const ip = entry.stat.inningsPitched
    if (ip !== undefined) innings += ipToDecimal(ip)
    hits += entry.stat.hits
    earnedRuns += entry.stat.earnedRuns ?? 0
    baseOnBalls += entry.stat.baseOnBalls ?? 0
    strikeOuts += entry.stat.strikeOuts
    homeRuns += entry.stat.homeRuns
  }

  const total = Number(innings.toFixed(2))
  const perNine = (value: number): number | null => (total > 0 ? (value * 9) / total : null)
  const atBats = sumOptional(entries, 'atBats')
  return {
    games: entries.length,
    innings: total,
    hits,
    earnedRuns,
    strikeOuts,
    baseOnBalls,
    homeRuns,
    atBats,
    era: perNine(earnedRuns),
    whip: total > 0 ? (hits + baseOnBalls) / total : null,
    avg: ratio(hits, atBats),
    k9: perNine(strikeOuts),
    bb9: perNine(baseOnBalls),
  }
}

export function situationRow(label: string, stat: StatSplit['stat']): DataTableRow {
  return {
    split: label,
    ab: String(stat.atBats),
    h: String(stat.hits),
    avg: rateText(stat.avg),
    hr: String(stat.homeRuns),
    k: String(stat.strikeOuts),
    bb: String(stat.baseOnBalls),
  }
}

export function lineRow(label: string, line: PitchLine): DataTableRow {
  return {
    split: label,
    ab: whole(line.atBats),
    h: String(line.hits),
    avg: rate3(line.avg),
    hr: String(line.homeRuns),
    k: String(line.strikeOuts),
    bb: String(line.baseOnBalls),
  }
}

export interface ArsenalPanelProps {
  readonly arsenal: ReadonlyArray<PitchArsenalItem>
  readonly loading: boolean
}

/** Bars for shape, table for the exact usage/velocity/count the bars cannot state. */
export function ArsenalPanel({ arsenal, loading }: ArsenalPanelProps): ReactElement {
  const ranked = [...arsenal].sort((a, b) => b.percentage - a.percentage)
  const totalPitches = ranked[0]?.totalPitches ?? 0

  return (
    <>
      <Panel
        title="Arsenal"
        meta={totalPitches > 0 ? `${String(totalPitches)} pitches` : undefined}
      >
        {ranked.length > 0 ? (
          <div className="arsenal-canvas">
            <ArsenalBars arsenal={ranked.slice(0, 5)} width={264} />
          </div>
        ) : loading ? (
          <SkeletonRows rows={3} />
        ) : (
          <EmptyPanel message="No pitch-tracking data for this season" />
        )}
      </Panel>

      <TablePanel
        title="Pitch Mix"
        meta={`${String(ranked.length)} types`}
        columns={ARSENAL_COLUMNS}
        rows={ranked.map((item) => ({
          pitch: item.type.description,
          use: percent(item.percentage),
          velo: fixed(item.averageSpeed, 1),
          count: String(item.count),
        }))}
        loading={loading}
        emptyMessage="No pitch mix recorded"
      />
    </>
  )
}

export interface SeasonRatesPanelProps {
  readonly season: PitcherSeasonStat | null
  readonly parkFactor: number
}

/**
 * Derived season rates. FIP and ERA+ are the only coloured values here because
 * they are the only ones measured against a stated benchmark — league ERA and
 * the 100 baseline — and both print that benchmark in the neighbouring cell.
 */
export function SeasonRatesPanel({ season, parkFactor }: SeasonRatesPanelProps): ReactElement {
  const innings = season ? ipToDecimal(season.inningsPitched) : null
  const battersFaced = season?.battersFaced ?? null
  const fip = computeFIP(
    season?.homeRuns ?? null,
    season?.baseOnBalls ?? null,
    season?.hitBatsmen ?? null,
    season?.strikeOuts ?? null,
    innings,
  )
  const eraPlus = computeERAplus(parseStat(season?.era ?? ''), LEAGUE_ERA, parkFactor)
  const fipVerdict = compareTo(fip, LEAGUE_ERA, true)
  const eraPlusVerdict = compareTo(eraPlus, 100, false)

  return (
    <Panel title="Season Rates" meta={`park ${parkFactor.toFixed(2)}`}>
      {season === null ? (
        <EmptyPanel message="No season line published for this pitcher" />
      ) : (
        <StatGrid>
          <Stat label="FIP" value={`${fixed(fip, 2)}${fipVerdict.mark}`} tone={fipVerdict.tone} />
          <Stat label="Lg ERA" value={LEAGUE_ERA.toFixed(2)} />
          <Stat
            label="ERA+"
            value={`${whole(eraPlus)}${eraPlusVerdict.mark}`}
            tone={eraPlusVerdict.tone}
          />
          <Stat label="Lg ERA+" value="100" />
          <Stat label="K%" value={percent(computeKpct(season.strikeOuts, battersFaced))} />
          <Stat label="BB%" value={percent(computeBBpct(season.baseOnBalls, battersFaced))} />
          <Stat label="HR/9" value={fixed(computeHR9(season.homeRuns, innings), 2)} />
          <Stat label="Opp AVG" value={rateText(season.avg)} />
          <Stat label="BF" value={whole(battersFaced)} />
          <Stat label="HBP" value={whole(season.hitBatsmen ?? null)} />
          <Stat label="H" value={whole(season.hits)} />
          <Stat label="G" value={whole(season.gamesPlayed)} />
        </StatGrid>
      )}
    </Panel>
  )
}
