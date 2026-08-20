import type { ReactElement } from 'react'

/**
 * Icon (DESIGN.md §5.13).
 *
 * Hand-authored inline SVG only — zero icon dependencies are permitted, and
 * emoji are never used as icons. Every glyph paints in `currentColor`, so an
 * icon inherits whatever ink its context already established.
 *
 * The 0-24 numbers below are viewBox coordinates, not layout pixels: the
 * rendered box is driven entirely by `size`.
 */

export type IconName =
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'dot-live'
  | 'diamond'

export interface IconProps {
  readonly name: IconName
  readonly size?: number
  readonly className?: string
}

const GLYPHS: Record<IconName, ReactElement> = {
  'chevron-left': <path d="M15 4.5 7.5 12 15 19.5" />,
  'chevron-right': <path d="M9 4.5 16.5 12 9 19.5" />,
  'chevron-down': <path d="M4.5 9 12 16.5 19.5 9" />,
  'dot-live': <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />,
  diamond: <path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" />,
}

export function Icon({ name, size = 16, className }: IconProps): ReactElement {
  return (
    <svg
      className={className ? `ui-icon ${className}` : 'ui-icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[name]}
    </svg>
  )
}

export default Icon
