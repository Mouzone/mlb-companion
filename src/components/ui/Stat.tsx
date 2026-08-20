import type { ReactElement, ReactNode } from 'react'
import type { StatBenchmark } from '../../utils/percentile'

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
  readonly benchmark?: StatBenchmark
  readonly align?: StatAlign
  readonly size?: StatSize
}

const EM_DASH = '—'

function isEmptyValue(value: ReactNode): boolean {
  return value === null || value === undefined || value === ''
}

function benchmarkBand(percentile: number): 1 | 2 | 3 | 4 | 5 {
  if (percentile < 20) return 1
  if (percentile < 40) return 2
  if (percentile < 60) return 3
  if (percentile < 80) return 4
  return 5
}

export function Stat({
  label,
  value,
  tone = 'default',
  benchmark,
  align = 'left',
  size = 'sm',
}: StatProps): ReactElement {
  const empty = isEmptyValue(value)
  const valueClass = [
    'ui-stat__value',
    `ui-stat__value--${size}`,
    empty ? 'ui-stat__value--empty' : `ui-stat__value--${tone}`,
  ].join(' ')
  const percentile = benchmark === undefined ? null : Math.round(benchmark.percentile)
  const benchmarkClass =
    benchmark === undefined ? '' : ` ui-stat--percentile-${benchmarkBand(benchmark.percentile)}`
  const benchmarkDescription =
    benchmark === undefined || percentile === null
      ? undefined
      : `${label}: ${String(value)}. P${percentile} among ${benchmark.sampleSize} ${benchmark.cohort}.`

  return (
    <div
      className={`ui-stat ui-stat--${align}${benchmarkClass}`}
      role={benchmarkDescription === undefined ? undefined : 'group'}
      aria-label={benchmarkDescription}
      title={benchmarkDescription}
    >
      <span className="ui-stat__heading">
        <span className="ui-stat__label">{label}</span>
        {percentile === null ? null : <span className="ui-stat__benchmark">P{percentile}</span>}
      </span>
      <span className={valueClass}>{empty ? EM_DASH : value}</span>
    </div>
  )
}

export default Stat
