import { useRef, useCallback } from 'react'
import type { ReactElement, RefObject } from 'react'
import { useGameStore } from '../store/gameStore'
import { MiniNav, type MiniNavItem } from './ui'
import { LiveAtBat } from './LiveAtBat/LiveAtBat'
import { MatchupSubTab } from './PitcherVsBatter/MatchupSubTab'
import { PitcherGameSubTab } from './LiveGame/PitcherGameSubTab'
import { BatterGameSubTab } from './LiveGame/BatterGameSubTab'
import { PitchingSubTab } from './PitcherVsBatter/PitchingSubTab'
import { BattingSubTab } from './PitcherVsBatter/BattingSubTab'

const NAV_ITEMS: ReadonlyArray<MiniNavItem> = [
  { id: 'ab', label: 'AB' },
  { id: 'matchup', label: 'Matchup' },
  { id: 'game', label: 'Game' },
  { id: 'pitching', label: 'Pit' },
  { id: 'batting', label: 'Bat' },
]

export function GameScreen(): ReactElement {
  const scrollAnchor = useGameStore((s) => s.scrollAnchor)
  const setScrollAnchor = useGameStore((s) => s.setScrollAnchor)

  const abRef = useRef<HTMLElement>(null)
  const matchupRef = useRef<HTMLElement>(null)
  const gameRef = useRef<HTMLElement>(null)
  const pitchingRef = useRef<HTMLElement>(null)
  const battingRef = useRef<HTMLElement>(null)

  const handleNav = useCallback((id: string) => {
    setScrollAnchor(id as typeof scrollAnchor)
    const refMap: Record<string, RefObject<HTMLElement | null>> = {
      ab: abRef,
      matchup: matchupRef,
      game: gameRef,
      pitching: pitchingRef,
      batting: battingRef,
    }
    refMap[id]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [setScrollAnchor])

  return (
    <div className="game-screen">
      <MiniNav items={NAV_ITEMS} activeId={scrollAnchor} onSelect={handleNav} />
      <div className="game-scroll">
        <section id="ab" ref={abRef} className="game-section">
          <LiveAtBat />
        </section>
        <section id="matchup" ref={matchupRef} className="game-section">
          <MatchupSubTab />
        </section>
        <section id="game" ref={gameRef} className="game-section">
          <div className="game-subsection">
            <PitcherGameSubTab />
          </div>
          <div className="game-subsection">
            <BatterGameSubTab />
          </div>
        </section>
        <div className="pb-carousel">
          <section id="pitching" ref={pitchingRef} className="pb-card game-subsection">
            <PitchingSubTab />
          </section>
          <section id="batting" ref={battingRef} className="pb-card game-subsection">
            <BattingSubTab />
          </section>
        </div>
      </div>
    </div>
  )
}
