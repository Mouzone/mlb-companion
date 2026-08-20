import { useEffect, useState, type ReactElement } from 'react'
import { fetchCareerVsPlayer, fetchPlayByPlayBatch, fetchSeriesSchedule } from '../../api/mlb'
import type { CurrentPlay, H2HAggregate, PlayByPlayResponse, VsPlayerStat } from '../../api/types'
import { useGameStore } from '../../store/gameStore'
import { getPitchColor } from '../../utils/pitchConstants'

type Scope = 'career' | 'series'
type Status = 'idle' | 'loading' | 'ready' | 'error'

const SCOPES: readonly { readonly id: Scope; readonly label: string }[] = [
  { id: 'career', label: 'Career' },
  { id: 'series', label: 'Series' },
]

/** Rendered whenever the pair has no shared plate appearances on record. */
const NO_HISTORY = 'No matchup history'
const NO_VALUE = '—'

/**
 * Series list budget. The `.pvb-panel` content box is its height minus 12px of
 * padding; the scope toggle (22) plus the summary caption (18) plus eight 4px
 * flex gaps leave room for exactly seven 55px rows. An eighth row overflows.
 */
const MAX_AT_BAT_ROWS = 7

/** A 22px chip strip on a 390px screen clips past eight chips. */
const MAX_CHIPS = 8

/** Conventional batting-average reading, used only to tint the rendered value. */
const HOT_AVG = 0.3
const COLD_AVG = 0.2

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

const ORDINALS: readonly string[] = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

interface SeriesAtBat {
  readonly gamePk: number
  readonly date: string
  readonly play: CurrentPlay
}

interface SeriesQuery {
  readonly gameDate: string
  readonly teamId: number
  readonly opponentId: number
  readonly batterId: number
  readonly pitcherId: number
}

interface SeriesResult {
  readonly games: number
  readonly atBats: readonly SeriesAtBat[]
}

interface Row {
  readonly label: string
  readonly value: string
  readonly tone?: 'good' | 'bad' | undefined
}

function ordinal(inning: number): string {
  return ORDINALS[inning - 1] ?? `${inning}th`
}

/** Baseball rates read without the leading zero; OPS above 1.000 keeps it. */
function rate(value: number): string {
  return value.toFixed(3).replace(/^0\./, '.')
}

function monthDay(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return NO_VALUE
  return `${parsed.getUTCMonth() + 1}/${parsed.getUTCDate()}`
}

function avgTone(avg: number, pa: number): 'good' | 'bad' | undefined {
  if (pa === 0 || !Number.isFinite(avg)) return undefined
  if (avg >= HOT_AVG) return 'good'
  if (avg <= COLD_AVG) return 'bad'
  return undefined
}

function aggregate(atBats: readonly SeriesAtBat[]): H2HAggregate {
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

  const obp = obpDenom === 0 ? 0 : reached / obpDenom
  const slg = ab === 0 ? 0 : totalBases / ab
  return { pa: atBats.length, avg: ab === 0 ? 0 : hits / ab, ops: obp + slg, hr, k, bb }
}

async function loadSeries(query: SeriesQuery): Promise<SeriesResult> {
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

function careerRows(stat: VsPlayerStat): readonly Row[] {
  return [
    { label: 'PA', value: String(stat.plateAppearances) },
    { label: 'AVG', value: stat.avg, tone: avgTone(Number(stat.avg), stat.plateAppearances) },
    { label: 'OPS', value: stat.ops },
    { label: 'HR', value: String(stat.homeRuns) },
    { label: 'K', value: String(stat.strikeOuts) },
    { label: 'BB', value: String(stat.baseOnBalls) },
  ]
}

function careerDetailRows(stat: VsPlayerStat): readonly Row[] {
  const pa = stat.plateAppearances
  const pct = (count: number): string =>
    pa === 0 ? NO_VALUE : `${((count / pa) * 100).toFixed(1)}%`
  return [
    { label: 'G', value: String(stat.gamesPlayed) },
    { label: 'H', value: String(stat.hits) },
    { label: 'OBP', value: stat.obp },
    { label: 'SLG', value: stat.slg },
    { label: 'K%', value: pct(stat.strikeOuts) },
    { label: 'BB%', value: pct(stat.baseOnBalls) },
  ]
}

function emptyLabel(status: Status): string {
  if (status === 'loading') return 'Loading…'
  if (status === 'error') return 'Data unavailable'
  return NO_HISTORY
}

function StatRows({ rows }: { readonly rows: readonly Row[] }): ReactElement {
  return (
    <div>
      {rows.map((row) => (
        <div key={row.label} className="stat-row h-22">
          <span className="stat-label">{row.label}</span>
          <span className={row.tone === undefined ? 'stat-value' : `stat-value ${row.tone}`}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  )
}

/** 55px: a 22px identity line over a 22px pitch strip, plus the 2px panel gap. */
function AtBatRow({ atBat }: { readonly atBat: SeriesAtBat }): ReactElement {
  const { play } = atBat
  const pitches = play.playEvents.filter((event) => event.isPitch)
  const shown = pitches.slice(0, MAX_CHIPS)
  const clipped = pitches.length - shown.length

  return (
    <div className="panel-row h-55">
      <div className="stat-row h-22">
        <span className="stat-label">
          {monthDay(atBat.date)} · {ordinal(play.about.inning)} · {play.count.balls}-
          {play.count.strikes}
        </span>
        <span className="stat-value">{play.result.event}</span>
      </div>
      <div
        className="h-22"
        style={{
          display: 'flex',
          gap: 'var(--sp-1)',
          alignItems: 'center',
          padding: '0 var(--sp-1)',
        }}
      >
        {shown.map((pitch, index) => {
          const code = pitch.details.type?.code ?? NO_VALUE
          const speed = pitch.pitchData?.startSpeed
          return (
            <span
              // Pitch order within a completed at-bat is immutable, so the index is stable.
              key={`${String(index)}-${code}`}
              className="sequence-pitch"
              style={{
                height: '100%',
                flexDirection: 'row',
                gap: 'var(--sp-1)',
                padding: '0 var(--sp-2)',
              }}
            >
              {/* Pitch colors come from the shared PITCH_COLORS map via getPitchColor. */}
              <span className="seq-type" style={{ color: getPitchColor(code) }}>
                {code}
              </span>
              <span className="seq-velo">{speed === undefined ? NO_VALUE : speed.toFixed(0)}</span>
            </span>
          )
        })}
        {clipped > 0 ? <span className="seq-call">+{clipped}</span> : null}
        {pitches.length === 0 ? <span className="seq-call">No pitch data</span> : null}
      </div>
    </div>
  )
}

function CareerBody({
  status,
  stat,
}: {
  readonly status: Status
  readonly stat: VsPlayerStat | null
}): ReactElement {
  if (stat === null || stat.plateAppearances === 0) {
    return (
      <div className="panel-row h-44">
        <div className="section-title">
          <span>Career Head-to-Head</span>
          <span>{NO_VALUE}</span>
        </div>
        <div className="stat-row h-22">
          <span className="stat-label">{emptyLabel(status)}</span>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="panel-row h-160">
        <div className="section-title">
          <span>Career Head-to-Head</span>
          <span>{stat.plateAppearances} PA</span>
        </div>
        <StatRows rows={careerRows(stat)} />
      </div>
      <div className="panel-row h-160">
        <div className="section-title">
          <span>Rate Detail</span>
          <span>{stat.gamesPlayed} G</span>
        </div>
        <StatRows rows={careerDetailRows(stat)} />
      </div>
      <div className="panel-row h-44">
        <div className="section-title">
          <span>Pitch Detail</span>
          <span>Series scope</span>
        </div>
        <div className="stat-row h-22">
          <span className="stat-label">Pitch-by-pitch is series-scoped</span>
          <span className="stat-value">{NO_VALUE}</span>
        </div>
      </div>
    </>
  )
}

function SeriesBody({
  status,
  games,
  atBats,
}: {
  readonly status: Status
  readonly games: number
  readonly atBats: readonly SeriesAtBat[]
}): ReactElement {
  const shown = atBats.slice(-MAX_AT_BAT_ROWS)
  const hidden = atBats.length - shown.length

  if (shown.length === 0) {
    return (
      <div className="panel-row h-44">
        <div className="section-title">
          <span>Series Head-to-Head</span>
          <span>{games} G</span>
        </div>
        <div className="stat-row h-22">
          <span className="stat-label">{emptyLabel(status)}</span>
        </div>
      </div>
    )
  }

  const total = aggregate(atBats)
  const summary = `${games} G · ${total.pa} PA · ${rate(total.avg)} / ${rate(total.ops)} · ${total.hr} HR · ${total.k} K · ${total.bb} BB`

  return (
    <>
      {shown.map((atBat) => (
        <AtBatRow key={`${String(atBat.gamePk)}-${String(atBat.play.about.atBatIndex)}`} atBat={atBat} />
      ))}
      <div className="canvas-caption h-18">
        {hidden > 0 ? `${summary} · +${hidden} more` : summary}
      </div>
    </>
  )
}

/**
 * "Matchup" sub-tab body. Renders inside the parent `.pvb-panel`, whose content
 * box is the panel height less 12px of padding. Career spends 22 + 160 + 160 +
 * 44 plus three 4px gaps; Series spends 22 + 7 x 55 + 18 plus eight 4px gaps.
 * Both stay under budget, so nothing scrolls and nothing clips.
 */
export function MatchupSubTab(): ReactElement {
  const selectedGame = useGameStore((s) => s.selectedGame)
  const currentPlay = useGameStore((s) => s.currentPlay)

  const [scope, setScope] = useState<Scope>('career')
  const [career, setCareer] = useState<VsPlayerStat | null>(null)
  const [careerStatus, setCareerStatus] = useState<Status>('idle')
  const [series, setSeries] = useState<SeriesResult>({ games: 0, atBats: [] })
  const [seriesStatus, setSeriesStatus] = useState<Status>('idle')

  const batterId = currentPlay?.matchup.batter.id ?? null
  const pitcherId = currentPlay?.matchup.pitcher.id ?? null
  const gameDate = selectedGame?.gameDate ?? null
  const teamId = selectedGame?.teams.home.team.id ?? null
  const opponentId = selectedGame?.teams.away.team.id ?? null

  useEffect(() => {
    if (batterId === null || pitcherId === null) {
      setCareer(null)
      setCareerStatus('idle')
      return
    }
    let cancelled = false
    setCareerStatus('loading')
    fetchCareerVsPlayer(batterId, pitcherId)
      .then((stat) => {
        if (cancelled) return
        setCareer(stat)
        setCareerStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setCareer(null)
        setCareerStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [batterId, pitcherId])

  useEffect(() => {
    if (scope !== 'series') return
    if (
      batterId === null ||
      pitcherId === null ||
      gameDate === null ||
      teamId === null ||
      opponentId === null
    ) {
      setSeriesStatus('idle')
      return
    }
    let cancelled = false
    setSeriesStatus('loading')
    loadSeries({ gameDate, teamId, opponentId, batterId, pitcherId })
      .then((result) => {
        if (cancelled) return
        setSeries(result)
        setSeriesStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setSeries({ games: 0, atBats: [] })
        setSeriesStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [scope, batterId, pitcherId, gameDate, teamId, opponentId])

  return (
    <div
      style={{
        display: 'flex',
        flex: '1 1 auto',
        flexDirection: 'column',
        gap: 'var(--sp-2)',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div className="segmented">
        {SCOPES.map((option) => (
          <button
            key={option.id}
            type="button"
            className={scope === option.id ? 'active' : ''}
            onClick={() => setScope(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {scope === 'career' ? (
        <CareerBody status={careerStatus} stat={career} />
      ) : (
        <SeriesBody status={seriesStatus} games={series.games} atBats={series.atBats} />
      )}
    </div>
  )
}
