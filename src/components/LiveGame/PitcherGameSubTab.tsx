import type { ReactElement } from 'react'
import { useGameStore } from '../../store/gameStore'
import { ZonePlot } from '../Canvas/ZonePlot'
import { EmptyPanel, Stat, StatGrid } from '../ui'
import type { DataTableColumn, DataTableRow } from '../ui'
import {
  PitchCode,
  PitchShare,
  fixed,
  inningsPitched,
  mean,
  percent,
  rateOf,
  signed,
  speedsOf,
} from './GameSubTabShared'
import { ChartFrame, GameIdentity, GamePanel, GameTablePanel } from './GameSubTabPanels'
import { derivePitcherGame } from './PitcherGameModel'

/** ZonePlot draws its legend inside the square once it is at least this wide. */
const ZONE_SIZE = 172

/** Velocity trend window: at most the last N pitches, against everything before. */
const RECENT_PITCHES = 10

const ARSENAL_COLUMNS: readonly DataTableColumn[] = [
  { key: 'code', label: 'Pitch' },
  { key: 'share', label: 'Usage', align: 'right' },
  { key: 'count', label: '#', align: 'right' },
  { key: 'velo', label: 'Velo', align: 'right' },
  { key: 'max', label: 'Max', align: 'right' },
  { key: 'whiff', label: 'Whiff', align: 'right' },
]

const INNING_COLUMNS: readonly DataTableColumn[] = [
  { key: 'inning', label: 'Inn' },
  { key: 'pitches', label: 'P', align: 'right' },
  { key: 'strikes', label: 'Str', align: 'right' },
  { key: 'strikePct', label: 'Str%', align: 'right' },
  { key: 'batters', label: 'BF', align: 'right' },
]

/**
 * "Pitcher Game" section body. Renders as a fragment: GameScreen owns the
 * surrounding `.game-scroll`, the screen's only scroll owner. Every
 * section sizes to its content — there is no vertical budget (DESIGN.md §6.3).
 */
export function PitcherGameSubTab(): ReactElement {
  const liveFeed = useGameStore((s) => s.liveFeed)
  const currentPlay = useGameStore((s) => s.currentPlay)

  const matchup = currentPlay?.matchup
  if (liveFeed === null || currentPlay === null || matchup === undefined) {
    return <EmptyPanel message="No pitcher active" hint="Waiting for the first pitch of the game." />
  }

  const game = derivePitcherGame(liveFeed.liveData.plays.allPlays, currentPlay)
  const { split } = game
  const speeds = speedsOf(game.pitches)

  // Half the outing while short, capped at RECENT_PITCHES — a fixed window would
  // leave the trend blank until a reliever passed his tenth pitch.
  const trendWindow = Math.min(RECENT_PITCHES, Math.floor(speeds.length / 2))
  const recentVelo = trendWindow === 0 ? null : mean(speeds.slice(-trendWindow))
  const earlierVelo = trendWindow === 0 ? null : mean(speeds.slice(0, speeds.length - trendWindow))
  const veloDelta = recentVelo === null || earlierVelo === null ? null : recentVelo - earlierVelo

  const strikePct = rateOf(split.strikes, split.total)
  const firstPitchPct = rateOf(game.firstPitchStrikes, game.startedPlateAppearances)
  const cswPct = rateOf(split.called + split.whiffs, split.total)
  const whiffPct = rateOf(split.whiffs, split.swings)
  const chasePct = rateOf(split.chases, split.outOfZone)
  const zonePct = rateOf(split.inZone, split.zoned)
  const perBatter = game.battersFaced === 0 ? null : split.total / game.battersFaced

  const arsenalRows: readonly DataTableRow[] = game.arsenal.map((line) => ({
    code: <PitchCode code={line.code} />,
    share: <PitchShare code={line.code} share={line.share} />,
    count: String(line.count),
    velo: fixed(line.avgVelo, 1),
    max: fixed(line.maxVelo, 1),
    whiff: line.swings === 0 ? null : percent(rateOf(line.whiffs, line.swings)),
  }))

  const inningRows: readonly DataTableRow[] = game.byInning.map((line) => ({
    inning: String(line.inning),
    pitches: String(line.pitches),
    strikes: String(line.strikes),
    strikePct: percent(rateOf(line.strikes, line.pitches)),
    batters: String(line.battersFaced),
  }))

  const zoneCaption =
    `${String(split.called)} called · ${String(split.whiffs)} whiff · ` +
    `${String(split.fouls)} foul · ${String(split.inPlay)} in play · ${String(split.balls)} ball`

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

      <GamePanel
        title="Velocity"
        meta={speeds.length === 0 ? undefined : `${String(speeds.length)} tracked`}
      >
        {speeds.length === 0 ? (
          <EmptyPanel message="No tracked velocities yet" hint="Statcast fills in once a pitch is measured." />
        ) : (
          <StatGrid minColumnWidth={64}>
            <Stat label="Avg" value={fixed(mean(speeds), 1, ' mph')} />
            <Stat label="Max" value={fixed(Math.max(...speeds), 1, ' mph')} />
            <Stat label="Min" value={fixed(Math.min(...speeds), 1, ' mph')} />
            <Stat
              label={trendWindow === 0 ? 'Recent' : `Last ${String(trendWindow)}`}
              value={fixed(recentVelo, 1, ' mph')}
            />
            <Stat
              label="Trend"
              value={signed(veloDelta, 1)}
              tone={veloDelta === null ? 'default' : veloDelta >= -0.5 ? 'positive' : 'negative'}
            />
          </StatGrid>
        )}
      </GamePanel>

      <GameTablePanel
        title="Arsenal"
        meta={`${String(game.arsenal.length)} types`}
        columns={ARSENAL_COLUMNS}
        rows={arsenalRows}
        emptyMessage="No pitch types classified yet"
        emptyHint="Gameday labels each pitch a moment after it is thrown."
      />

      <GameTablePanel
        title="By Inning"
        meta={`${inningsPitched(game.outs)} IP`}
        columns={INNING_COLUMNS}
        rows={inningRows}
        emptyMessage="This pitcher has not started an inning yet"
      />

      <GamePanel
        title="Locations"
        meta={split.total === 0 ? undefined : `${String(split.total)} pitches`}
      >
        {split.total === 0 ? (
          <EmptyPanel
            message="No pitch locations yet"
            hint="The zone fills in from the first pitch."
          />
        ) : (
          <ChartFrame
            label={`Strike-zone plot of every pitch thrown by ${matchup.pitcher.fullName}, catcher view`}
            caption={zoneCaption}
          >
            <ZonePlot pitches={game.pitches} size={ZONE_SIZE} />
          </ChartFrame>
        )}
      </GamePanel>
    </>
  )
}
