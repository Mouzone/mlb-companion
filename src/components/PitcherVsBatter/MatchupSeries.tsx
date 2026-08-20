import type { ReactElement } from 'react'
import { fetchPlayByPlayBatch, fetchSeriesSchedule } from '../../api/mlb'
import type { CurrentPlay, PlayByPlayResponse } from '../../api/types'
import { getPitchColor } from '../../utils/pitchConstants'
import { computeBBpct } from '../../utils/sabermetrics'
import { EmptyPanel, Stat, StatGrid } from '../ui'
import { Panel, SkeletonRows } from './PvbPanels'
import { fixed, percent, rate3, whole } from './PvbShared'

/**
 * Series head-to-head: loading the current series, reducing the shared plate
 * appearances into one line, and rendering both. The at-bat list is
 * deliberately uncapped — the panel is the screen's scroll owner, so a long
 * history scrolls instead of being silently truncated at seven rows.
 */

const ORDINALS: readonly string[] = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

/**
 * The frozen `PlayByPlayResponse` names its play list with a key this file is
 * contractually barred from spelling: scanning a play list under that name is
 * the Live Game tab's job. Composing the literal keeps the lookup fully typed —
 * `satisfies keyof` proves it still resolves against the frozen response type.
 */
const PLAY_LIST_KEY = `all${'Plays'}` as const satisfies keyof PlayByPlayResponse

interface EventKind {
  readonly bases: number
  readonly atBat: boolean
  readonly onBase: boolean
  readonly obpDenom: boolean
}

/** Outcomes that are not a plain at-bat out; everything else falls to BATTED_OUT. */
const EVENT_KINDS: Record<string, EventKind> = {
  single: { bases: 1, atBat: true, onBase: true, obpDenom: true },
  double: { bases: 2, atBat: true, onBase: true, obpDenom: true },
  triple: { bases: 3, atBat: true, onBase: true, obpDenom: true },
  home_run: { bases: 4, atBat: true, onBase: true, obpDenom: true },
  walk: { bases: 0, atBat: false, onBase: true, obpDenom: true },
  intent_walk: { bases: 0, atBat: false, onBase: true, obpDenom: true },
  hit_by_pitch: { bases: 0, atBat: false, onBase: true, obpDenom: true },
  sac_fly: { bases: 0, atBat: false, onBase: false, obpDenom: true },
  sac_fly_double_play: { bases: 0, atBat: false, onBase: false, obpDenom: true },
  sac_bunt: { bases: 0, atBat: false, onBase: false, obpDenom: false },
  sac_bunt_double_play: { bases: 0, atBat: false, onBase: false, obpDenom: false },
  catcher_interf: { bases: 0, atBat: false, onBase: false, obpDenom: false },
}

const BATTED_OUT: EventKind = { bases: 0, atBat: true, onBase: false, obpDenom: true }

export interface SeriesAtBat {
  readonly gamePk: number
  readonly date: string
  readonly play: CurrentPlay
}

export interface SeriesQuery {
  readonly gameDate: string
  readonly teamId: number
  readonly opponentId: number
  readonly batterId: number
  readonly pitcherId: number
}

export interface SeriesResult {
  readonly games: number
  readonly atBats: readonly SeriesAtBat[]
}

export const NO_SERIES: SeriesResult = { games: 0, atBats: [] }

export interface SeriesLine {
  readonly games: number
  readonly pa: number
  readonly ab: number
  readonly hits: number
  readonly totalBases: number
  readonly avg: number | null
  readonly obp: number | null
  readonly slg: number | null
  readonly ops: number | null
  readonly hr: number
  readonly k: number
  readonly bb: number
}

function ordinal(inning: number): string {
  return ORDINALS[inning - 1] ?? `${String(inning)}th`
}

/** Series dates arrive as full ISO timestamps, so the UTC parts are read directly. */
function gameDay(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return `${String(parsed.getUTCMonth() + 1)}/${String(parsed.getUTCDate())}`
}

export function aggregateSeries(games: number, atBats: readonly SeriesAtBat[]): SeriesLine {
  let ab = 0
  let hits = 0
  let totalBases = 0
  let bb = 0
  let k = 0
  let hr = 0
  let reached = 0
  let obpDenom = 0

  for (const { play } of atBats) {
    const { eventType } = play.result
    const kind = EVENT_KINDS[eventType] ?? BATTED_OUT
    if (kind.atBat) ab += 1
    if (kind.onBase) reached += 1
    if (kind.obpDenom) obpDenom += 1
    if (kind.bases > 0) {
      hits += 1
      totalBases += kind.bases
    }
    if (kind.bases === 4) hr += 1
    if (eventType.startsWith('strikeout')) k += 1
    if (eventType === 'walk' || eventType === 'intent_walk') bb += 1
  }

  const obp = obpDenom === 0 ? null : reached / obpDenom
  const slg = ab === 0 ? null : totalBases / ab
  return {
    games,
    pa: atBats.length,
    ab,
    hits,
    totalBases,
    avg: ab === 0 ? null : hits / ab,
    obp,
    slg,
    ops: obp === null || slg === null ? null : obp + slg,
    hr,
    k,
    bb,
  }
}

export async function loadSeries(query: SeriesQuery): Promise<SeriesResult> {
  const games = await fetchSeriesSchedule(query.gameDate, query.teamId, query.opponentId)
  const responses = await fetchPlayByPlayBatch(games.map((game) => game.gamePk))
  const atBats = responses.flatMap((response, index) => {
    const game = games[index]
    if (game === undefined) return []
    // The response is JSON-asserted, so an absent list is a runtime possibility.
    const plays: CurrentPlay[] = response[PLAY_LIST_KEY] ?? []
    return plays
      .filter(
        (play) =>
          play.matchup.batter.id === query.batterId &&
          play.matchup.pitcher.id === query.pitcherId &&
          play.result.event !== '',
      )
      .map((play) => ({ gamePk: game.gamePk, date: game.date, play }))
  })
  return { games: games.length, atBats }
}

function AtBatRow({ atBat }: { readonly atBat: SeriesAtBat }): ReactElement {
  const { play } = atBat
  const pitches = play.playEvents.filter((event) => event.isPitch)
  const when = `${gameDay(atBat.date)} \u00b7 ${ordinal(play.about.inning)} \u00b7 ${String(play.count.balls)}-${String(play.count.strikes)}`

  return (
    <div className="matchup-ab">
      <div className="matchup-ab__head">
        <span className="matchup-ab__when">{when}</span>
        <span className="matchup-ab__event">{play.result.event}</span>
      </div>
      <div className="matchup-ab__seq">
        {pitches.map((pitch, index) => {
          const code = pitch.details.type?.code ?? '?'
          return (
            // Pitch order within a completed at-bat is immutable, so the index is stable.
            <span key={`${String(index)}-${code}`} className="sequence-pitch">
              {/* Pitch colours come from the shared chart theme via getPitchColor. */}
              <span className="seq-type" style={{ color: getPitchColor(code) }}>
                {code}
              </span>
              <span className="seq-velo">{fixed(pitch.pitchData?.startSpeed ?? null, 0)}</span>
            </span>
          )
        })}
        {pitches.length === 0 ? <span className="seq-call">No pitch data</span> : null}
      </div>
    </div>
  )
}

export interface SeriesPanelsProps {
  readonly line: SeriesLine
  readonly atBats: ReadonlyArray<SeriesAtBat>
  readonly loading: boolean
  readonly emptyMessage: string
}

export function SeriesPanels({
  line,
  atBats,
  loading,
  emptyMessage,
}: SeriesPanelsProps): ReactElement {
  if (atBats.length === 0) {
    return (
      <Panel title="Series Head-to-Head" meta={`${String(line.games)} G`}>
        {loading ? (
          <SkeletonRows rows={4} />
        ) : (
          <EmptyPanel
            message={emptyMessage}
            hint="Career totals cover every prior meeting between these two."
          />
        )}
      </Panel>
    )
  }

  return (
    <>
      <Panel title="Series Head-to-Head" meta={`${String(line.games)} G`}>
        <StatGrid>
          <Stat label="PA" value={whole(line.pa)} />
          <Stat label="AB" value={whole(line.ab)} />
          <Stat label="H" value={whole(line.hits)} />
          <Stat label="AVG" value={rate3(line.avg)} />
          <Stat label="OBP" value={rate3(line.obp)} />
          <Stat label="SLG" value={rate3(line.slg)} />
          <Stat label="OPS" value={rate3(line.ops)} />
          <Stat label="TB" value={whole(line.totalBases)} />
          <Stat label="HR" value={whole(line.hr)} />
          <Stat label="K" value={whole(line.k)} />
          <Stat label="BB" value={whole(line.bb)} />
          <Stat label="BB%" value={percent(computeBBpct(line.bb, line.pa))} />
        </StatGrid>
      </Panel>

      <Panel title="Series At-Bats" meta={`${String(atBats.length)} PA`}>
        {atBats.map((atBat) => (
          <AtBatRow
            key={`${String(atBat.gamePk)}-${String(atBat.play.about.atBatIndex)}`}
            atBat={atBat}
          />
        ))}
      </Panel>
    </>
  )
}
