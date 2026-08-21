/** Rendered wherever the feed genuinely has no value — never a zero stand-in. */
export const NO_VALUE = '—'

export const PITCH_TYPE_NAMES: Readonly<Record<string, string>> = {
  FF: '4-Seam',
  SI: 'Sinker',
  FC: 'Cutter',
  SL: 'Slider',
  ST: 'Sweeper',
  CU: 'Curve',
  KC: 'Knuckle Curve',
  CH: 'Change',
  FS: 'Splitter',
  KN: 'Knuckle',
  FO: 'Forkball',
  SC: 'Screwball',
  EP: 'Eephus',
}

export const CALL_NAMES: Readonly<Record<string, string>> = {
  B: 'Ball',
  '*B': 'Ball In Dirt',
  V: 'Automatic Ball',
  C: 'Called Strike',
  S: 'Swinging Strike',
  W: 'Swinging Strike (Blocked)',
  T: 'Foul Tip',
  M: 'Missed Bunt',
  F: 'Foul',
  L: 'Foul Bunt',
  X: 'In Play',
  D: 'In Play',
  E: 'In Play (Error)',
  H: 'Hit By Pitch',
}

/**
 * The five semantic call slots the sequence list paints. `strike` was one slot
 * until a reader could no longer tell a taken strike from a swing-and-miss —
 * the two carry opposite information about the hitter, so they are now split.
 */
export type CallTone = 'ball' | 'called' | 'swinging' | 'foul' | 'inplay' | 'unknown'

const CALL_TONES: Readonly<Record<string, CallTone>> = {
  B: 'ball',
  '*B': 'ball',
  V: 'ball',
  H: 'ball',
  C: 'called',
  S: 'swinging',
  W: 'swinging',
  T: 'swinging',
  M: 'swinging',
  F: 'foul',
  L: 'foul',
  X: 'inplay',
  D: 'inplay',
  E: 'inplay',
}

export function callTone(code: string | undefined): CallTone {
  return code === undefined ? 'unknown' : CALL_TONES[code] ?? 'unknown'
}

/** Legend copy for the sequence list, in the order a plate appearance reads. */
export const CALL_TONE_LEGEND: readonly { readonly tone: CallTone; readonly label: string }[] = [
  { tone: 'ball', label: 'Ball' },
  { tone: 'called', label: 'Called' },
  { tone: 'swinging', label: 'Swinging' },
  { tone: 'foul', label: 'Foul' },
  { tone: 'inplay', label: 'In play' },
]

export function callName(code: string | undefined): string {
  return code === undefined ? NO_VALUE : CALL_NAMES[code] ?? code
}

const ORDINALS: readonly string[] = ['1st', '2nd', '3rd', '4th', '5th', '6th']

export function ordinal(n: number): string {
  return ORDINALS[n - 1] ?? `${n}th`
}

export function fixed(
  value: number | null | undefined,
  digits: number,
  unit: string,
): string {
  // Feeds omit a measurement by dropping the key, by sending null, or by sending
  // a non-finite number, so the guard has to be positive rather than exclude one
  // of the three. An asymmetric `=== undefined` check let nulls through and threw.
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(digits)}${unit}`
    : NO_VALUE
}

/** "Bobby Witt Jr." → "Witt Jr." — the widest form that survives a 76px column. */
export function surname(fullName: string): string {
  const parts = fullName.trim().split(' ')
  return parts.length < 2 ? fullName : parts.slice(1).join(' ')
}

/** `vs_LHP` / `Men_On` → `vs LHP` / `Men On`. */
export function humanizeSplit(raw: string): string {
  return raw.replaceAll('_', ' ')
}

/** `fly_ball` → `Fly Ball`. The feed ships raw enum keys; the UI never shows them. */
export function humanizeEnum(raw: string | undefined): string {
  if (raw === undefined || raw === '') return NO_VALUE
  return humanizeSplit(raw)
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
