import type { ReactElement } from 'react'
import type { LiveFeed } from '../../api/types'
import { Badge, TeamLogo } from '../ui'
import type { BadgeTone } from '../ui'
import { deriveInningColumns } from './liveAtBatData'
import type { BaseState, InningColumn } from './liveAtBatData'

/**
 * Scoreboard — back button, baserunner diamond, status and inning pill on ONE
 * centre axis, above a real inning-by-inning line score.
 *
 * The old screen printed only R/H/E as two loose flex rows, so labels and
 * values never formed stable column edges. A `table-layout: fixed` table makes
 * every column edge structural instead of typographic, and the inning columns
 * are pure density — those runs were already in the feed, just never rendered.
 */

type GameStatus = LiveFeed['gameData']['status']['abstractGameState']

const STATUS_TONE: Readonly<Record<GameStatus, BadgeTone>> = {
  Preview: 'preview',
  Live: 'live',
  Final: 'final',
}

interface TeamLine {
  readonly id: number
  readonly abbreviation: string
  readonly name: string
  readonly runs: number
  readonly hits: number
  readonly errors: number
  readonly isAway: boolean
  readonly isBatting: boolean
}

export interface ScoreboardCardProps {
  readonly feed: LiveFeed
  readonly isTopInning: boolean
  readonly inningNumber: number
  readonly bases: readonly BaseState[]
  readonly onBack: () => void
}

/** A half-inning that has not been played prints a centre dot, never a zero. */
function inningCell(runs: number | null): string {
  return runs === null ? '·' : String(runs)
}

function TeamRow({
  team,
  innings,
}: {
  readonly team: TeamLine
  readonly innings: readonly InningColumn[]
}): ReactElement {
  const rowClass = team.isBatting ? 'linescore__row linescore__row--batting' : 'linescore__row'

  return (
    <tr className={rowClass}>
      <th scope="row" className="linescore__team">
        <span className="linescore__team-inner">
          <TeamLogo teamId={team.id} abbreviation={team.abbreviation} size="sm" />
          <span className="linescore__abbr">{team.abbreviation}</span>
        </span>
      </th>
      {innings.map((inning) => (
        <td key={inning.number} className="linescore__inning">
          {inningCell(team.isAway ? inning.away : inning.home)}
        </td>
      ))}
      <td className="linescore__total linescore__total--runs">{team.runs}</td>
      <td className="linescore__total">{team.hits}</td>
      <td className="linescore__total">{team.errors}</td>
    </tr>
  )
}

export function ScoreboardCard({
  feed,
  isTopInning,
  inningNumber,
  bases,
  onBack,
}: ScoreboardCardProps): ReactElement {
  const { linescore } = feed.liveData
  const teams = feed.gameData.teams
  const status = feed.gameData.status
  const innings = deriveInningColumns(linescore)

  const rows: readonly TeamLine[] = [
    {
      id: teams.away.id,
      abbreviation: teams.away.abbreviation,
      name: teams.away.name,
      runs: linescore.teams.away.runs,
      hits: linescore.teams.away.hits,
      errors: linescore.teams.away.errors,
      isAway: true,
      isBatting: isTopInning,
    },
    {
      id: teams.home.id,
      abbreviation: teams.home.abbreviation,
      name: teams.home.name,
      runs: linescore.teams.home.runs,
      hits: linescore.teams.home.hits,
      errors: linescore.teams.home.errors,
      isAway: false,
      isBatting: !isTopInning,
    },
  ]

  const occupied = bases.filter((base) => base.runner !== null)
  const basesLabel =
    occupied.length === 0
      ? 'Bases empty'
      : `Runners on ${occupied.map((base) => base.label).join(', ')}`

  return (
    <section className="scoreboard" aria-label="Scoreboard">
      <div className="game-header">
        <button type="button" className="btn-back" onClick={onBack}>
          ← Games
        </button>
        <div className="bases" role="img" aria-label={basesLabel}>
          {bases.map((base) => (
            <span key={base.label} className={base.runner === null ? 'base' : 'base occupied'} />
          ))}
        </div>
        <Badge tone={STATUS_TONE[status.abstractGameState]}>{status.detailedState}</Badge>
        <span className="counter">
          {isTopInning ? 'Top' : 'Bot'} {inningNumber}
        </span>
      </div>

      <table className="linescore">
        <caption className="a11y-only">
          {`Line score by inning. ${teams.away.name} ${linescore.teams.away.runs}, ` +
            `${teams.home.name} ${linescore.teams.home.runs}.`}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="linescore__team linescore__head">
              Team
            </th>
            {innings.map((inning) => (
              <th key={inning.number} scope="col" className="linescore__inning linescore__head">
                {inning.number}
              </th>
            ))}
            <th scope="col" className="linescore__total linescore__total--runs linescore__head">
              R
            </th>
            <th scope="col" className="linescore__total linescore__head">
              H
            </th>
            <th scope="col" className="linescore__total linescore__head">
              E
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((team) => (
            <TeamRow key={team.abbreviation} team={team} innings={innings} />
          ))}
        </tbody>
      </table>
    </section>
  )
}
