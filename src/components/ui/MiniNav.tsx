import type { ReactElement } from 'react'

export interface MiniNavItem {
  readonly id: string
  readonly label: string
}

export interface MiniNavProps {
  readonly items: ReadonlyArray<MiniNavItem>
  readonly activeId: string
  readonly onSelect: (id: string) => void
}

export function MiniNav({ items, activeId, onSelect }: MiniNavProps): ReactElement {
  return (
    <div className="ui-mini-nav" role="tablist">
      {items.map((item) => {
        const active = item.id === activeId
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? 'ui-mini-nav__item ui-mini-nav__item--active' : 'ui-mini-nav__item'}
            onClick={() => onSelect(item.id)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

export default MiniNav
