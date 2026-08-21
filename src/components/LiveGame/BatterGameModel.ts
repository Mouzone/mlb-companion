import type { CurrentPlay, PlayEvent, SavantGamePitch } from '../../api/types'
import { mean, playIdOf, rateOf, splitPitches } from './GameSubTabShared'

/**
 * Derivation layer for the "Batter Game" sub-tab. Everything comes from
 * `allPlays` plus the Savant gf rows already in the store — no network access,
 * and no invented value: a rate with a zero denominator stays `null`.
 */

const HIT_EVENTS: ReadonlySet<string> = new Set(['Single', 'Double', 'Triple', 'Home Run'])
const WALK_EVENTS: ReadonlySet<string> = new Set(['Walk', 'Intent Walk'])

/** Plate appearances that resolve without charging an official at-bat. */
const NON_AT_BAT_EVENTS: ReadonlySet<string> = new Set([
  'Walk',
  'Intent Walk',
  'Hit By Pitch',
  'Sac Fly',
  'Sac Bunt',
  'Sac Fly Double Play',
  'Sac Bunt Double Play',
  'Catcher Interference',
])

/**
 * Joins the Savant gf row to the live-feed pitch on `play_id` ALONE. A composite
 * key including the at-bat number cannot work: the live feed exposes a 0-based
 * `about.atBatIndex` while Savant numbers at-bats from 1, so every row would
 * silently mismatch by exactly one at-bat.
 */
export function batSpeedFor(event: PlayEvent, rows: readonly SavantGamePitch[]): number | null {
  const playId = playIdOf(event)
  if (playId === null) return null
  const speed = rows.find((row) => row.play_id === playId)?.batSpeed
  return speed !== undefined && Number.isFinite(speed) ? speed : null
}

export interface MixLine {
  readonly code: string
  readonly count: number
  readonly share: number | null
  readonly avgVelo: number | null
  readonly whiffs: number
  readonly swings: number
}

interface MixBucket {
  count: number
  speeds: number[]
  whiffs: number
  swings: number
}

/** Groups every pitch this batter has seen by type, with his swing outcomes. */
export function buildMix(pitches: readonly PlayEvent[]): MixLine[] {
  const buckets = new Map<string, MixBucket>()

  for (const pitch of pitches) {
    const code = pitch.details.type?.code
    if (code === undefined) continue
    const bucket = buckets.get(code) ?? { count: 0, speeds: [], whiffs: 0, swings: 0 }
    bucket.count += 1
    const speed = pitch.pitchData?.startSpeed
    if (speed !== undefined && Number.isFinite(speed)) bucket.speeds.push(speed)
    const one = splitPitches([pitch])
    bucket.whiffs += one.whiffs
    bucket.swings += one.swings
    buckets.set(code, bucket)
  }

  const total = pitches.length
  return [...buckets]
    .map(([code, bucket]) => ({
      code,
      count: bucket.count,
      share: rateOf(bucket.count, total),
      avgVelo: mean(bucket.speeds),
      whiffs: bucket.whiffs,
      swings: bucket.swings,
    }))
    .sort((a, b) => b.count - a.count)
}

export interface GameLine {
  readonly plateAppearances: number
  readonly atBats: number
  readonly hits: number
  readonly homeRuns: number
  readonly strikeouts: number
  readonly walks: number
  readonly rbi: number
}

export function buildGameLine(plays: readonly CurrentPlay[]): GameLine {
  const events = plays.map((play) => play.result.event)
  return {
    plateAppearances: plays.length,
    atBats: events.filter((event) => !NON_AT_BAT_EVENTS.has(event)).length,
    hits: events.filter((event) => HIT_EVENTS.has(event)).length,
    homeRuns: events.filter((event) => event === 'Home Run').length,
    strikeouts: events.filter((event) => event?.startsWith('Strikeout')).length,
    walks: events.filter((event) => WALK_EVENTS.has(event)).length,
    rbi: plays.reduce((total, play) => total + play.result.rbi, 0),
  }
}
