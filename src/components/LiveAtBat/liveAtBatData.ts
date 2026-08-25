import type { CurrentPlay, LiveFeed, PlayEvent, SavantGamePitch, VsPlayerStat } from '../../api/types'
import { NO_VALUE, callName, callTone } from './liveAtBatFormat'
import type { CallTone } from './liveAtBatFormat'

/**
 * Pure derivations for the "At Bat" screen. Everything here reads from data the
 * store already holds — `liveFeed`, `currentPlay`, `gameFeedPitches` — so the
 * screen densifies without a single extra request.
 *
 * Several live-feed fields the MLB API genuinely ships are absent from the
 * frozen interfaces in `src/api/types.ts` (`linescore.innings[].num`,
 * `offense.onDeck`, `PlayEvent.playId`). They are read through type guards
 * rather than by widening a type this task does not own.
 */

/**
 * The live feed ships a per-pitch UUID (`playId`) that the frozen PlayEvent type
 * does not declare. Read it defensively rather than widening the frozen type.
 */
export function playIdOf(event: PlayEvent): string | null {
  const { playId } = event as PlayEvent & { playId?: unknown }
  return typeof playId === 'string' ? playId : null
}

type AvgSpeedEntry = NonNullable<SavantGamePitch['avg_pitch_speed']>[number]

/** `avg_bat_speed` exists on the Savant gf feed but not on the frozen row type. */
function avgBatSpeedOf(entry: AvgSpeedEntry): string | null {
  const { avg_bat_speed: raw } = entry as AvgSpeedEntry & { avg_bat_speed?: unknown }
  return typeof raw === 'string' ? raw : null
}

/** The gf feed uses '--' as its null sentinel, which bare Number() turns into NaN. */
function finiteOrNull(raw: string | null): number | null {
  if (raw === null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export interface BatSpeedReading {
  readonly mph: number | null
  readonly isGameAverage: boolean
}

/**
 * Joins the Savant gf row to the live-feed pitch on `play_id` ALONE. A composite
 * game_pk + at-bat + pitch-number key cannot work: the live feed exposes a
 * 0-based `about.atBatIndex` while Savant numbers at-bats from 1, so every row
 * would silently mismatch by one at-bat.
 */
export function readBatSpeed(
  event: PlayEvent | undefined,
  rows: readonly SavantGamePitch[],
): BatSpeedReading {
  const playId = event === undefined ? null : playIdOf(event)
  if (playId !== null) {
    const match = rows.find((row) => row.play_id === playId)
    // Savant drops `batSpeed` entirely on pitches with no bat tracking rather than
    // sending null, so a `!== null` test passes undefined straight through and
    // breaks this function's own `number | null` contract.
    const measured: unknown = match?.batSpeed
    if (typeof measured === 'number' && Number.isFinite(measured)) {
      return { mph: measured, isGameAverage: false }
    }
  }

  for (const row of rows) {
    const overall = row.avg_pitch_speed?.find((entry) => entry.pitch_type === 'ALL')
    if (overall === undefined) continue
    const parsed = finiteOrNull(avgBatSpeedOf(overall))
    if (parsed !== null) return { mph: parsed, isGameAverage: true }
  }

  return { mph: null, isGameAverage: false }
}

/** Same-handed favours the pitcher; opposite hands and switch hitters favour the batter. */
export function batterHasPlatoonEdge(batSide: 'L' | 'R' | 'S', pitchHand: 'L' | 'R'): boolean {
  return batSide === 'S' || batSide !== pitchHand
}

const ADVISORY_EVENTS: ReadonlySet<string> = new Set([
  'Game Advisory',
  'Pitching Change',
  'Defensive Switch',
  'Offensive Sub',
  'Defensive Sub',
])

export function isAdvisoryPlay(play: CurrentPlay): boolean {
  return ADVISORY_EVENTS.has(play.result.event) || ADVISORY_EVENTS.has(play.result.eventType)
}

const HIT_EVENTS: ReadonlySet<string> = new Set(['single', 'double', 'triple', 'home_run'])
const WALK_EVENTS: ReadonlySet<string> = new Set(['walk', 'intent_walk'])
const STRIKEOUT_EVENTS: ReadonlySet<string> = new Set([
  'strikeout',
  'strikeout_double_play',
  'strikeout_triple_play',
])

/** Charged to the plate appearance but not to an at-bat. */
const NON_AT_BAT_EVENTS: ReadonlySet<string> = new Set([
  'walk',
  'intent_walk',
  'hit_by_pitch',
  'sac_fly',
  'sac_fly_double_play',
  'sac_bunt',
  'sac_bunt_double_play',
  'catcher_interf',
])

/**
 * `allPlays` folds terminal baserunning outs in as their own entries carrying
 * whichever batter happened to be up. Counting those as plate appearances would
 * inflate every AB total on the screen.
 */
const BASERUNNING_EVENTS: ReadonlySet<string> = new Set([
  'caught_stealing_2b',
  'caught_stealing_3b',
  'caught_stealing_home',
  'pickoff_1b',
  'pickoff_2b',
  'pickoff_3b',
  'pickoff_caught_stealing_2b',
  'pickoff_caught_stealing_3b',
  'pickoff_caught_stealing_home',
  'stolen_base_2b',
  'stolen_base_3b',
  'stolen_base_home',
  'wild_pitch',
  'passed_ball',
  'balk',
  'other_advance',
  'defensive_indiff',
])

function isPlateAppearance(play: CurrentPlay): boolean {
  return play.about.isComplete && !BASERUNNING_EVENTS.has(play.result.eventType)
}

export interface BatterLine {
  readonly atBats: number
  readonly hits: number
  readonly homeRuns: number
  readonly rbi: number
  readonly walks: number
  readonly strikeouts: number
  /** "1-3, HR, 2 RBI" — empty until the batter completes a plate appearance. */
  readonly summary: string
}

export function deriveBatterLine(
  allPlays: readonly CurrentPlay[],
  batterId: number,
  throughIndex: number,
): BatterLine {
  let atBats = 0
  let hits = 0
  let homeRuns = 0
  let rbi = 0
  let walks = 0
  let strikeouts = 0

  for (const play of allPlays) {
    if (play.matchup.batter.id !== batterId) continue
    if (play.about.atBatIndex > throughIndex) continue
    if (!isPlateAppearance(play)) continue

    const event = play.result.eventType
    rbi += play.result.rbi
    if (!NON_AT_BAT_EVENTS.has(event)) atBats += 1
    if (HIT_EVENTS.has(event)) hits += 1
    if (event === 'home_run') homeRuns += 1
    if (WALK_EVENTS.has(event)) walks += 1
    if (STRIKEOUT_EVENTS.has(event)) strikeouts += 1
  }

  const parts: string[] = [`${hits}-${atBats}`]
  if (homeRuns > 0) parts.push(homeRuns === 1 ? 'HR' : `${homeRuns} HR`)
  if (rbi > 0) parts.push(`${rbi} RBI`)
  if (walks > 0) parts.push(walks === 1 ? 'BB' : `${walks} BB`)
  if (strikeouts > 0) parts.push(strikeouts === 1 ? 'K' : `${strikeouts} K`)

  return {
    atBats,
    hits,
    homeRuns,
    rbi,
    walks,
    strikeouts,
    summary: atBats + walks + strikeouts === 0 ? '' : parts.join(', '),
  }
}

const TOTAL_BASES: ReadonlyMap<string, number> = new Map([
  ['single', 1],
  ['double', 2],
  ['triple', 3],
  ['home_run', 4],
])

export function deriveThisGameH2H(
  allPlays: readonly CurrentPlay[],
  batterId: number,
  pitcherId: number,
): VsPlayerStat {
  let plateAppearances = 0
  let hits = 0
  let homeRuns = 0
  let strikeOuts = 0
  let baseOnBalls = 0
  let atBats = 0
  let totalBases = 0

  for (const play of allPlays) {
    if (play.matchup.batter.id !== batterId) continue
    if (play.matchup.pitcher.id !== pitcherId) continue
    if (!isPlateAppearance(play)) continue

    plateAppearances += 1
    const event = play.result.eventType
    if (!NON_AT_BAT_EVENTS.has(event)) atBats += 1
    if (HIT_EVENTS.has(event)) hits += 1
    if (event === 'home_run') homeRuns += 1
    if (STRIKEOUT_EVENTS.has(event)) strikeOuts += 1
    if (WALK_EVENTS.has(event)) baseOnBalls += 1
    const tb = TOTAL_BASES.get(event)
    if (tb !== undefined) totalBases += tb
  }

  const avg = atBats > 0 ? (hits / atBats).toFixed(3) : '.000'
  const obp = plateAppearances > 0 ? ((hits + baseOnBalls) / plateAppearances).toFixed(3) : '.000'
  const slg = atBats > 0 ? (totalBases / atBats).toFixed(3) : '.000'
  const ops = (Number(obp) + Number(slg)).toFixed(3)

  return {
    gamesPlayed: plateAppearances > 0 ? 1 : 0,
    plateAppearances,
    hits,
    homeRuns,
    avg,
    obp,
    slg,
    ops,
    strikeOuts,
    baseOnBalls,
  }
}

export interface PitcherLine {
  readonly pitchCount: number
  readonly strikes: number
  readonly battersFaced: number
  readonly strikeouts: number
  readonly walks: number
  readonly hits: number
  readonly timeThroughOrder: number
  /** "10 P · 80% S" — empty until the pitcher has thrown a pitch. */
  readonly summary: string
}

/**
 * A ball in play is NEITHER `isStrike` nor `isBall`, so `isInPlay` has to be
 * folded into the strike count — omitting it undercounts strike rate by ~17pts.
 */
export function derivePitcherLine(
  allPlays: readonly CurrentPlay[],
  current: CurrentPlay,
): PitcherLine {
  const pitcherId = current.matchup.pitcher.id
  const batterId = current.matchup.batter.id
  const currentIndex = current.about.atBatIndex

  let pitchCount = 0
  let strikes = 0
  let battersFaced = 0
  let strikeouts = 0
  let walks = 0
  let hits = 0
  let priorMeetings = 0

  for (const play of allPlays) {
    if (play.matchup.pitcher.id !== pitcherId) continue
    if (play.about.atBatIndex > currentIndex) continue

    for (const event of play.playEvents) {
      if (!event.isPitch) continue
      pitchCount += 1
      if (event.details.isStrike || event.details.isInPlay) strikes += 1
    }

    if (isPlateAppearance(play)) {
      battersFaced += 1
      const eventType = play.result.eventType
      if (STRIKEOUT_EVENTS.has(eventType)) strikeouts += 1
      if (WALK_EVENTS.has(eventType)) walks += 1
      if (HIT_EVENTS.has(eventType)) hits += 1
    }

    if (play.matchup.batter.id === batterId && play.about.atBatIndex < currentIndex) {
      priorMeetings += 1
    }
  }

  const strikePct = pitchCount === 0 ? null : Math.round((strikes / pitchCount) * 100)

  return {
    pitchCount,
    strikes,
    battersFaced,
    strikeouts,
    walks,
    hits,
    timeThroughOrder: priorMeetings + 1,
    summary: strikePct === null ? '' : `${pitchCount} P · ${strikePct}% S`,
  }
}

export function strikePercent(line: PitcherLine): string {
  if (line.pitchCount === 0) return NO_VALUE
  return `${Math.round((line.strikes / line.pitchCount) * 100)}%`
}

export interface SequencePitch {
  readonly key: string
  readonly number: number
  readonly code: string
  readonly velocity: string
  readonly call: string
  readonly tone: CallTone
}

export function derivePitchSequence(pitches: readonly PlayEvent[]): readonly SequencePitch[] {
  return pitches.map((pitch, index) => {
    const code = pitch.details.type?.code
    const speed = pitch.pitchData?.startSpeed
    return {
      key: playIdOf(pitch) ?? `pitch-${index}`,
      number: index + 1,
      code: code ?? NO_VALUE,
      velocity:
        typeof speed === 'number' && Number.isFinite(speed) ? speed.toFixed(1) : NO_VALUE,
      call: callName(pitch.details.call?.code),
      tone: callTone(pitch.details.call?.code),
    }
  })
}

type Linescore = LiveFeed['liveData']['linescore']

export interface BaseState {
  readonly label: string
  readonly runner: string | null
}

export function deriveBases(linescore: Linescore): readonly BaseState[] {
  const offense = linescore.offense
  return [
    { label: '1B', runner: offense?.first?.fullName ?? null },
    { label: '2B', runner: offense?.second?.fullName ?? null },
    { label: '3B', runner: offense?.third?.fullName ?? null },
  ]
}

export interface OffenseExtras {
  readonly onDeck: string | null
  readonly inHole: string | null
}

function personName(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const { fullName } = value as { fullName?: unknown }
  return typeof fullName === 'string' && fullName !== '' ? fullName : null
}

/** `onDeck` / `inHole` ship on every live feed but are not in the frozen type. */
export function readOffenseExtras(linescore: Linescore): OffenseExtras {
  const offense: unknown = linescore.offense
  if (typeof offense !== 'object' || offense === null) {
    return { onDeck: null, inHole: null }
  }
  const record = offense as { onDeck?: unknown; inHole?: unknown }
  return { onDeck: personName(record.onDeck), inHole: personName(record.inHole) }
}
