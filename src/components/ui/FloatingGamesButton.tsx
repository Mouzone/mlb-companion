import type { ReactElement } from 'react'
import { Icon } from './Icon'

export interface FloatingGamesButtonProps {
  readonly onClick: () => void
}

export function FloatingGamesButton({ onClick }: FloatingGamesButtonProps): ReactElement {
  return (
    <button type="button" className="floating-games-btn" onClick={onClick} aria-label="Back to games">
      <Icon name="chevron-left" size={16} />
      <span className="floating-games-btn__label">Games</span>
    </button>
  )
}

export default FloatingGamesButton
