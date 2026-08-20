import type { CurrentPlay, PlayEvent } from '../../api/types'
import { mean, pitchesOf, rateOf, splitPitches } from './GameSubTabShared'
import type { PitchSplit } from './GameSubTabShared'

/**
 * Derivation layer for the "Pitcher Game" sub-tab. Everything here comes from
 * `allPlays` alone — this module issues no network requests and invents no
 * value: a rate with a zero denominator is `null`, never a zero stand-in.
 */

/** A batting order is nine deep, so the Nth batter faced is pass ceil(N/9). */
const LINEUP_SIZE = 9

export interface InningLine {
  readonly inning: number
  readonly pitches: number
  readonly strikes: number
  readonly battersFaced: number
}

export interface ArsenalLine {
  readonly code: string
  readonly count: number
  readonly share: number | null
  readonly avgVelo: number | null
  readonly maxVelo: number | null
  readonly whiffs: number
  readonly swings: number
}

export interface PitcherGame {
  readonly pitches: PlayEvent[]
  readonly split: PitchSplit
  readonly arsenal: readonly ArsenalLine[]
  readonly byInning: readonly InningLine[]
  readonly battersFaced: number
  readonly outs: number
  readonly firstPitchStrikes: number
  readonly startedPlateAppearances: number
  readonly strikeouts: number
  readonly walks: number
  readonly hits: number
  readonly homeRuns: number
  readonly timesThroughOrder: number
}

const HIT_EVENTS: ReadonlySet<string> = new Set(['Single', 'Double', 'Triple', 'Home Run'])
const WALK_EVENTS: ReadonlySet<string> = new Set(['Walk', 'Intent Walk'])

/**
 * `count.outs` on a completed play is the out total AFTER it, so the outs a
 * pitcher recorded are the increments across the half-innings he worked. The
 * in-progress play reports pre-play outs, which yields a zero increment.
 */
function countOuts(plays: readonly CurrentPlay[], pitcherId: number): number {
  const priorOuts = new Map<string, number>()
  let outs = 0

  for (const play of plays) {
    const half = `${String(play.about.inning)}-${play.about.halfInning}`
    const before = priorOuts.get(half) ?? 0
    if (play.matchup.pitcher.id === pitcherId) outs += Math.max(0, play.count.outs - before)
    priorOuts.set(half, play.count.outs)
  }

  return outs
}

interface ArsenalBucket {
  count: number
  speeds: number[]
  whiffs: number
  swings: number
}

/** Groups this outing's pitches on `details.type.code` into arsenal rows. */
function buildArsenal(pitches: readonly PlayEvent[]): ArsenalLine[] {
  const buckets = new Map<string, ArsenalBucket>()

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
      maxVelo: bucket.speeds.length === 0 ? null : Math.max(...bucket.speeds),
      whiffs: bucket.whiffs,
      swings: bucket.swings,
    }))
    .sort((a, b) => b.count - a.count)
}

function buildInnings(plays: readonly CurrentPlay[]): InningLine[] {
  const lines = new Map<number, { pitches: number; strikes: number; battersFaced: number }>()

  for (const play of plays) {
    const thrown = play.playEvents.filter((event) => event.isPitch)
    if (thrown.length === 0) continue
    const line = lines.get(play.about.inning) ?? { pitches: 0, strikes: 0, battersFaced: 0 }
    const split = splitPitches(thrown)
    line.pitches += split.total
    line.strikes += split.strikes
    line.battersFaced += 1
    lines.set(play.about.inning, line)
  }

  return [...lines]
    .map(([inning, line]) => ({ inning, ...line }))
    .sort((a, b) => a.inning - b.inning)
}

/**
 * Everything the tab shows, from `allPlays` alone — no network access. Plays are
 * bounded by the current at-bat index so this stays consistent with LiveAtBat's
 * P-Count, which derives its pitch total the same way.
 */
export function derivePitcherGame(allPlays: readonly CurrentPlay[], current: CurrentPlay): PitcherGame {
  const pitcherId = current.matchup.pitcher.id
  const soFar = allPlays.filter((play) => play.about.atBatIndex <= current.about.atBatIndex)
  const mine = soFar.filter((play) => play.matchup.pitcher.id === pitcherId)
  const pitches = pitchesOf(mine)

  let firstPitchStrikes = 0
  let startedPlateAppearances = 0
  for (const play of mine) {
    const thrown = play.playEvents.filter((event) => event.isPitch)
    if (thrown.length === 0) continue
    startedPlateAppearances += 1
    const [first] = thrown
    if (first !== undefined && splitPitches([first]).strikes === 1) firstPitchStrikes += 1
  }

  const events = mine.map((play) => play.result.event)

  return {
    pitches,
    split: splitPitches(pitches),
    arsenal: buildArsenal(pitches),
    byInning: buildInnings(mine),
    battersFaced: startedPlateAppearances,
    outs: countOuts(soFar, pitcherId),
    firstPitchStrikes,
    startedPlateAppearances,
    strikeouts: events.filter((event) => event.startsWith('Strikeout')).length,
    walks: events.filter((event) => WALK_EVENTS.has(event)).length,
    hits: events.filter((event) => HIT_EVENTS.has(event)).length,
    homeRuns: events.filter((event) => event === 'Home Run').length,
    timesThroughOrder: Math.max(1, Math.ceil(startedPlateAppearances / LINEUP_SIZE)),
  }
}
