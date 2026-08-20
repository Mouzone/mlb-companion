import type { ReactElement } from 'react'
import type { SavantBattedBall } from '../../api/types'
import { computeGBpct, parseStat } from '../../utils/sabermetrics'
import { SprayChart } from '../Canvas/SprayChart'
import { EmptyPanel, Stat, StatGrid } from '../ui'
import { Panel, SkeletonRows } from './PvbPanels'
import { fixed, percent, rate3, whole } from './PvbShared'

/**
 * Statcast read-out for the batted balls the spray chart plots. Every number
 * here comes from a column verified present in the Savant CSV; nothing is
 * benchmarked, so nothing is coloured (DESIGN.md §2.3).
 */

/** Statcast's own hard-hit threshold, in mph. */
const HARD_HIT_MPH = 95

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function column(rows: readonly SavantBattedBall[], key: keyof SavantBattedBall): number[] {
  const out: number[] = []
  for (const row of rows) {
    const parsed = parseStat(row[key] ?? '')
    if (parsed !== null) out.push(parsed)
  }
  return out
}

export interface SprayPanelProps {
  readonly data: ReadonlyArray<SavantBattedBall>
  readonly loading: boolean
}

export function SprayPanel({ data, loading }: SprayPanelProps): ReactElement {
  if (data.length === 0) {
    return (
      <Panel title="Batted Balls">
        {loading ? (
          <SkeletonRows rows={3} />
        ) : (
          <EmptyPanel
            message="No tracked batted balls"
            hint="Statcast search lags roughly a day and covers the last 60 days."
          />
        )}
      </Panel>
    )
  }

  const exitVelos = column(data, 'launch_speed')
  const groundBalls = data.filter((row) => row.bb_type === 'ground_ball').length
  const barrels = exitVelos.filter((velo) => velo >= HARD_HIT_MPH).length

  return (
    <Panel title="Batted Balls" meta={`${String(data.length)} tracked`}>
      <div className="spray-canvas">
        <SprayChart data={[...data]} width={264} height={200} />
      </div>
      <p className="canvas-caption">Landing spots for every tracked batted ball</p>
      <StatGrid>
        <Stat label="Avg EV" value={fixed(mean(exitVelos), 1)} />
        <Stat label="Max EV" value={fixed(exitVelos.length > 0 ? Math.max(...exitVelos) : null, 1)} />
        <Stat label="Avg LA" value={fixed(mean(column(data, 'launch_angle')), 1)} />
        <Stat
          label="Hard hit"
          value={percent(exitVelos.length > 0 ? (barrels / exitVelos.length) * 100 : null, 0)}
        />
        <Stat label="GB%" value={percent(computeGBpct(groundBalls, data.length), 0)} />
        <Stat label="Avg dist" value={whole(mean(column(data, 'hit_distance_sc')))} />
        <Stat label="xwOBAcon" value={rate3(mean(column(data, 'estimated_woba_using_speedangle')))} />
        <Stat label="BBE" value={String(data.length)} />
      </StatGrid>
    </Panel>
  )
}
