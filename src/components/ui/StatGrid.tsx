import type { CSSProperties, ReactElement, ReactNode } from 'react'

/**
 * StatGrid — responsive stat matrix (DESIGN.md §5.2).
 *
 * The column template is authored in ui.css as
 * `repeat(auto-fit, minmax(min(var(--stat-grid-min), 100%), 1fr))`. The
 * `min(…, 100%)` form is MANDATORY: without it the track floor stays at the
 * pixel minimum and the grid overflows its container at narrow widths.
 */

type StyleWithVars = CSSProperties & Record<`--${string}`, string>

export interface StatGridProps {
  readonly children: ReactNode
  /** Column floor in CSS px, forwarded as the --stat-grid-min custom property. */
  readonly minColumnWidth?: number
  readonly className?: string
}

export function StatGrid({
  children,
  minColumnWidth = 72,
  className,
}: StatGridProps): ReactElement {
  const style: StyleWithVars = { '--stat-grid-min': `${minColumnWidth}px` }

  return (
    <div
      className={className ? `ui-stat-grid ${className}` : 'ui-stat-grid'}
      style={style}
    >
      {children}
    </div>
  )
}

export default StatGrid
