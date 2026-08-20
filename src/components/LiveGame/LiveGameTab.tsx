import type { ReactElement } from 'react'
import { useGameStore } from '../../store/gameStore'
import { useLiveFeed } from '../../hooks/useLiveFeed'
import { LiveAtBat } from '../LiveAtBat/LiveAtBat'
import { SubTabNav } from '../ui'
import { BatterGameSubTab } from './BatterGameSubTab'
import { PitcherGameSubTab } from './PitcherGameSubTab'

type LiveSubTab = 'atBat' | 'batterGame' | 'pitcherGame'

interface SubTabDescriptor {
  readonly id: LiveSubTab
  readonly label: string
}

/**
 * `atBat` leads because it is the live moment; the pitcher precedes the batter
 * everywhere in the app because he sets the terms of every plate appearance.
 */
const SUB_TABS: readonly SubTabDescriptor[] = [
  { id: 'atBat', label: 'At Bat' },
  { id: 'pitcherGame', label: 'Pitcher' },
  { id: 'batterGame', label: 'Batter' },
]

/** SubTabNav reports a plain `string`; this narrows it back without a cast. */
function isLiveSubTab(value: string): value is LiveSubTab {
  return SUB_TABS.some((tab) => tab.id === value)
}

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
 * Live Game tab shell. Owns the `.tab-content` flex root directly under the
 * TabBar, so App.tsx must NOT wrap it. The SubTabNav is fixed chrome and a
 * sibling ABOVE `.sub-tab-panel`, which is this screen's only scroll owner.
 */
export function LiveGameTab(): ReactElement {
  // Called for its polling side effect; unmounting this tab stops the interval.
  useLiveFeed()

  const liveSubTab = useGameStore((s) => s.liveSubTab)
  const setLiveSubTab = useGameStore((s) => s.setLiveSubTab)

  return (
    <div className="tab-content">
      <SubTabNav
        tabs={SUB_TABS}
        activeId={liveSubTab}
        onSelect={(id) => {
          if (isLiveSubTab(id)) setLiveSubTab(id)
        }}
      />
      <div className="sub-tab-panel">{renderSubTab(liveSubTab)}</div>
    </div>
  )
}
