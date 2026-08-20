import type { CSSProperties, ReactElement } from 'react'

/**
 * EmptyPanel + Skeleton (DESIGN.md §5.12).
 *
 * Neither carries a fixed height. EmptyPanel declares `min-height` only, so it
 * grows with its message instead of clipping it (§6.3). Skeleton reserves the
 * exact box its content will occupy, which is what keeps load from shifting
 * layout — its shimmer animates `transform` alone (GPU-composited, §4.4) and
 * is nulled under prefers-reduced-motion.
 */

type StyleWithVars = CSSProperties & Record<`--${string}`, string>

export interface EmptyPanelProps {
  readonly message: string
  readonly hint?: string
}

export function EmptyPanel({ message, hint }: EmptyPanelProps): ReactElement {
  return (
    <div className="ui-empty-panel">
      <p className="ui-empty-panel__message">{message}</p>
      {hint ? <p className="ui-empty-panel__hint">{hint}</p> : null}
    </div>
  )
}

export interface SkeletonProps {
  readonly width?: string
  readonly height?: string
  readonly radius?: string
}

export function Skeleton({
  width = '100%',
  height = 'var(--sp-5)',
  radius = 'var(--radius-sm)',
}: SkeletonProps): ReactElement {
  const style: StyleWithVars = {
    '--ui-skeleton-w': width,
    '--ui-skeleton-h': height,
    '--ui-skeleton-r': radius,
  }

  return <span className="ui-skeleton" style={style} aria-hidden="true" />
}

export default EmptyPanel
