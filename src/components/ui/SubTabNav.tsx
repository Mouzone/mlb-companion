import type { ReactElement } from 'react'

/**
 * SubTabNav — secondary navigation (DESIGN.md §5.6).
 *
 * Identical semantics and equal-fraction sizing to MiniNav, differing only in
 * chrome: --c-surface-sunken ground, --c-border bottom rule.
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
