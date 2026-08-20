import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { fetchGameLog } from '../../api/mlb'
import type { GameLogEntry, StatSplit } from '../../api/types'
import { usePlayerStats } from '../../hooks/usePlayerStats'
import { useGameStore } from '../../store/gameStore'
import { PARK_FACTORS } from '../../utils/leagueConstants'
import { parseStat } from '../../utils/sabermetrics'
import type { DataTableRow } from '../ui'
import { EmptyPanel, Segmented, Stat, StatGrid } from '../ui'
import {
  ArsenalPanel,
  LOG_COLUMNS,
  SPLIT_COLUMNS,
  SeasonRatesPanel,
  aggregate,
  lineRow,
  situationRow,
} from './PitchingPanels'
import { Panel, SkeletonRows, TablePanel, ZonePanel } from './PvbPanels'
import {
  PlayerIdentity,
  compareTo,
  fixed,
  monthDay,
  rate3,
  rateText,
  splitCode,
  whole,
} from './PvbShared'

const SEASON = new Date().getFullYear().toString()

/** Spans served from the one cached season log, so switching never refetches. */
const SPAN_OPTIONS = [
  { id: '7', label: '7 G' },
  { id: '15', label: '15 G' },
  { id: '30', label: '30 G' },
]

/** `vl,vr,risp` is fetchStatSplits' default, which usePlayerStats relies on. */
const SITUATIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'vl', label: 'vs L' },
  { code: 'vr', label: 'vs R' },
  { code: 'risp', label: 'RISP' },
]

export function PitchingSubTab(): ReactElement {
  const selectedGame = useGameStore((s) => s.selectedGame)
  const currentPlay = useGameStore((s) => s.currentPlay)
  const recentFormGames = useGameStore((s) => s.recentFormGames)
  const setRecentFormGames = useGameStore((s) => s.setRecentFormGames)

  const matchup = currentPlay?.matchup ?? null
  const batterId = matchup?.batter.id ?? null
  const probable =
    selectedGame?.teams.home.probablePitcher ?? selectedGame?.teams.away.probablePitcher ?? null
  const pitcher = matchup?.pitcher ?? probable ?? null
  const pitcherId = pitcher?.id ?? null

  const { pitchArsenal, pitcherHotCold, pitcherSplits, pitcherSeason, loading } = usePlayerStats(
    batterId,
    pitcherId,
  )

  const [log, setLog] = useState<GameLogEntry[]>([])
  const [logLoading, setLogLoading] = useState(false)

  // usePlayerStats' gameLog is the BATTER's and is pre-truncated, so the full
  // pitching log is fetched once per pitcher. The span is never a dependency.
  useEffect((): (() => void) | undefined => {
    if (pitcherId === null) {
      setLog([])
      return undefined
    }
    let cancelled = false
    setLogLoading(true)
    fetchGameLog(pitcherId, SEASON, 'pitching')
      .then((entries) => {
        if (!cancelled) setLog(entries)
      })
      .catch(() => {
        if (!cancelled) setLog([])
      })
      .finally(() => {
        if (!cancelled) setLogLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [pitcherId])

  const splitRows = useMemo<DataTableRow[]>(() => {
    const byCode = new Map<string, StatSplit>()
    for (const entry of pitcherSplits) byCode.set(splitCode(entry), entry)

    const rows: DataTableRow[] = []
    for (const { code, label } of SITUATIONS) {
      const entry = byCode.get(code)
      if (entry) rows.push(situationRow(label, entry.stat))
    }
    const spans: ReadonlyArray<readonly [string, GameLogEntry[]]> = [
      ['Home', log.filter((entry) => entry.isHome)],
      ['Away', log.filter((entry) => !entry.isHome)],
      ['Season', log],
    ]
    for (const [label, entries] of spans) {
      const line = aggregate(entries)
      if (line.games > 0) rows.push(lineRow(label, line))
    }
    return rows
  }, [pitcherSplits, log])

  // The log is date-ascending, so the tail is the most recent span.
  const form = useMemo(() => aggregate(log.slice(-recentFormGames)), [log, recentFormGames])

  const logRows = useMemo<DataTableRow[]>(
    () =>
      [...log].reverse().map((entry) => ({
        date: `${entry.isHome ? 'vs' : '@'} ${monthDay(entry.date)}`,
        ip: entry.stat.inningsPitched ?? '',
        h: String(entry.stat.hits),
        er: whole(entry.stat.earnedRuns ?? null),
        bb: whole(entry.stat.baseOnBalls ?? null),
        k: String(entry.stat.strikeOuts),
      })),
    [log],
  )

  if (pitcherId === null || pitcher === null) {
    return (
      <div>
        <Panel title="Pitching">
          <EmptyPanel
            message="No pitcher on the mound yet"
            hint="Pitching data appears once a starter is announced."
          />
        </Panel>
      </div>
    )
  }

  const seasonEra = parseStat(pitcherSeason?.era ?? '')
  const eraVerdict = compareTo(form.era, seasonEra, true)
  const hand = matchup?.pitchHand.code

  return (
    <div>
      <PlayerIdentity
        personId={pitcher.id}
        name={pitcher.fullName}
        role={`${hand === undefined ? 'Pitcher' : `${hand}HP`} · ${SEASON} season`}
      >
        <StatGrid>
          <Stat label="ERA" value={rateText(pitcherSeason?.era)} />
          <Stat label="WHIP" value={rateText(pitcherSeason?.whip)} />
          <Stat label="IP" value={pitcherSeason?.inningsPitched ?? ''} />
          <Stat label="SO" value={whole(pitcherSeason?.strikeOuts ?? null)} />
        </StatGrid>
      </PlayerIdentity>

      <ArsenalPanel arsenal={pitchArsenal} loading={loading} />

      <ZonePanel
        title="Zone Profile"
        caption="Opponent batting average by strike-zone cell"
        zones={pitcherHotCold}
        loading={loading}
        emptyMessage="No zone data for this season"
      />

      <TablePanel
        title="Opponent Splits"
        meta={SEASON}
        columns={SPLIT_COLUMNS}
        rows={splitRows}
        loading={loading || logLoading}
        emptyMessage="No situational splits published yet"
        emptyHint="Splits appear after the pitcher faces enough batters."
        skeletonRows={6}
      />

      <Panel title="Recent Form" meta={`${String(form.games)} of ${String(log.length)} G`}>
        <Segmented
          options={SPAN_OPTIONS}
          activeId={String(recentFormGames)}
          onSelect={(id) => setRecentFormGames(Number(id))}
        />
        {form.games > 0 ? (
          <StatGrid>
            <Stat
              label="ERA"
              value={`${fixed(form.era, 2)}${eraVerdict.mark}`}
              tone={eraVerdict.tone}
            />
            <Stat label="Szn ERA" value={rateText(pitcherSeason?.era)} />
            <Stat label="WHIP" value={fixed(form.whip, 2)} />
            <Stat label="IP" value={fixed(form.innings, 1)} />
            <Stat label="Opp AVG" value={rate3(form.avg)} />
            <Stat label="K/9" value={fixed(form.k9, 1)} />
            <Stat label="BB/9" value={fixed(form.bb9, 1)} />
            <Stat label="K" value={String(form.strikeOuts)} />
            <Stat label="BB" value={String(form.baseOnBalls)} />
            <Stat label="H" value={String(form.hits)} />
            <Stat label="ER" value={String(form.earnedRuns)} />
            <Stat label="HR" value={String(form.homeRuns)} />
          </StatGrid>
        ) : logLoading ? (
          <SkeletonRows rows={4} />
        ) : (
          <EmptyPanel message="No games logged this season" />
        )}
      </Panel>

      <SeasonRatesPanel
        season={pitcherSeason}
        parkFactor={PARK_FACTORS[selectedGame?.teams.home.team.abbreviation ?? ''] ?? 1.0}
      />

      <TablePanel
        title="Game Log"
        meta={`${String(log.length)} G`}
        columns={LOG_COLUMNS}
        rows={logRows}
        loading={logLoading}
        emptyMessage="No appearances logged this season"
        skeletonRows={6}
      />
    </div>
  )
}
