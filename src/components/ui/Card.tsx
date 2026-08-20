import type { ReactElement, ReactNode } from 'react'

/**
 * Card — bordered content container (DESIGN.md §5.3).
 *
 * Border-defined, not shadow-defined. A card carries NO fixed height ever: it
 * is exactly as tall as its content (§6.3, the dead-space doctrine).
 */

export type CardTone = 'default' | 'sunken' | 'live'
export type CardElement = 'div' | 'article' | 'section'

export interface CardProps {
  readonly children: ReactNode
  readonly padded?: boolean
  readonly tone?: CardTone
  readonly className?: string
  readonly as?: CardElement
}

export function Card({
  children,
  padded = true,
  tone = 'default',
  className,
  as = 'div',
}: CardProps): ReactElement {
  const Tag = as
  const classes = ['ui-card', `ui-card--${tone}`]
  if (padded) classes.push('ui-card--padded')
  if (className) classes.push(className)

  return <Tag className={classes.join(' ')}>{children}</Tag>
}

export default Card
