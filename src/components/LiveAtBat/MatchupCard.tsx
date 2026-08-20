import type { ReactElement } from 'react'
import { PlayerAvatar, SectionTitle, TeamLogo } from '../ui'
import { NO_VALUE } from './liveAtBatFormat'

/**
 * Matchup header. The grid is `1fr auto 1fr`, so the two player columns are
 * mathematically equal and "VS" is exactly between them — the old flex layout
 * let one side start at x≈12 while the other started at x≈210.
 *
 * The pitcher takes the leading column here and in every other pitcher/batter
 * pair in the app: he sets the terms of the plate appearance, so he is what
 * you read first.
 *
 * Each side renders the SAME four rows (avatar · name · affiliation · game
 * line), which is what keeps the two columns the same height and fills the
 * ~50px of empty lower interior the old card carried.
 */

export interface MatchupSide {
  readonly personId: number
  readonly name: string
  readonly teamId: number
  readonly teamAbbreviation: string
  /** `LHB` / `RHP` — printed, never encoded in colour alone. */
  readonly hand: string
  /** Game line for this player: "0-3, BB" or "10 P · 80% S". */
  readonly line: string
  readonly hasPlatoonEdge: boolean
}

export interface MatchupCardProps {
  readonly batter: MatchupSide
  readonly pitcher: MatchupSide
  readonly meta: string
}

function Side({
  side,
  align,
  role,
}: {
  readonly side: MatchupSide
  readonly align: 'start' | 'end'
  readonly role: string
}): ReactElement {
  return (
    <div className={`matchup__side matchup__side--${align}`}>
      <PlayerAvatar personId={side.personId} name={side.name} size="md" />
      <span className="player-name">{side.name}</span>
      <span className="matchup__meta">
        <TeamLogo teamId={side.teamId} abbreviation={side.teamAbbreviation} size="sm" />
        <span className="matchup__affiliation">
          {side.teamAbbreviation} · {side.hand}
        </span>
      </span>
      <span className="matchup__role">
        {role}
        {side.hasPlatoonEdge ? <span className="matchup__edge"> · Edge</span> : null}
      </span>
      <span className="matchup__line">{side.line === '' ? NO_VALUE : side.line}</span>
    </div>
  )
}

export function MatchupCard({ batter, pitcher, meta }: MatchupCardProps): ReactElement {
  return (
    <section className="panel-row matchup" aria-label="Matchup">
      <SectionTitle meta={meta}>Matchup</SectionTitle>
      <div className="matchup__grid">
        <Side side={pitcher} align="start" role="Pitching" />
        <span className="matchup-vs" aria-hidden="true">
          VS
        </span>
        <Side side={batter} align="end" role="At bat" />
      </div>
    </section>
  )
}
