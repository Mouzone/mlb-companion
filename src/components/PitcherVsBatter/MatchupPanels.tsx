import type { ReactElement } from 'react'
import type { HotColdZone, VsPlayerStat } from '../../api/types'
import { parseStat } from '../../utils/sabermetrics'
import type { DataTableColumn, DataTableRow, SegmentedOption, StatTone } from '../ui'
import { EmptyPanel, PlayerAvatar, Segmented, Stat, StatGrid } from '../ui'
import type { ColorCodedArsenalRow, HandednessFilter } from './ArsenalColorCoding'
import type { Cell } from './PvbCards'
import { extraStat, extraText } from './PvbCards'
import { Panel, SkeletonRows } from './PvbPanels'
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

/**
 * A split the active side does not publish. Emitted rather than skipped so the
 * table keeps the same six rows in both perspectives and toggling the side
 * never resizes the card.
 */
export function emptySplitRow(label: string): DataTableRow {
  return {
    split: label,
    faced: whole(null),
    avg: rateText(undefined),
    ops: rateText(undefined),
    hr: whole(null),
    k: whole(null),
  }
}

export interface MatchupSide {
  readonly personId: number
  readonly name: string
  readonly role: string
  readonly line: string
  /**
   * The scope's stat grid. When present it replaces the one-line summary, so a
   * scope that has numbers to show states them rather than compressing them
   * into a sentence.
   */
  readonly cells?: ReadonlyArray<Cell>
}

const PLACEHOLDER_CELL: Cell = { label: '', value: '', tone: 'muted' }
const PLACEHOLDER_CELLS: ReadonlyArray<Cell> = Array.from({ length: 8 }, () => PLACEHOLDER_CELL)

function Side({ side }: { readonly side: MatchupSide }): ReactElement {
  const cells = side.cells ?? []
  const display = cells.length > 0 ? cells : PLACEHOLDER_CELLS
  return (
    <div className="matchup-head__side">
      <PlayerAvatar personId={side.personId} name={side.name} size="lg" />
      <div className="matchup-head__ident">
        <span className="pvb-name">{side.name}</span>
        <span className="pvb-strap">{side.role}</span>
        <StatGrid className="matchup-head__stats" minColumnWidth={56}>
          {display.map((cell, i) => (
            <Stat
              key={cells.length > 0 ? cell.label : `ph-${i}`}
              label={cell.label}
              value={cell.value}
              tone={cell.tone}
              benchmark={cell.benchmark}
            />
          ))}
        </StatGrid>
      </div>
    </div>
  )
}

export interface MatchupHeaderProps {
  readonly pitcher: MatchupSide
  readonly batter: MatchupSide
  /** Label for the scope the statlines currently show, e.g. "This Game". */
  readonly scopeLabel: string
  /** Steps the scope one position back or forward through the cycle. */
  readonly onCycleScope: (direction: -1 | 1) => void
}

/**
 * The arrows are the only scope switch on this screen: cycling them rewrites
 * both statlines and every panel below, so the card states which scope it is
 * showing rather than leaving the reader to infer it from the numbers.
 */
export function MatchupHeader({
  pitcher,
  batter,
  scopeLabel,
  onCycleScope,
}: MatchupHeaderProps): ReactElement {
  return (
    <div className="matchup-head">
      <div className="matchup-head__scope">
        <button
          type="button"
          className="matchup-head__arrow"
          onClick={() => { onCycleScope(-1) }}
          aria-label="Previous scope"
        >
          &#8249;
        </button>
        <span className="matchup-head__scope-label">{scopeLabel}</span>
        <button
          type="button"
          className="matchup-head__arrow"
          onClick={() => { onCycleScope(1) }}
          aria-label="Next scope"
        >
          &#8250;
        </button>
      </div>
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
        <Stat label="AVG" value={`${rateText(stat.avg)}${verdict.mark}`} tone={tone} />
        <Stat label="OPS" value={rateText(stat.ops)} />
        <Stat label="H" value={whole(stat.hits)} />
        <Stat label="HR" value={whole(stat.homeRuns)} />
        <Stat label="K" value={whole(stat.strikeOuts)} />
        <Stat label="OBP" value={rateText(stat.obp)} />
        <Stat label="SLG" value={rateText(stat.slg)} />
        <Stat label="BB" value={whole(stat.baseOnBalls)} />
      </StatGrid>
    </Panel>
  )
}

const HANDEDNESS_OPTIONS: ReadonlyArray<SegmentedOption> = [
  { id: 'all', label: 'All' },
  { id: 'RHB', label: 'RHB' },
  { id: 'LHB', label: 'LHB' },
]

function metricToneClass(tone: StatTone): string {
  return tone === 'default' ? '' : `arsenal-cc__metric--${tone}`
}

export interface ArsenalFacedPanelProps {
  readonly rows: ReadonlyArray<ColorCodedArsenalRow>
  readonly loading: boolean
  /** "Arsenal" from the pitcher's side, "Arsenal Faced" from the batter's. */
  readonly title: string
  /** Names the scope the numbers describe, e.g. "This Game". */
  readonly scopeLabel: string
  /** Handedness only narrows a live game's pitches; a season line has no per-batter detail. */
  readonly showHandednessToggle: boolean
  readonly handedness: HandednessFilter
  readonly onHandednessChange: (handedness: HandednessFilter) => void
  readonly totalPitches: number
}

/**
 * The pitcher's mix as the batter meets it. Spin and break are tracked per
 * pitch, so they populate only in game scope; the season endpoint publishes
 * usage and velocity alone and those cells stay empty rather than invented.
 */
export function ArsenalFacedPanel({
  rows,
  loading,
  title,
  scopeLabel,
  showHandednessToggle,
  handedness,
  onHandednessChange,
  totalPitches,
}: ArsenalFacedPanelProps): ReactElement {
  const meta =
    totalPitches > 0 ? `${scopeLabel} \u00b7 ${String(totalPitches)} pitches` : scopeLabel

  return (
    <Panel title={title} meta={meta}>
      {showHandednessToggle ? (
        <Segmented
          options={HANDEDNESS_OPTIONS}
          activeId={handedness}
          onSelect={(id) => { onHandednessChange(id as HandednessFilter) }}
        />
      ) : null}
      {rows.length > 0 ? (
        <div className="arsenal-cc-scroll">
          <div className="arsenal-cc" role="table" aria-label={title}>
            <div className="arsenal-cc__head" role="row">
              <span role="columnheader">Pitch</span>
              <span role="columnheader">Use</span>
              <span role="columnheader">Velo</span>
              <span role="columnheader">Spin</span>
              <span role="columnheader">V-Brk</span>
              <span role="columnheader">H-Brk</span>
            </div>
            {rows.map((row) => (
              <div key={row.pitchType} className="arsenal-cc__row" role="row">
                <span className="arsenal-cc__name" role="rowheader">
                  {row.pitchDescription}
                </span>
                <span className="arsenal-cc__usage" role="cell">
                  {percent(row.usage, 0)}
                </span>
                <div className={`arsenal-cc__metric ${metricToneClass(row.velo.tone)}`} role="cell">
                  <span className="arsenal-cc__value">{fixed(row.velo.value, 1)}</span>
                  {row.velo.delta === null ? null : (
                    <span className="arsenal-cc__delta">{row.velo.delta}</span>
                  )}
                </div>
                <div className={`arsenal-cc__metric ${metricToneClass(row.spin.tone)}`} role="cell">
                  <span className="arsenal-cc__value">{fixed(row.spin.value, 0)}</span>
                  {row.spin.delta === null ? null : (
                    <span className="arsenal-cc__delta">{row.spin.delta}</span>
                  )}
                </div>
                <div className={`arsenal-cc__metric ${metricToneClass(row.breakVertical.tone)}`} role="cell">
                  <span className="arsenal-cc__value">{fixed(row.breakVertical.value, 1)}</span>
                  {row.breakVertical.delta === null ? null : (
                    <span className="arsenal-cc__delta">{row.breakVertical.delta}</span>
                  )}
                </div>
                <div className={`arsenal-cc__metric ${metricToneClass(row.breakHorizontal.tone)}`} role="cell">
                  <span className="arsenal-cc__value">{fixed(row.breakHorizontal.value, 1)}</span>
                  {row.breakHorizontal.delta === null ? null : (
                    <span className="arsenal-cc__delta">{row.breakHorizontal.delta}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : loading ? (
        <SkeletonRows rows={4} />
      ) : (
        <EmptyPanel
          message={`No arsenal data for ${scopeLabel.toLowerCase()}`}
          hint="Rows appear once there are tracked pitches on record."
        />
      )}
    </Panel>
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
