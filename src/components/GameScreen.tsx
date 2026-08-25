import { useCallback } from 'react'
import type { ReactElement } from 'react'
import { useGameStore } from '../store/gameStore'
import { MiniNav, type MiniNavItem } from './ui'
import { LiveAtBat } from './LiveAtBat/LiveAtBat'
import { MatchupSubTab } from './PitcherVsBatter/MatchupSubTab'
import { PitcherGameSubTab } from './LiveGame/PitcherGameSubTab'
import { BatterGameSubTab } from './LiveGame/BatterGameSubTab'
import { LogsSubTab } from './PitcherVsBatter/LogsSubTab'

const NAV_ITEMS: ReadonlyArray<MiniNavItem> = [
  { id: 'ab', label: 'AB' },
  { id: 'matchup', label: 'Matchup' },
  { id: 'game', label: 'Game' },
  { id: 'logs', label: 'Logs' },
]

export function GameScreen(): ReactElement {
  const activeTab = useGameStore((s) => s.activeTab)
  const setActiveTab = useGameStore((s) => s.setActiveTab)

  const handleNav = useCallback((id: string) => {
    setActiveTab(id as typeof activeTab)
  }, [setActiveTab])

  return (
    <div className="game-screen">
      <MiniNav items={NAV_ITEMS} activeId={activeTab} onSelect={handleNav} />
      <div className="game-page">
        {activeTab === 'ab' ? (
          <section id="ab" className="game-section">
            <LiveAtBat />
          </section>
        ) : null}
        {activeTab === 'matchup' ? (
          <section id="matchup" className="game-section">
            <MatchupSubTab />
          </section>
        ) : null}
        {activeTab === 'game' ? (
          <section id="game" className="game-section">
            <div className="game-subsection">
              <PitcherGameSubTab />
            </div>
            <div className="game-subsection">
              <BatterGameSubTab />
            </div>
          </section>
        ) : null}
        {activeTab === 'logs' ? (
          <section id="logs" className="game-section">
            <LogsSubTab />
          </section>
        ) : null}
      </div>
    </div>
  )
}
