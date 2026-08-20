import type { ReactElement, ReactNode } from 'react'
import type { GameLogEntry, StatSplit } from '../../api/types'
import { parseStat } from '../../utils/sabermetrics'
import { PlayerAvatar } from '../ui'

/**
 * Vocabulary shared by the Pitching and Batting sub-tabs: value formatting,
 * defensive readers for the two API shapes whose types under-declare them, the
 * benchmark comparator, and the player identity header.
 */

export const EM_DASH = '\u2014'
const ARROW_UP = '\u25b2'
const ARROW_DOWN = '\u25bc'

/**
 * `.panel-split` hands every child `flex: 1 1 0`, which would stretch the
 * avatar's replaced box across half the row. `0 0 auto` restores its intrinsic
 * size; it carries no length, colour, or other token-bearing value.
 */
const AVATAR_SLOT = { flex: '0 0 auto' } as const

export type Tone = 'default' | 'positive' | 'negative'

export interface Verdict {
  readonly tone: Tone
  /** Direction glyph. DESIGN.md §7: colour is never the sole channel. */
  readonly mark: string
}

const FLAT: Verdict = { tone: 'default', mark: '' }

/**
 * DESIGN.md §2.3 — a stat is coloured ONLY against a stated benchmark. The
 * glyph reports DIRECTION (below / above the benchmark) and the tone reports
 * QUALITY, so the two channels stay independent and readable in grayscale.
 */
export function compareTo(
  value: number | null,
  benchmark: number | null,
  lowerIsBetter: boolean,
): Verdict {
  if (value === null || benchmark === null || value === benchmark) return FLAT
  const below = value < benchmark
  return {
    tone: (lowerIsBetter ? below : !below) ? 'positive' : 'negative',
    mark: below ? ARROW_DOWN : ARROW_UP,
  }
}

export function fixed(value: number | null, digits: number): string {
  return value === null ? EM_DASH : value.toFixed(digits)
}

export function whole(value: number | null): string {
  return value === null ? EM_DASH : String(Math.round(value))
}

/** Baseball rates print without the leading zero on every surface in the app. */
export function rate3(value: number | null): string {
  return value === null ? EM_DASH : value.toFixed(3).replace(/^0/, '')
}

export function signedRate3(value: number | null): string {
  if (value === null) return EM_DASH
  return `${value < 0 ? '-' : '+'}${Math.abs(value).toFixed(3).replace(/^0/, '')}`
}

export function percent(value: number | null, digits = 1): string {
  return value === null ? EM_DASH : `${value.toFixed(digits)}%`
}

/** StatsAPI rate strings arrive as `.207` or the sentinels `---` / `-.--`. */
export function rateText(value: string | undefined): string {
  if (value === undefined) return EM_DASH
  return parseStat(value) === null ? EM_DASH : value
}

/** ISO date to the compact `M/D` a dense game-log row can afford. */
export function monthDay(iso: string): string {
  const [, month, day] = iso.split('-')
  if (month === undefined || day === undefined) return iso
  return `${String(Number(month))}/${String(Number(day))}`
}

/**
 * `StatSplit.split` is typed as a string, but the endpoint returns
 * `{ code, description, sortOrder }`. Narrowing through `unknown` keeps both
 * shapes working without a cast.
 */
export function splitCode(split: StatSplit): string {
  const raw: unknown = split.split
  if (typeof raw === 'string') return raw.toLowerCase()
  if (typeof raw === 'object' && raw !== null && 'code' in raw) {
    const code: unknown = raw.code
    if (typeof code === 'string') return code.toLowerCase()
  }
  return ''
}

/**
 * Game-log and split stat blocks ship keys the interfaces do not declare
 * (`atBats` and `battersFaced` are both present on every pitching row). Read
 * them through a type guard — never through `as`, never as a guess: only keys
 * verified present in a live response are read this way.
 */
export function optionalStat(
  stat: Readonly<Record<string, unknown>>,
  key: string,
): number | null {
  const raw = stat[key]
  if (typeof raw === 'number' || typeof raw === 'string') return parseStat(raw)
  return null
}

export function atBatsOf(entry: GameLogEntry): number | null {
  return optionalStat(entry.stat, 'atBats')
}

/** Sums a defensively-read counter, returning null when no row supplied it. */
export function sumOptional(
  entries: readonly GameLogEntry[],
  key: string,
): number | null {
  let total = 0
  let seen = false
  for (const entry of entries) {
    const value = optionalStat(entry.stat, key)
    if (value === null) continue
    total += value
    seen = true
  }
  return seen ? total : null
}

export function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null
  return numerator / denominator
}

export interface PlayerIdentityProps {
  readonly personId: number
  readonly name: string
  /** Uppercase strap under the name — hand, position, team. */
  readonly role: string
  readonly children?: ReactNode
}

/**
 * Identity header. The name uses `.card-title` rather than `SectionTitle`
 * because DESIGN.md §3.3 puts player identity at `--fs-lg`, a full step above
 * the `--fs-title` a section heading gets — the two must not read alike.
 */
export function PlayerIdentity({
  personId,
  name,
  role,
  children,
}: PlayerIdentityProps): ReactElement {
  return (
    <div className="panel-row">
      <div className="panel-split">
        <div style={AVATAR_SLOT}>
          <PlayerAvatar personId={personId} name={name} size="md" />
        </div>
        <div>
          <div className="card-title">
            <span>{name}</span>
          </div>
          <span className="stat-label">{role}</span>
        </div>
      </div>
      {children}
    </div>
  )
}
