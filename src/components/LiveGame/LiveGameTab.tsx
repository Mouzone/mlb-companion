import type { ReactElement } from 'react'
import { useGameStore } from '../../store/gameStore'
import { useLiveFeed } from '../../hooks/useLiveFeed'
import { LiveAtBat } from '../LiveAtBat/LiveAtBat'
import { BatterGameSubTab } from './BatterGameSubTab'
import { PitcherGameSubTab } from './PitcherGameSubTab'

type LiveSubTab = 'atBat' | 'batterGame' | 'pitcherGame'

interface SubTabDescriptor {
  readonly id: LiveSubTab
  readonly label: string
}

const SUB_TABS: readonly SubTabDescriptor[] = [
  { id: 'atBat', label: 'At Bat' },
  { id: 'batterGame', label: 'Batter Game' },
  { id: 'pitcherGame', label: 'Pitcher Game' },
]

function assertNever(value: never): never {
  throw new Error(`Unhandled live sub-tab: ${String(value)}`)
}

function renderSubTab(subTab: LiveSubTab): ReactElement {
  switch (subTab) {
    case 'atBat':
      return <LiveAtBat />
    case 'batterGame':
      return <BatterGameSubTab />
    case 'pitcherGame':
      return <PitcherGameSubTab />
    default:
      return assertNever(subTab)
  }
}

/**
 * Live Game tab shell. Owns the `.tab-content` flex root (719px) directly under
 * `.tab-bar`, so App.tsx must NOT wrap it. The 40px `.sub-tab-nav` is a sibling
 * ABOVE `.sub-tab-panel`; `--content-h` (679px) already excludes both bars.
 */
export function LiveGameTab(): ReactElement {
  // Called for its polling side effect; unmounting this tab stops the interval.
  useLiveFeed()

  const liveSubTab = useGameStore((s) => s.liveSubTab)
  const setLiveSubTab = useGameStore((s) => s.setLiveSubTab)

  return (
    <div className="tab-content">
      <div className="sub-tab-nav">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={liveSubTab === tab.id ? 'active' : ''}
            onClick={() => setLiveSubTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="sub-tab-panel">{renderSubTab(liveSubTab)}</div>
    </div>
  )
}
