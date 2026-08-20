import type { ReactElement } from 'react'
import { useGameStore } from '../../store/gameStore'
import { ZonePlot } from '../Canvas/ZonePlot'
import { PITCH_COLORS, UNKNOWN_PITCH_COLOR } from '../../utils/pitchConstants'
import type { CurrentPlay, PlayEvent, SavantGamePitch } from '../../api/types'

// allow: SIZE_OK — three sibling sections share ONE fixed 470px budget
// (190 + 160 + 120) inside the 679px `.sub-tab-panel` that LiveGameTab owns.
// Splitting the render tree would scatter that budget across files and hide
// the very overflow contract this component exists to honour.

/** Rendered wherever the feed genuinely has no value — never a zero stand-in. */
const NO_VALUE = '—'

/** ZonePlot draws its legend inside the square, and 172 is its legend threshold. */
const ZONE_PLOT_SIZE = 172

const ORDINALS: readonly string[] = [
  '1st',
  '2nd',
  '3rd',
  '4th',
  '5th',
  '6th',
  '7th',
  '8th',
  '9th',
]

const TRAJECTORY_ABBR: Record<string, string> = {
  fly_ball: 'FLY',
  ground_ball: 'GB',
  line_drive: 'LD',
  popup: 'POP',
  bunt_grounder: 'B-GB',
  bunt_popup: 'B-POP',
  bunt_line_drive: 'B-LD',
}

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

function ordinal(n: number): string {
  return ORDINALS[n - 1] ?? `${n}th`
}

function fixed(value: number | null | undefined, digits: number, unit: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE
  return `${value.toFixed(digits)}${unit}`
}

function trajectoryLabel(raw: string | undefined): string {
  if (raw === undefined || raw === '') return NO_VALUE
  return TRAJECTORY_ABBR[raw] ?? raw
}

/**
 * The live feed ships a per-pitch UUID (`playId`) that the frozen PlayEvent type
 * does not declare. Read it defensively rather than widening the frozen type.
 */
function playIdOf(event: PlayEvent): string | null {
  const { playId } = event as PlayEvent & { playId?: unknown }
  return typeof playId === 'string' ? playId : null
}

/**
 * Joins the Savant gf row to the live-feed pitch on `play_id` ALONE. A composite
 * key including the at-bat number cannot work: the live feed exposes a 0-based
 * `about.atBatIndex` while Savant numbers at-bats from 1, so every row would
 * silently mismatch by exactly one at-bat.
 */
function batSpeedFor(event: PlayEvent, rows: readonly SavantGamePitch[]): number | null {
  const playId = playIdOf(event)
  if (playId === null) return null
  return rows.find((row) => row.play_id === playId)?.batSpeed ?? null
}

interface PitchTally {
  readonly code: string
  readonly count: number
  readonly avgVelo: number | null
}

interface VeloBucket {
  count: number
  sum: number
  sampled: number
}

/** Groups every pitch this batter has seen by type, averaging release velocity. */
function tallyPitchTypes(pitches: readonly PlayEvent[]): PitchTally[] {
  const buckets = new Map<string, VeloBucket>()

  for (const pitch of pitches) {
    const code = pitch.details.type?.code
    if (code === undefined) continue

    const bucket = buckets.get(code) ?? { count: 0, sum: 0, sampled: 0 }
    bucket.count += 1

    const speed = pitch.pitchData?.startSpeed
    if (speed !== undefined && Number.isFinite(speed)) {
      bucket.sum += speed
      bucket.sampled += 1
    }
    buckets.set(code, bucket)
  }

  return [...buckets]
    .map(([code, bucket]) => ({
      code,
      count: bucket.count,
      avgVelo: bucket.sampled === 0 ? null : bucket.sum / bucket.sampled,
    }))
    .sort((a, b) => b.count - a.count)
}

/** Traditional game line for the completed plate appearances passed in. */
function formatGameLine(plays: readonly CurrentPlay[]): string {
  const events = plays.map((play) => play.result.event)
  const atBats = events.filter((event) => !NON_AT_BAT_EVENTS.has(event)).length
  const hits = events.filter((event) => HIT_EVENTS.has(event)).length
  const homeRuns = events.filter((event) => event === 'Home Run').length
  const strikeouts = events.filter((event) => event.startsWith('Strikeout')).length
  const walks = events.filter((event) => WALK_EVENTS.has(event)).length

  const parts = [`${hits}-${atBats}`]
  if (homeRuns > 0) parts.push(`${homeRuns} HR`)
  if (strikeouts > 0) parts.push(`${strikeouts} K`)
  if (walks > 0) parts.push(`${walks} BB`)
  return parts.join(', ')
}

interface SwingRow {
  readonly key: string
  readonly inning: string
  readonly detail: string
}

/** One line per batted ball, with bat speed joined from the Savant gf rows. */
function swingRowsFor(
  plays: readonly CurrentPlay[],
  savantRows: readonly SavantGamePitch[],
): SwingRow[] {
  const rows: SwingRow[] = []

  for (const play of plays) {
    const contact = play.playEvents.find((event) => event.isPitch && event.hitData !== undefined)
    const hit = contact?.hitData
    if (contact === undefined || hit === undefined) continue

    const cells = [
      fixed(hit.launchSpeed, 1, ' mph'),
      fixed(hit.launchAngle, 0, '°'),
      fixed(hit.totalDistance, 0, ' ft'),
      trajectoryLabel(hit.trajectory),
      fixed(batSpeedFor(contact, savantRows), 1, ' bat'),
    ]

    rows.push({
      key: String(play.about.atBatIndex),
      inning: ordinal(play.about.inning),
      detail: cells.join(' · '),
    })
  }

  return rows
}

/**
 * "Batter Game" sub-tab body. Renders as a fragment: LiveGameTab owns the
 * surrounding `.sub-tab-panel`, whose height IS `var(--content-h)` (679px).
 * Section budget — 190 + 160 + 120 = 470px, plus 2 x 4px gaps and 2 x 6px
 * panel padding = 490px. Every value is derived from `liveFeed.liveData.plays.allPlays`
 * plus the Savant rows already in the store; this component issues no network requests.
 */
export function BatterGameSubTab(): ReactElement {
  const liveFeed = useGameStore((s) => s.liveFeed)
  const currentPlay = useGameStore((s) => s.currentPlay)
  const gameFeedPitches = useGameStore((s) => s.gameFeedPitches)

  const matchup = currentPlay?.matchup
  if (liveFeed === null || matchup === undefined) {
    return <div className="no-game">No at-bat in progress</div>
  }

  const rawPlays = liveFeed.liveData.plays.allPlays
  const allPlays: CurrentPlay[] = Array.isArray(rawPlays) ? rawPlays : []

  const batterId = matchup.batter.id
  const batterPlays = allPlays.filter((play) => play.matchup.batter.id === batterId)
  const batterPitches: PlayEvent[] = batterPlays.flatMap((play) =>
    play.playEvents.filter((event) => event.isPitch),
  )
  const completedPlays = batterPlays.filter((play) => play.result.event !== '')

  // Slices cap for glanceability, not for a height budget — the panel scrolls.
  const tallies = tallyPitchTypes(batterPitches)
  const shownTallies = tallies.slice(0, 5)
  const hiddenTallies = tallies.length - shownTallies.length

  // A batter takes at most six plate appearances in a nine-inning game, so the
  // five most recent plus "+N more" is effectively lossless.
  const shownAtBats = completedPlays.slice(-5)
  const hiddenAtBats = completedPlays.length - shownAtBats.length

  const swings = swingRowsFor(batterPlays, gameFeedPitches)
  const shownSwings = swings.slice(-4)

  return (
    <>
      <div className="panel-split" style={{ gap: 'var(--sp-4)' }}>
        <div className="zone-canvas">
          <ZonePlot pitches={batterPitches} size={ZONE_PLOT_SIZE} />
        </div>
        <div className="subsection">
          <div className="section-title">
            <span>Pitch Mix</span>
            <span>{batterPitches.length}</span>
          </div>
          <div>
            {shownTallies.map((tally) => (
              <div key={tally.code} className="stat-row">
                <span
                  className="stat-label"
                  style={{ color: PITCH_COLORS[tally.code] ?? UNKNOWN_PITCH_COLOR }}
                >
                  {tally.code}
                </span>
                <span className="stat-value">
                  {tally.count} · {fixed(tally.avgVelo, 1, '')}
                </span>
              </div>
            ))}
            {shownTallies.length === 0 ? (
              <div className="stat-row">
                <span className="stat-label">No pitches seen yet</span>
              </div>
            ) : null}
          </div>
          {hiddenTallies > 0 ? (
            <div className="canvas-caption">+{hiddenTallies} more</div>
          ) : null}
        </div>
      </div>

      <div className="panel-row">
        <div className="section-title">
          <span>{matchup.batter.fullName}</span>
          <span>{formatGameLine(completedPlays)}</span>
        </div>
        <div>
          {shownAtBats.map((play) => (
            <div key={play.about.atBatIndex} className="stat-row">
              <span className="stat-label">
                {ordinal(play.about.inning)} · {play.count.balls}-{play.count.strikes}
              </span>
              <span className="stat-value">{play.result.event}</span>
            </div>
          ))}
          {shownAtBats.length === 0 ? (
            <div className="stat-row">
              <span className="stat-label">First plate appearance in progress</span>
            </div>
          ) : null}
        </div>
        {hiddenAtBats > 0 ? <div className="canvas-caption">+{hiddenAtBats} more</div> : null}
      </div>

      <div className="panel-row">
        <div className="section-title">
          <span>Batted Balls · {swings.length}</span>
          <span>Swing tilt {NO_VALUE} · not available live</span>
        </div>
        <div>
          {shownSwings.map((swing) => (
            <div key={swing.key} className="stat-row">
              <span className="stat-label">{swing.inning}</span>
              <span className="stat-value">{swing.detail}</span>
            </div>
          ))}
          {shownSwings.length === 0 ? (
            <div className="stat-row">
              <span className="stat-label">No balls in play yet</span>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
