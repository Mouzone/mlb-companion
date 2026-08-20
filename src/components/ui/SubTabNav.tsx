import type { ReactElement } from 'react'

/**
 * SubTabNav — secondary navigation (DESIGN.md §5.6).
 *
 * Identical semantics and equal-fraction sizing to TabBar, differing only in
 * chrome: --sub-tab-h tall, --c-surface-sunken ground, --c-border bottom rule.
 * Kept as its own component rather than a TabBar variant so the two bars can
 * diverge (icons, counts) without one leaking into the other.
 */

export interface SubTabDescriptor {
  readonly id: string
  readonly label: string
}

export interface SubTabNavProps {
  readonly tabs: ReadonlyArray<SubTabDescriptor>
  readonly activeId: string
  readonly onSelect: (id: string) => void
}

export function SubTabNav({
  tabs,
  activeId,
  onSelect,
}: SubTabNavProps): ReactElement {
  return (
    <div className="ui-sub-tab-nav" role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === activeId
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? 'ui-sub-tab ui-sub-tab--active' : 'ui-sub-tab'}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

export default SubTabNav
