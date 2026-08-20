import type { ReactElement, ReactNode } from 'react'

/**
 * Stat — label + value pair (DESIGN.md §5.1). The atom of the entire app.
 *
 * Label sits ABOVE the value, separated by --sp-1, and the two share a left
 * edge. The value is always heavier and at least 4px larger than its label so
 * the pair reads as a hierarchy rather than two equal lines.
 */

export type StatTone = 'default' | 'positive' | 'negative' | 'muted'
export type StatAlign = 'left' | 'right'

/** sm → --fs-data (the default readout size) · md → --fs-lg · lg → --fs-hero */
export type StatSize = 'sm' | 'md' | 'lg'

export interface StatProps {
  readonly label: string
  readonly value: ReactNode
  /**
   * Colour a value ONLY when it is being compared against a benchmark
   * (DESIGN.md §2.3). A plain `.000` is `default`, never `negative`.
   */
  readonly tone?: StatTone
  readonly align?: StatAlign
  readonly size?: StatSize
}

const EM_DASH = '—'

function isEmptyValue(value: ReactNode): boolean {
  return value === null || value === undefined || value === ''
}

export function Stat({
  label,
  value,
  tone = 'default',
  align = 'left',
  size = 'sm',
}: StatProps): ReactElement {
  const empty = isEmptyValue(value)
  const valueClass = [
    'ui-stat__value',
    `ui-stat__value--${size}`,
    empty ? 'ui-stat__value--empty' : `ui-stat__value--${tone}`,
  ].join(' ')

  return (
    <div className={`ui-stat ui-stat--${align}`}>
      <span className="ui-stat__label">{label}</span>
      <span className={valueClass}>{empty ? EM_DASH : value}</span>
    </div>
  )
}

export default Stat
