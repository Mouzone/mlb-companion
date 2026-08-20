import type { ReactElement, ReactNode } from 'react'

/**
 * SectionTitle (DESIGN.md §5.10).
 *
 * Title and meta sit on a SHARED BASELINE (`align-items: baseline`) and differ
 * in BOTH size and colour (§3.3), so metadata never competes with the title.
 *
 * The component contributes ZERO left padding of its own — the parent owns the
 * gutter. That is the fix for the "three competing left edges" defect, where a
 * title, its card, and the content beneath it each introduced their own inset.
 */

export interface SectionTitleProps {
  readonly children: ReactNode
  readonly meta?: ReactNode
}

export function SectionTitle({
  children,
  meta,
}: SectionTitleProps): ReactElement {
  const hasMeta = meta !== null && meta !== undefined && meta !== ''

  return (
    <div className="ui-section-title">
      <h2 className="ui-section-title__text">{children}</h2>
      {hasMeta ? <span className="ui-section-title__meta">{meta}</span> : null}
    </div>
  )
}

export default SectionTitle
