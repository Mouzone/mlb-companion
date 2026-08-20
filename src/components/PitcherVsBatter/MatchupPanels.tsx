import type { ReactElement } from 'react'
import type { HotColdZone, PitchArsenalItem, VsPlayerStat } from '../../api/types'
import { computeISO, computeKpct, parseStat } from '../../utils/sabermetrics'
import type { DataTableColumn, DataTableRow, StatTone } from '../ui'
import { EmptyPanel, PlayerAvatar, Stat, StatGrid } from '../ui'
import { extraStat, extraText } from './PvbCards'
import { Panel, SkeletonRows, TablePanel } from './PvbPanels'
import { compareTo, fixed, percent, rate3, rateText, whole } from './PvbShared'

/**
 * Panels composing the Matchup sub-tab. Every number here is read from a field
 * verified present in a live response; a field the endpoint does not publish is
 * dropped rather than rendered as a permanent placeholder.
 */

/**
 * A head-to-head average is only meaningful once the pair has met enough times,
 * so below this many plate appearances no benchmark is passed and the value
 * renders in plain ink — a one-for-one `.000` is a sample size, not a verdict.
 */
const MIN_TONE_PA = 10

export const SPLIT_COLUMNS: ReadonlyArray<DataTableColumn> = [
  { key: 'split', label: 'Split' },
  { key: 'faced', label: 'PA/BF', align: 'right' },
  { key: 'avg', label: 'AVG', align: 'right' },
  { key: 'ops', label: 'OPS', align: 'right' },
  { key: 'hr', label: 'HR', align: 'right' },
  { key: 'k', label: 'K', align: 'right' },
]

const ARSENAL_COLUMNS: ReadonlyArray<DataTableColumn> = [
  { key: 'pitch', label: 'Pitch' },
  { key: 'use', label: 'Use', align: 'right' },
  { key: 'velo', label: 'Velo', align: 'right' },
  { key: 'count', label: 'No.', align: 'right' },
]

/**
 * The minimum shape every split source shares. A pitching split reports
 * `battersFaced` where a hitting split reports `plateAppearances`, and a
 * pitcher's season line omits `ops` from its interface while still publishing
 * it, so both are read defensively rather than declared.
 */
export interface SplitLike {
  readonly avg: string
  readonly homeRuns: number
  readonly strikeOuts: number
}

export function splitRow(label: string, stat: SplitLike): DataTableRow {
  return {
    split: label,
    faced: whole(extraStat(stat, 'battersFaced') ?? extraStat(stat, 'plateAppearances')),
    avg: rateText(stat.avg),
    ops: rateText(extraText(stat, 'ops')),
    hr: whole(stat.homeRuns),
    k: whole(stat.strikeOuts),
  }
}

export interface MatchupSide {
  readonly personId: number
  readonly name: string
  readonly role: string
  readonly line: string
}

function Side({ side }: { readonly side: MatchupSide }): ReactElement {
  return (
    <div className="matchup-head__side">
      <PlayerAvatar personId={side.personId} name={side.name} size="lg" />
      <div className="matchup-head__ident">
        <span className="pvb-name">{side.name}</span>
        <span className="pvb-strap">{side.role}</span>
        <span className="matchup-head__line">{side.line}</span>
      </div>
    </div>
  )
}

export interface MatchupHeaderProps {
  readonly pitcher: MatchupSide
  readonly batter: MatchupSide
}

export function MatchupHeader({ pitcher, batter }: MatchupHeaderProps): ReactElement {
  return (
    <div className="matchup-head">
      <Side side={pitcher} />
      <span className="matchup-head__vs">vs</span>
      <Side side={batter} />
    </div>
  )
}

export interface H2HPanelProps {
  readonly title: string
  readonly meta?: string
  readonly stat: VsPlayerStat | null
  /** The batter's own season line, the only benchmark stated on this screen. */
  readonly benchmarkAvg: number | null
  readonly loading: boolean
  readonly emptyMessage: string
  readonly emptyHint?: string
}

export function H2HPanel({
  title,
  meta,
  stat,
  benchmarkAvg,
  loading,
  emptyMessage,
  emptyHint,
}: H2HPanelProps): ReactElement {
  if (stat === null || stat.plateAppearances === 0) {
    return (
      <Panel title={title} meta={meta}>
        {loading ? <SkeletonRows rows={3} /> : <EmptyPanel message={emptyMessage} hint={emptyHint} />}
      </Panel>
    )
  }

  const pa = stat.plateAppearances
  const verdict = compareTo(parseStat(stat.avg), pa >= MIN_TONE_PA ? benchmarkAvg : null, false)
  const tone: StatTone = verdict.tone

  return (
    <Panel title={title} meta={meta ?? `${String(pa)} PA`}>
      <StatGrid>
        <Stat label="PA" value={whole(pa)} />
        <Stat label="G" value={whole(stat.gamesPlayed)} />
        <Stat label="H" value={whole(stat.hits)} />
        <Stat label="AVG" value={`${rateText(stat.avg)}${verdict.mark}`} tone={tone} />
        <Stat label="OBP" value={rateText(stat.obp)} />
        <Stat label="SLG" value={rateText(stat.slg)} />
        <Stat label="OPS" value={rateText(stat.ops)} />
        <Stat label="ISO" value={rate3(computeISO(parseStat(stat.avg), parseStat(stat.slg)))} />
        <Stat label="HR" value={whole(stat.homeRuns)} />
        <Stat label="K" value={whole(stat.strikeOuts)} />
        <Stat label="BB" value={whole(stat.baseOnBalls)} />
        <Stat label="K%" value={percent(computeKpct(stat.strikeOuts, pa))} />
      </StatGrid>
    </Panel>
  )
}

export interface ArsenalFacedPanelProps {
  readonly arsenal: ReadonlyArray<PitchArsenalItem>
  readonly loading: boolean
}

export function ArsenalFacedPanel({ arsenal, loading }: ArsenalFacedPanelProps): ReactElement {
  const ranked = [...arsenal].sort((left, right) => right.percentage - left.percentage)
  return (
    <TablePanel
      title="Arsenal Faced"
      meta={`${String(ranked.length)} types`}
      columns={ARSENAL_COLUMNS}
      rows={ranked.map((item) => ({
        pitch: item.type.description,
        use: percent(item.percentage),
        velo: fixed(item.averageSpeed, 1),
        count: whole(item.count),
      }))}
      loading={loading}
      emptyMessage="No pitch-tracking data for this season"
      emptyHint="Arsenal appears once the pitcher has tracked pitches on record."
    />
  )
}

interface ZoneLine {
  readonly hot: number
  readonly cold: number
  readonly high: number | null
  readonly low: number | null
}

function zoneLine(zones: readonly HotColdZone[]): ZoneLine {
  const values = zones.map((zone) => zone.value).filter((value) => Number.isFinite(value))
  return {
    hot: zones.filter((zone) => zone.temp === 'hot').length,
    cold: zones.filter((zone) => zone.temp === 'cold').length,
    high: values.length > 0 ? Math.max(...values) : null,
    low: values.length > 0 ? Math.min(...values) : null,
  }
}

export interface ZoneEdgePanelProps {
  readonly batterZones: ReadonlyArray<HotColdZone>
  readonly pitcherZones: ReadonlyArray<HotColdZone>
  readonly loading: boolean
}

export function ZoneEdgePanel({
  batterZones,
  pitcherZones,
  loading,
}: ZoneEdgePanelProps): ReactElement {
  if (batterZones.length === 0 && pitcherZones.length === 0) {
    return (
      <Panel title="Zone Edge">
        {loading ? <SkeletonRows rows={2} /> : <EmptyPanel message="No zone data for this season" />}
      </Panel>
    )
  }

  const bat = zoneLine(batterZones)
  const pit = zoneLine(pitcherZones)

  return (
    <Panel
      title="Zone Edge"
      meta={`${String(batterZones.length)} / ${String(pitcherZones.length)} cells`}
    >
      <StatGrid>
        <Stat label="Bat hot" value={whole(bat.hot)} />
        <Stat label="Bat cold" value={whole(bat.cold)} />
        <Stat label="Bat max" value={rate3(bat.high)} />
        <Stat label="Bat min" value={rate3(bat.low)} />
        <Stat label="Opp hot" value={whole(pit.hot)} />
        <Stat label="Opp cold" value={whole(pit.cold)} />
        <Stat label="Opp max" value={rate3(pit.high)} />
        <Stat label="Opp min" value={rate3(pit.low)} />
      </StatGrid>
      <p className="canvas-caption">Bat = his average by zone · Opp = average allowed</p>
    </Panel>
  )
}
