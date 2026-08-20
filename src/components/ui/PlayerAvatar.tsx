import type { CSSProperties, ReactElement } from 'react'
import { playerHeadshotUrl } from '../../utils/mlbAssets'
import type { HeadshotSize } from '../../utils/mlbAssets'

/**
 * PlayerAvatar (DESIGN.md §5.9).
 *
 * NO onError PATH — DELIBERATE. A missing player does not 404: the MLB
 * Cloudinary route carries `d_people:generic:headshot:67:current.png`, so an
 * unknown personId returns the generic silhouette with HTTP 200
 * (PLAYER_IMAGE_ERRORS_ON_MISSING === false). `onError` therefore never fires
 * and any fallback branch written here would be unreachable dead code. The
 * silhouette IS the accepted fallback.
 */

type StyleWithVars = CSSProperties & Record<`--${string}`, string>

export type PlayerAvatarSize = 'sm' | 'md' | 'lg' | 'xl'

export interface PlayerAvatarProps {
  readonly personId: number
  readonly name: string
  readonly size?: PlayerAvatarSize
}

const SIZE_PX: Record<PlayerAvatarSize, number> = {
  sm: 32,
  md: 40,
  lg: 64,
  xl: 96,
}

/**
 * CSS size → CDN request size. The CDN keys resolve to 96/140/213/320px, so
 * each mapping requests at least 2× the rendered box and stays crisp on
 * retina without over-fetching a 320px asset for a 32px chip.
 */
const CDN_SIZE: Record<PlayerAvatarSize, HeadshotSize> = {
  sm: 'sm',
  md: 'sm',
  lg: 'md',
  xl: 'lg',
}

export function PlayerAvatar({
  personId,
  name,
  size = 'sm',
}: PlayerAvatarProps): ReactElement {
  const px = SIZE_PX[size]
  const style: StyleWithVars = { '--ui-avatar-size': `${px}px` }

  return (
    <img
      className="ui-player-avatar"
      style={style}
      src={playerHeadshotUrl(personId, CDN_SIZE[size])}
      alt={name}
      width={px}
      height={px}
      loading="lazy"
      decoding="async"
    />
  )
}

export default PlayerAvatar
