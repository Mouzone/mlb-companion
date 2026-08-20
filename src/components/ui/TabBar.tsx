import type { ReactElement } from 'react'

/**
 * TabBar — primary navigation (DESIGN.md §5.5).
 *
 * Every tab is `flex: 1 1 0; min-width: 0`, so each label is optically centred
 * inside an exact fraction of the bar. This is the fix for the
 * "Pitching sits left of centre" defect: `flex: 1` alone sizes from content
 * width, `flex: 1 1 0` sizes from zero and yields true equal fractions.
 *
 * The active rule spans the FULL tab width (a ::after strip, not an inset
 * border), and every tab is left in the tab order — no roving tabIndex,
 * because arrow-key navigation is not implemented here and removing tabs from
 * the sequence without it would strand keyboard users (§7).
 */

export interface TabDescriptor {
  readonly id: string
  readonly label: string
}

export interface TabBarProps {
  readonly tabs: ReadonlyArray<TabDescriptor>
  readonly activeId: string
  readonly onSelect: (id: string) => void
}

export function TabBar({ tabs, activeId, onSelect }: TabBarProps): ReactElement {
  return (
    <div className="ui-tab-bar" role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === activeId
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? 'ui-tab ui-tab--active' : 'ui-tab'}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

export default TabBar
