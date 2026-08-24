import type { ReactElement } from 'react'
import { Badge, PlayerAvatar, ScoreRing, TeamLogo } from '../ui'
import type { BadgeTone } from '../ui'
import type { ScheduledGame } from '../../api/types'
import type { CurrentPitcher } from '../../hooks/useLiveScores'

/**
 * GameCard (DESIGN.md §6.5).
 *
 * `fetchSchedule` hydrates `probablePitcher,linescore,team`, so the payload
 * carries `teams.<side>.leagueRecord` and a top-level `linescore` that
 * `ScheduledGame` does not declare — and `src/api/*` is out of scope here.
 * Those two extras are therefore read through runtime guards rather than a
 * type assertion: passing a `ScheduledGame` into an `unknown` parameter is
 * always sound, and every field is narrowed before use, so a schema change
 * degrades to a missing line instead of a crash.
 */

type Side = 'away' | 'home'

interface LinescoreState {
  readonly currentInning: number | null
  readonly inningState: string | null
  readonly outs: number | null
  readonly scheduledInnings: number | null
}

interface StatusChip {
  readonly tone: BadgeTone
  readonly text: string
  readonly detail: string | null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function numberAt(source: Record<string, unknown>, key: string): number | null {
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringAt(source: Record<string, unknown>, key: string): string | null {
  const value = source[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** `leagueRecord: { wins, losses }` first; the declared `record` string is the fallback. */
function readRecord(side: unknown): string | null {
  if (!isObject(side)) return null
  const league = side.leagueRecord
  if (isObject(league)) {
    const wins = numberAt(league, 'wins')
    const losses = numberAt(league, 'losses')
    if (wins !== null && losses !== null) return `${wins}-${losses}`
  }
  return stringAt(side, 'record')
}

function readLinescore(game: unknown): LinescoreState | null {
  if (!isObject(game)) return null
  const line = game.linescore
  if (!isObject(line)) return null
  return {
    currentInning: numberAt(line, 'currentInning'),
    inningState: stringAt(line, 'inningState'),
    outs: numberAt(line, 'outs'),
    scheduledInnings: numberAt(line, 'scheduledInnings'),
  }
}

function startTime(iso: string): string | null {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  return at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function liveDetail(line: LinescoreState | null): string | null {
  if (line === null) return null
  const parts: string[] = []
  if (line.inningState !== null && line.currentInning !== null) {
    parts.push(`${line.inningState.toUpperCase()} ${line.currentInning}`)
  }
  if (line.outs !== null) parts.push(`${line.outs} OUT`)
  return parts.length > 0 ? parts.join(' · ') : null
}

function statusChip(game: ScheduledGame, line: LinescoreState | null): StatusChip {
  const state = game.status.abstractGameState
  if (state === 'Live') {
    return { tone: 'live', text: 'LIVE', detail: liveDetail(line) }
  }
  if (state === 'Final') {
    const inning = line?.currentInning ?? null
    const scheduled = line?.scheduledInnings ?? null
    const wentLong = inning !== null && scheduled !== null && inning > scheduled
    return { tone: 'final', text: wentLong && inning !== null ? `FINAL/${inning}` : 'FINAL', detail: null }
  }
  return {
    tone: 'preview',
    text: game.status.detailedState.length > 0 ? game.status.detailedState : 'Scheduled',
    detail: startTime(game.gameDate),
  }
}

function probableFor(game: ScheduledGame, side: Side): { id: number; fullName: string } | null {
  return game.teams[side].probablePitcher ?? game.probablePitcher?.[side] ?? null
}

const NAME_MAX = 15

/* Box-score convention: the surname identifies the pitcher, so it survives
   intact and the given name reduces to an initial ("Yoshinobu Yamamoto" ->
   "Y. Yamamoto"). Everything after the first token is kept so suffixes ride
   along ("Ronald Acuna Jr." -> "R. Acuna Jr."). */
function shortenName(fullName: string): string {
  if (fullName.length <= NAME_MAX) return fullName
  const [first, ...rest] = fullName.split(' ').filter((part) => part.length > 0)
  if (first === undefined || rest.length === 0) return fullName
  return `${first.charAt(0)}. ${rest.join(' ')}`
}

export interface GameCardProps {
  readonly game: ScheduledGame
  readonly onSelect: (game: ScheduledGame) => void
  /** 0-100 watchability. `null` while the nightly payload is loading or absent. */
  readonly watchability?: number | null
  /** Current pitcher on the mound for live games, from the Cloud Function. */
  readonly currentPitcher?: CurrentPitcher | null
}

export function GameCard({ game, onSelect, watchability = null, currentPitcher = null }: GameCardProps): ReactElement {
  const away = game.teams.away
  const home = game.teams.home
  const line = readLinescore(game)
  const chip = statusChip(game, line)
  const venue = game.venue?.name ?? null

  const scores =
    typeof away.score === 'number' && typeof home.score === 'number'
      ? { away: away.score, home: home.score }
      : null

  const awayProbable = probableFor(game, 'away')
  const homeProbable = probableFor(game, 'home')

  const isLive = chip.tone === 'live'
  const livePitcherSide: Side | null =
    isLive && currentPitcher !== null ? currentPitcher.fieldingSide : null

  const label = scores
    ? `${away.team.name} ${scores.away}, ${home.team.name} ${scores.home}. ${chip.text}`
    : `${away.team.name} at ${home.team.name}. ${chip.text}`

  function teamRow(side: Side): ReactElement {
    const entry = game.teams[side]
    const record = readRecord(entry)
    const score = scores === null ? null : scores[side]
    const other = scores === null ? null : scores[side === 'away' ? 'home' : 'away']
    const trailing = score !== null && other !== null && score < other

    // A <button> only admits phrasing content, so rows are spans, not divs.
    return (
      <span className="gc-team">
        <TeamLogo teamId={entry.team.id} abbreviation={entry.team.abbreviation} size="lg" />
        <span className="gc-identity">
          <span className="gc-name">{entry.team.name}</span>
          {record !== null ? <span className="gc-record">{record}</span> : null}
        </span>
        <span className={trailing ? 'gc-score gc-score--trail' : 'gc-score'}>{score}</span>
      </span>
    )
  }

  function probable(side: Side, pitcher: { id: number; fullName: string }, role: string = 'SP'): ReactElement {
    return (
      <span className="gc-probable">
        <PlayerAvatar personId={pitcher.id} name={pitcher.fullName} size="sm" />
        <span className="gc-probable-text">
          <span className="gc-probable-name">{shortenName(pitcher.fullName)}</span>
          <span className="gc-probable-role">{game.teams[side].team.abbreviation} {role}</span>
        </span>
      </span>
    )
  }

  return (
    <button type="button" className="game-card" onClick={() => onSelect(game)} aria-label={label}>
      <span className="gc-head">
        <span className="gc-teams">
          {teamRow('away')}
          {teamRow('home')}
        </span>
        <ScoreRing score={watchability} size="lg" live={chip.tone === 'live'} />
      </span>

      <span className="gc-footer">
        <Badge tone={chip.tone}>{chip.text}</Badge>
        {chip.detail !== null ? <span className="gc-detail">{chip.detail}</span> : null}
        {venue !== null ? <span className="gc-venue">{venue}</span> : null}
      </span>

      {awayProbable !== null || homeProbable !== null || livePitcherSide !== null ? (
        <span className="gc-probables">
          {livePitcherSide === 'away' && currentPitcher !== null
            ? probable('away', currentPitcher, 'P')
            : awayProbable !== null
              ? probable('away', awayProbable)
              : <span className="gc-probable" />}
          {livePitcherSide === 'home' && currentPitcher !== null
            ? probable('home', currentPitcher, 'P')
            : homeProbable !== null
              ? probable('home', homeProbable)
              : <span className="gc-probable" />}
        </span>
      ) : null}
    </button>
  )
}

export default GameCard
