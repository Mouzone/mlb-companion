import type { ReactElement } from 'react'

/**
 * Segmented — scope switcher (DESIGN.md §5.7).
 *
 * Track height is 32px (sm) / 36px (md), both derived from the spacing grid.
 * The visible track stays that short so it reads as a control rather than a
 * bar, while each option carries a transparent ::after that expands its
 * pointer target to 44px — satisfying §7's 44×44 minimum without inflating
 * the visual footprint. The expander is centred on the option, so it never
 * reaches beyond the control's own 44px envelope.
 */

export interface SegmentedOption {
  readonly id: string
  readonly label: string
}

export type SegmentedSize = 'sm' | 'md'

export interface SegmentedProps {
  readonly options: ReadonlyArray<SegmentedOption>
  readonly activeId: string
  readonly onSelect: (id: string) => void
  readonly size?: SegmentedSize
}

export function Segmented({
  options,
  activeId,
  onSelect,
  size = 'sm',
}: SegmentedProps): ReactElement {
  return (
    <div className={`ui-segmented ui-segmented--${size}`} role="group">
      {options.map((option) => {
        const active = option.id === activeId
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            className={
              active
                ? 'ui-segmented__option ui-segmented__option--active'
                : 'ui-segmented__option'
            }
            onClick={() => onSelect(option.id)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default Segmented
