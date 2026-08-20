import type { ReactElement, ReactNode } from 'react'
import { DataTable, EmptyPanel, PlayerAvatar, SectionTitle } from '../ui'
import type { DataTableColumn, DataTableRow } from '../ui'

/**
 * Card shells shared by the two in-game sub-tabs. Every one routes its no-data
 * state through `EmptyPanel` rather than a bare string, and none declares a
 * height (DESIGN.md §6.3).
 */

export interface GamePanelProps {
  readonly title: string
  readonly meta?: ReactNode
  readonly children: ReactNode
}

/** Bordered section. `.panel-row` owns the gutter, so content shares one edge. */
export function GamePanel({ title, meta, children }: GamePanelProps): ReactElement {
  return (
    <section className="panel-row">
      <SectionTitle meta={meta}>{title}</SectionTitle>
      {children}
    </section>
  )
}

export interface GameTablePanelProps {
  readonly title: string
  readonly meta?: ReactNode
  readonly columns: ReadonlyArray<DataTableColumn>
  readonly rows: ReadonlyArray<DataTableRow>
  readonly emptyMessage: string
  readonly emptyHint?: string
}

/**
 * A table that degrades to an honest `EmptyPanel` instead of a tall blank box
 * (DESIGN.md §6.3) — the early-game state these two tabs spend most of a game in.
 */
export function GameTablePanel({
  title,
  meta,
  columns,
  rows,
  emptyMessage,
  emptyHint,
}: GameTablePanelProps): ReactElement {
  return (
    <GamePanel title={title} meta={rows.length > 0 ? meta : undefined}>
      {rows.length > 0 ? (
        <DataTable columns={columns} rows={rows} dense />
      ) : (
        <EmptyPanel message={emptyMessage} hint={emptyHint} />
      )}
    </GamePanel>
  )
}

export interface GameIdentityProps {
  readonly personId: number
  readonly name: string
  /** Uppercase strap under the name — hand or bat side, plus the game line. */
  readonly role: string
  readonly children?: ReactNode
}

/**
 * Identity header. The name is `--fs-lg` per DESIGN.md §3.3 — a full step above
 * the `--fs-title` a section heading gets, so the two never read alike.
 */
export function GameIdentity({
  personId,
  name,
  role,
  children,
}: GameIdentityProps): ReactElement {
  return (
    <section className="panel-row">
      <div className="game-identity">
        <PlayerAvatar personId={personId} name={name} size="md" />
        <div className="game-identity__text">
          <span className="game-identity__name">{name}</span>
          <span className="game-identity__role">{role}</span>
        </div>
      </div>
      {children}
    </section>
  )
}

/**
 * Canvas is not accessible (DESIGN.md §7), so the chart carries `role="img"`
 * with a descriptive label AND prints its summary as ordinary visible text
 * inside the same figure.
 *
 * The summary is deliberately NOT a clipped `.a11y-only` node. That pattern is
 * `position: absolute` with no positioned ancestor, so inside a tall scrolling
 * panel it resolves against the initial containing block and stretches the
 * document — measured at 927px against an 844px viewport, which handed the
 * screen a second scroll owner on `<html>`. A visible caption also satisfies
 * §1.6: the reader gets the numbers without having to decode the plot.
 */
export function ChartFrame({
  label,
  caption,
  children,
}: {
  readonly label: string
  readonly caption: string
  readonly children: ReactNode
}): ReactElement {
  return (
    <figure className="zone-figure" role="img" aria-label={label}>
      {children}
      <figcaption className="canvas-caption">{caption}</figcaption>
    </figure>
  )
}
