import type { SavantGamePitch } from '../../api/types'
import type { StatTone } from '../ui'

/**
 * Baselines for the Last Pitch strip.
 *
 * Velocity has a true season baseline: Savant ships `avg_pitch_speed` per pitch
 * type on every game-feed row. Spin, vertical break and extension have no
 * season feed in this app, so they fall back to the pitcher's own average for
 * that pitch type *in this game*. Comparing a pitch to the same pitcher's other
 * pitches of the same type is the honest read available client-side, and it is
 * the comparison that actually answers "did he get that one".
 */

export interface MetricBaseline {
  readonly baseline: number | null
  /** True when `baseline` came from the season average rather than this game. */
  readonly isSeason: boolean
}

export interface PitchBaselines {
  readonly velo: MetricBaseline
  readonly spin: MetricBaseline
  readonly breakVertical: MetricBaseline
  readonly extension: MetricBaseline
}

const EMPTY_METRIC: MetricBaseline = { baseline: null, isSeason: false }

export const EMPTY_BASELINES: PitchBaselines = {
  velo: EMPTY_METRIC,
  spin: EMPTY_METRIC,
  breakVertical: EMPTY_METRIC,
  extension: EMPTY_METRIC,
}

/** Deviation below which a pitch reads as "same as usual" rather than up or down. */
const DEAD_BAND = {
  velo: 0.8,
  spin: 75,
  breakVertical: 1.5,
  extension: 0.15,
} as const

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  let total = 0
  for (const value of values) total += value
  return total / values.length
}

function seasonVeloFor(rows: readonly SavantGamePitch[], pitchType: string): number | null {
  for (const row of rows) {
    const entry = row.avg_pitch_speed?.find((item) => item.pitch_type === pitchType)
    const parsed = parseNumber(entry?.avg_pitch_speed)
    if (parsed !== null) return parsed
  }
  return null
}

/**
 * Build per-metric baselines for `pitchType`. Excludes `excludePlayId` so the
 * pitch being judged never inflates its own baseline — with three sliders in
 * the book, including the current one drags the mean a third of the way toward
 * whatever it is measuring.
 */
export function derivePitchBaselines(
  rows: readonly SavantGamePitch[],
  pitchType: string | undefined,
  excludePlayId: string | null,
): PitchBaselines {
  if (pitchType === undefined || pitchType === '') return EMPTY_BASELINES

  const sameType = rows.filter(
    (row) => row.pitch_type === pitchType && row.play_id !== excludePlayId,
  )

  const spins: number[] = []
  const breaks: number[] = []
  const extensions: number[] = []
  const velos: number[] = []
  for (const row of sameType) {
    const spin = finite(row.spin_rate)
    if (spin !== null) spins.push(spin)
    const vertical = finite(row.breaks?.breakVertical)
    if (vertical !== null) breaks.push(vertical)
    const extension = finite(row.extension)
    if (extension !== null) extensions.push(extension)
    const velo = finite(row.start_speed)
    if (velo !== null) velos.push(velo)
  }

  const seasonVelo = seasonVeloFor(rows, pitchType)
  const gameVelo = mean(velos)

  return {
    velo:
      seasonVelo !== null
        ? { baseline: seasonVelo, isSeason: true }
        : { baseline: gameVelo, isSeason: false },
    spin: { baseline: mean(spins), isSeason: false },
    breakVertical: { baseline: mean(breaks), isSeason: false },
    extension: { baseline: mean(extensions), isSeason: false },
  }
}

export type MetricKey = keyof typeof DEAD_BAND

/**
 * Tone for a live reading against its baseline, from the PITCHER's point of
 * view: more velocity, more spin, more extension and more vertical break all
 * read as the pitcher executing. Vertical break is compared on magnitude
 * because the feed signs it by pitch family.
 */
export function toneFor(
  metric: MetricKey,
  actual: number | null | undefined,
  baseline: number | null,
): StatTone {
  const value = finite(actual)
  if (value === null || baseline === null) return 'default'

  const left = metric === 'breakVertical' ? Math.abs(value) : value
  const right = metric === 'breakVertical' ? Math.abs(baseline) : baseline
  const delta = left - right
  if (Math.abs(delta) < DEAD_BAND[metric]) return 'default'
  return delta > 0 ? 'positive' : 'negative'
}

/** Signed delta caption, e.g. `+1.4 vs szn`, or null when there is nothing to compare. */
export function deltaLabel(
  actual: number | null | undefined,
  { baseline, isSeason }: MetricBaseline,
  digits: number,
): string | null {
  const value = finite(actual)
  if (value === null || baseline === null) return null
  const delta = value - baseline
  const sign = delta >= 0 ? '+' : '−'
  return `${sign}${Math.abs(delta).toFixed(digits)} vs ${isSeason ? 'szn' : 'game'}`
}
