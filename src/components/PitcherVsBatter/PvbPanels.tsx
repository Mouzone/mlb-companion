import type { ReactElement, ReactNode } from 'react'
import type { HotColdZone } from '../../api/types'
import type { DataTableColumn, DataTableRow } from '../ui'
import { DataTable, EmptyPanel, SectionTitle, Skeleton, Stat, StatGrid } from '../ui'
import { HeatMap } from '../Canvas/HeatMap'
import { rate3 } from './PvbShared'

/**
 * Card shells shared by the Pitching and Batting sub-tabs. Every one of them
 * routes loading and no-data through `Skeleton` / `EmptyPanel` rather than a
 * bare string, and none declares a height (DESIGN.md §6.3).
 */

export interface PanelProps {
  readonly title: string
  readonly meta?: ReactNode
  readonly children: ReactNode
}

export function Panel({ title, meta, children }: PanelProps): ReactElement {
  return (
    <div className="subsection">
      <SectionTitle meta={meta}>{title}</SectionTitle>
      {children}
    </div>
  )
}

/**
 * Full-width shimmer rows. Returned as a fragment so each bar becomes a direct
 * flex child of the card and inherits the card's own `--sp-3` rhythm.
 */
export function SkeletonRows({ rows }: { readonly rows: number }): ReactElement {
  return (
    <>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} height="var(--sp-6)" />
      ))}
    </>
  )
}

export interface TablePanelProps {
  readonly title: string
  readonly meta?: ReactNode
  readonly columns: ReadonlyArray<DataTableColumn>
  readonly rows: ReadonlyArray<DataTableRow>
  readonly loading: boolean
  readonly emptyMessage: string
  readonly emptyHint?: string
  readonly skeletonRows?: number
}

export function TablePanel({
  title,
  meta,
  columns,
  rows,
  loading,
  emptyMessage,
  emptyHint,
  skeletonRows = 4,
}: TablePanelProps): ReactElement {
  return (
    <Panel title={title} meta={rows.length > 0 ? meta : undefined}>
      {rows.length > 0 ? (
        <DataTable columns={columns} rows={rows} dense />
      ) : loading ? (
        <SkeletonRows rows={skeletonRows} />
      ) : (
        <EmptyPanel message={emptyMessage} hint={emptyHint} />
      )}
    </Panel>
  )
}

export interface ZonePanelProps {
  readonly title: string
  readonly caption: string
  readonly zones: ReadonlyArray<HotColdZone>
  readonly loading: boolean
  readonly emptyMessage: string
  readonly perspective?: 'pitcher' | 'catcher'
}

/**
 * Hot/cold heatmap beside a numeric read-out of the same grid, so the chart is
 * never the only way to get the numbers (DESIGN.md §7 — canvas is not
 * accessible). No value here is benchmarked, so no value here is coloured.
 */
export function ZonePanel({
  title,
  caption,
  zones,
  loading,
  emptyMessage,
  perspective = 'pitcher',
}: ZonePanelProps): ReactElement {
  if (zones.length === 0) {
    return (
      <Panel title={title}>
        {loading ? <SkeletonRows rows={3} /> : <EmptyPanel message={emptyMessage} />}
      </Panel>
    )
  }

  const values = zones.map((zone) => zone.value)
  const hot = zones.filter((zone) => zone.temp === 'hot').length
  const cold = zones.filter((zone) => zone.temp === 'cold').length

  return (
    <Panel title={title} meta={`${String(zones.length)} zones`}>
      <div className="panel-split">
        <div className="heatmap-canvas">
          <HeatMap zones={[...zones]} size={150} perspective={perspective} />
        </div>
        <StatGrid>
          <Stat label="Hot" value={String(hot)} />
          <Stat label="Cold" value={String(cold)} />
          <Stat label="High" value={rate3(Math.max(...values))} />
          <Stat label="Low" value={rate3(Math.min(...values))} />
        </StatGrid>
      </div>
      <p className="canvas-caption">{caption}</p>
    </Panel>
  )
}
