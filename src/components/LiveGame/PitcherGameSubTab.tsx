import type { ReactElement } from 'react'
import { useGameStore } from '../../store/gameStore'
import { EmptyPanel, Stat, StatGrid } from '../ui'
import { fixed, inningsPitched, percent, rateOf } from './GameSubTabShared'
import { GameIdentity, GamePanel } from './GameSubTabPanels'
import { derivePitcherGame } from './PitcherGameModel'

export function PitcherGameSubTab(): ReactElement {
  const liveFeed = useGameStore((s) => s.liveFeed)
  const currentPlay = useGameStore((s) => s.currentPlay)

  const matchup = currentPlay?.matchup
  if (liveFeed === null || currentPlay === null || matchup === undefined) {
    return <EmptyPanel message="No pitcher active" hint="Waiting for the first pitch of the game." />
  }

  const game = derivePitcherGame(liveFeed.liveData.plays.allPlays, currentPlay)
  const { split } = game

  const strikePct = rateOf(split.strikes, split.total)
  const firstPitchPct = rateOf(game.firstPitchStrikes, game.startedPlateAppearances)
  const cswPct = rateOf(split.called + split.whiffs, split.total)
  const whiffPct = rateOf(split.whiffs, split.swings)
  const chasePct = rateOf(split.chases, split.outOfZone)
  const zonePct = rateOf(split.inZone, split.zoned)
  const perBatter = game.battersFaced === 0 ? null : split.total / game.battersFaced

  return (
    <>
      <GameIdentity
        personId={matchup.pitcher.id}
        name={matchup.pitcher.fullName}
        role={`${matchup.pitchHand.code}HP · ${inningsPitched(game.outs)} IP · pass ${String(game.timesThroughOrder)}`}
      >
        <StatGrid minColumnWidth={56}>
          <Stat label="IP" value={inningsPitched(game.outs)} />
          <Stat label="P" value={String(split.total)} />
          <Stat label="BF" value={String(game.battersFaced)} />
          <Stat label="K" value={String(game.strikeouts)} />
          <Stat label="BB" value={String(game.walks)} />
          <Stat label="H" value={String(game.hits)} />
          <Stat label="HR" value={String(game.homeRuns)} />
          <Stat label="P/BF" value={fixed(perBatter, 1)} />
        </StatGrid>
      </GameIdentity>

      <GamePanel title="Command" meta={`${String(split.swings)} swings`}>
        <StatGrid minColumnWidth={64}>
          <Stat
            label="Strike %"
            value={percent(strikePct)}
            tone={strikePct === null ? 'default' : strikePct >= 60 ? 'positive' : 'negative'}
          />
          <Stat label="CSW %" value={percent(cswPct)} />
          <Stat label="Whiff %" value={percent(whiffPct)} />
          <Stat label="1st-P Str" value={percent(firstPitchPct)} />
          <Stat label="Zone %" value={percent(zonePct)} />
          <Stat label="Chase %" value={percent(chasePct)} />
          <Stat label="Called" value={String(split.called)} />
          <Stat label="SwStr" value={String(split.whiffs)} />
          <Stat label="In Play" value={String(split.inPlay)} />
        </StatGrid>
      </GamePanel>
    </>
  )
}
