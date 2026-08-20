import type { ReactElement, ReactNode } from 'react'

/**
 * Badge — status pill (DESIGN.md §5.4).
 *
 * Text is --fs-label (11px) and never smaller: uppercase + --tracking-caps
 * below 11px is banned by §3.3 because tracking at that size destroys
 * legibility. The `live` tone pairs its hue with a pulsing dot so status is
 * never carried by colour alone (§7).
 */

export type BadgeTone =
  | 'live'
  | 'final'
  | 'preview'
  | 'positive'
  | 'negative'
  | 'neutral'

export interface BadgeProps {
  readonly children: ReactNode
  readonly tone: BadgeTone
}

export function Badge({ children, tone }: BadgeProps): ReactElement {
  return (
    <span className={`ui-badge ui-badge--${tone}`}>
      {tone === 'live' ? <span className="ui-badge__dot" aria-hidden="true" /> : null}
      <span className="ui-badge__text">{children}</span>
    </span>
  )
}

export default Badge
