import type { ReactElement } from 'react'
import { useGameStore } from '../../store/gameStore'
import { EmptyPanel, Stat, StatGrid } from '../ui'
import type { DataTableColumn, DataTableRow } from '../ui'
import type { CurrentPlay } from '../../api/types'
import { ordinal, percent, pitchesOf, rateOf, splitPitches } from './GameSubTabShared'
import { GameIdentity, GamePanel, GameTablePanel } from './GameSubTabPanels'
import { buildGameLine } from './BatterGameModel'

const AT_BAT_COLUMNS: readonly DataTableColumn[] = [
  { key: 'inning', label: 'Inn' },
  { key: 'result', label: 'Result' },
  { key: 'pitches', label: 'P', align: 'right' },
  { key: 'count', label: 'Count', align: 'right' },
]

export function BatterGameSubTab(): ReactElement {
  const liveFeed = useGameStore((s) => s.liveFeed)
  const currentPlay = useGameStore((s) => s.currentPlay)

  const matchup = currentPlay?.matchup
  if (liveFeed === null || matchup === undefined) {
    return (
      <EmptyPanel message="No at-bat in progress" hint="Waiting for the first plate appearance." />
    )
  }

  const rawPlays: unknown = liveFeed.liveData.plays.allPlays
  const allPlays: CurrentPlay[] = Array.isArray(rawPlays) ? rawPlays : []

  const batterId = matchup.batter.id
  const batterPlays = allPlays.filter((play) => play.matchup.batter.id === batterId)
  const batterPitches = pitchesOf(batterPlays)
  const completedPlays = batterPlays.filter((play) => play.result.event !== '')

  const split = splitPitches(batterPitches)
  const line = buildGameLine(completedPlays)

  const swingPct = rateOf(split.swings, split.total)
  const whiffPct = rateOf(split.whiffs, split.swings)
  const chasePct = rateOf(split.chases, split.outOfZone)
  const zonePct = rateOf(split.inZone, split.zoned)
  const takenStrikePct = rateOf(split.called, split.total - split.swings)

  const atBatRows: readonly DataTableRow[] = completedPlays.map((play) => ({
    inning: ordinal(play.about.inning),
    result: play.result.event,
    pitches: String(play.playEvents.filter((event) => event.isPitch).length),
    count: `${String(play.count.balls)}-${String(play.count.strikes)}`,
  }))

  const lineText =
    line.plateAppearances === 0
      ? 'first plate appearance'
      : `${String(line.hits)}-for-${String(line.atBats)}`

  return (
    <>
      <GameIdentity
        personId={matchup.batter.id}
        name={matchup.batter.fullName}
        role={`${matchup.batSide.code}HB vs ${matchup.pitchHand.code}HP · ${lineText}`}
      >
        <StatGrid minColumnWidth={56}>
          <Stat label="PA" value={String(line.plateAppearances)} />
          <Stat label="AB" value={String(line.atBats)} />
          <Stat label="H" value={String(line.hits)} />
          <Stat label="HR" value={String(line.homeRuns)} />
          <Stat label="RBI" value={String(line.rbi)} />
          <Stat label="BB" value={String(line.walks)} />
          <Stat label="K" value={String(line.strikeouts)} />
          <Stat label="Pitches" value={String(split.total)} />
        </StatGrid>
      </GameIdentity>

      <GamePanel
        title="Plate Discipline"
        meta={split.total === 0 ? undefined : `${String(split.swings)} swings`}
      >
        {split.total === 0 ? (
          <EmptyPanel
            message="No pitches seen yet"
            hint="Discipline rates appear from the first pitch of the at-bat."
          />
        ) : (
          <StatGrid minColumnWidth={64}>
            <Stat label="Swing %" value={percent(swingPct)} />
            <Stat label="Whiff %" value={percent(whiffPct)} />
            <Stat label="Chase %" value={percent(chasePct)} />
            <Stat label="Zone %" value={percent(zonePct)} />
            <Stat label="Taken %" value={percent(takenStrikePct)} />
            <Stat label="Called" value={String(split.called)} />
            <Stat label="SwStr" value={String(split.whiffs)} />
            <Stat label="Foul" value={String(split.fouls)} />
            <Stat label="In Play" value={String(split.inPlay)} />
          </StatGrid>
        )}
      </GamePanel>

      <GameTablePanel
        title="At Bats"
        meta={`${String(line.hits)}-${String(line.atBats)}`}
        columns={AT_BAT_COLUMNS}
        rows={atBatRows}
        emptyMessage="First plate appearance in progress"
        emptyHint="Completed at-bats are listed here as the game unfolds."
      />
    </>
  )
}
