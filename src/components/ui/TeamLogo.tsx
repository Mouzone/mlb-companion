import { useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { teamLogoUrl } from '../../utils/mlbAssets'

/**
 * TeamLogo (DESIGN.md §5.8).
 *
 * White-first, so only the `-on-light` variants are reachable through props.
 *
 * FALLBACK: an invalid teamId returns HTTP 404 from mlbstatic, so `onError`
 * DOES fire (TEAM_LOGO_ERRORS_ON_MISSING === true) — the error path swaps in
 * an abbreviation chip of the identical square footprint, so nothing reflows.
 * The failure is recorded against the teamId that produced it, which resets
 * the fallback automatically when the prop changes.
 */

type StyleWithVars = CSSProperties & Record<`--${string}`, string>

export type TeamLogoSize = 'sm' | 'md' | 'lg'
export type TeamLogoVariant = 'cap-on-light' | 'primary-on-light'

export interface TeamLogoProps {
  readonly teamId: number
  readonly abbreviation: string
  readonly size?: TeamLogoSize
  readonly variant?: TeamLogoVariant
  /**
   * Supply only when the logo stands alone. In a row that already prints the
   * abbreviation, the image is decorative: alt="" + aria-hidden.
   */
  readonly alt?: string
}

const SIZE_PX: Record<TeamLogoSize, number> = { sm: 24, md: 32, lg: 44 }

export function TeamLogo({
  teamId,
  abbreviation,
  size = 'sm',
  variant = 'cap-on-light',
  alt,
}: TeamLogoProps): ReactElement {
  const [failedTeamId, setFailedTeamId] = useState<number | null>(null)
  const px = SIZE_PX[size]
  const style: StyleWithVars = { '--ui-logo-size': `${px}px` }
  const labelled = alt !== undefined && alt !== ''

  if (failedTeamId === teamId) {
    return (
      <span
        className="ui-team-logo ui-team-logo--fallback"
        style={style}
        role={labelled ? 'img' : undefined}
        aria-label={labelled ? alt : undefined}
        aria-hidden={labelled ? undefined : true}
      >
        {abbreviation}
      </span>
    )
  }

  return (
    <img
      className="ui-team-logo"
      style={style}
      src={teamLogoUrl(teamId, variant)}
      alt={labelled ? alt : ''}
      aria-hidden={labelled ? undefined : true}
      width={px}
      height={px}
      loading="lazy"
      decoding="async"
      onError={() => setFailedTeamId(teamId)}
    />
  )
}

export default TeamLogo
