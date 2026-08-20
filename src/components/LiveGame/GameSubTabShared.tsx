import type { CSSProperties, ReactElement } from 'react'
import type { CurrentPlay, PlayEvent } from '../../api/types'

/**
 * Vocabulary shared by the two in-game sub-tabs: pitch-outcome classification,
 * the rate maths built on top of it, value formatting, and the pitch-identity
 * cells. The card shells live beside this in `GameSubTabPanels`.
 *
 * Everything here reads the live feed ONLY. No value is invented: a rate whose
 * denominator is zero returns `null` and renders as an em dash.
 */

/** Rendered wherever the feed genuinely has no value — never a zero stand-in. */
export const NO_VALUE = '\u2014'

type StyleWithVars = CSSProperties & Record<`--${string}`, string>

/* --- Pitch outcome -------------------------------------------------------- */

export type PitchOutcome = 'ball' | 'called' | 'whiff' | 'foul' | 'inplay'

/**
 * Gameday `details.call.code` values observed in a full live feed:
 * `B`/`*B` ball, `C` called strike, `S`/`W` swinging strike (blocked),
 * `T` foul tip, `F` foul, `X`/`D`/`E` in play.
 *
 * Only `C` and the swing-and-miss trio are matched by code. Every remaining
 * strike is classified as a foul by ELIMINATION rather than by an unverified
 * code list — a strike that was neither taken nor swung through can only be a
 * foul under the rules, so no Gameday code has to be guessed at.
 */
const MISS_CALLS: ReadonlySet<string> = new Set(['S', 'W', 'T', 'M'])

export function outcomeOf(event: PlayEvent): PitchOutcome {
  const { details } = event
  if (details.isInPlay) return 'inplay'
  if (details.isBall) return 'ball'
  const code = details.call?.code ?? ''
  if (code === 'C') return 'called'
  if (MISS_CALLS.has(code)) return 'whiff'
  return 'foul'
}

export interface PitchSplit {
  readonly total: number
  readonly balls: number
  readonly called: number
  readonly whiffs: number
  readonly fouls: number
  readonly inPlay: number
  /** A pitch is a strike when it is not a ball — balls in play included. */
  readonly strikes: number
  readonly swings: number
  readonly inZone: number
  /** Pitches carrying a `pitchData.zone`, i.e. the zone-rate denominator. */
  readonly zoned: number
  readonly chases: number
  readonly outOfZone: number
}

const ZERO_SPLIT: PitchSplit = {
  total: 0,
  balls: 0,
  called: 0,
  whiffs: 0,
  fouls: 0,
  inPlay: 0,
  strikes: 0,
  swings: 0,
  inZone: 0,
  zoned: 0,
  chases: 0,
  outOfZone: 0,
}

/** Gameday numbers the nine strike-zone cells 1-9; 11-14 are the shadow zones. */
function inStrikeZone(event: PlayEvent): boolean | null {
  const zone = event.pitchData?.zone
  if (zone === undefined || !Number.isFinite(zone)) return null
  return zone >= 1 && zone <= 9
}

export function splitPitches(pitches: readonly PlayEvent[]): PitchSplit {
  const split = { ...ZERO_SPLIT }

  for (const pitch of pitches) {
    split.total += 1
    const outcome = outcomeOf(pitch)
    const swung = outcome === 'whiff' || outcome === 'foul' || outcome === 'inplay'

    if (outcome === 'ball') split.balls += 1
    else split.strikes += 1
    if (outcome === 'called') split.called += 1
    if (outcome === 'whiff') split.whiffs += 1
    if (outcome === 'foul') split.fouls += 1
    if (outcome === 'inplay') split.inPlay += 1
    if (swung) split.swings += 1

    const zoned = inStrikeZone(pitch)
    if (zoned === null) continue
    split.zoned += 1
    if (zoned) split.inZone += 1
    else {
      split.outOfZone += 1
      if (swung) split.chases += 1
    }
  }

  return split
}

/* --- Numbers -------------------------------------------------------------- */

export function rateOf(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : (numerator / denominator) * 100
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function speedsOf(pitches: readonly PlayEvent[]): number[] {
  const speeds: number[] = []
  for (const pitch of pitches) {
    const speed = pitch.pitchData?.startSpeed
    if (speed !== undefined && Number.isFinite(speed)) speeds.push(speed)
  }
  return speeds
}

export function percent(value: number | null, digits = 0): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(digits)}%`
    : NO_VALUE
}

export function fixed(value: number | null | undefined, digits: number, unit = ''): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE
  return `${value.toFixed(digits)}${unit}`
}

export function signed(value: number | null, digits: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return NO_VALUE
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`
}

/** Outs are `X.Y` innings in every box score: 7 outs is 2.1 innings pitched. */
export function inningsPitched(outs: number): string {
  return `${String(Math.floor(outs / 3))}.${String(outs % 3)}`
}

const ORDINALS: readonly string[] = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

export function ordinal(n: number): string {
  return ORDINALS[n - 1] ?? `${String(n)}th`
}

const TRAJECTORY_ABBR: Readonly<Record<string, string>> = {
  fly_ball: 'FLY',
  ground_ball: 'GB',
  line_drive: 'LD',
  popup: 'POP',
  bunt_grounder: 'B-GB',
  bunt_popup: 'B-POP',
  bunt_line_drive: 'B-LD',
}

export function trajectoryLabel(raw: string | undefined): string {
  if (raw === undefined || raw === '') return NO_VALUE
  return TRAJECTORY_ABBR[raw] ?? raw
}

/**
 * The live feed ships a per-pitch UUID (`playId`) that the frozen PlayEvent type
 * does not declare. Read it through `unknown` rather than widening the type.
 */
export function playIdOf(event: PlayEvent): string | null {
  const playId: unknown = Reflect.get(event, 'playId')
  return typeof playId === 'string' ? playId : null
}

export function pitchesOf(plays: readonly CurrentPlay[]): PlayEvent[] {
  return plays.flatMap((play) => play.playEvents.filter((event) => event.isPitch))
}

/* --- Pitch identity colour ------------------------------------------------ */

/**
 * DOM colour must resolve to a token (DESIGN.md §2), so the pitch palette is
 * addressed by its `--c-pitch-*` custom properties here. Canvas renderers take
 * the same hues from `utils/chartTheme` instead, because a 2D context cannot
 * read a custom property.
 */
const PITCH_TOKENS: ReadonlySet<string> = new Set([
  'ff', 'si', 'fc', 'sl', 'st', 'cu', 'kc', 'sv', 'ch', 'fs', 'fo', 'kn', 'ep',
])

export function pitchColorVar(code: string): string {
  const key = code.toLowerCase()
  // `SC` is the retired screwball code that `SV` replaced; they share a hue.
  const token = key === 'sc' ? 'sv' : key
  return PITCH_TOKENS.has(token) ? `var(--c-pitch-${token})` : 'var(--c-pitch-unknown)'
}

/**
 * Pitch code beside its identity swatch. DESIGN.md §7: a pitch type never
 * relies on hue alone, so the code is always printed next to the colour.
 */
export function PitchCode({ code }: { readonly code: string }): ReactElement {
  const style: StyleWithVars = { '--mix-color': pitchColorVar(code) }
  return (
    <span className="mix-code">
      <span className="mix-swatch" style={style} aria-hidden="true" />
      {code}
    </span>
  )
}

/** Usage share as a hairline meter under the code, coloured by pitch identity. */
export function PitchShare({
  code,
  share,
}: {
  readonly code: string
  readonly share: number | null
}): ReactElement {
  if (share === null) return <span>{NO_VALUE}</span>
  const style: StyleWithVars = {
    '--mix-color': pitchColorVar(code),
    '--mix-share': `${Math.max(0, Math.min(100, share)).toFixed(1)}%`,
  }
  return (
    <span className="mix-share">
      <span className="mix-share__value">{share.toFixed(0)}%</span>
      <span className="mix-share__meter" style={style} aria-hidden="true" />
    </span>
  )
}

