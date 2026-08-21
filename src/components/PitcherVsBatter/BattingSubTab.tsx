import { useMemo, type ReactElement } from 'react'
import type { GameLogEntry, StatSplit } from '../../api/types'
import { usePlayerStats } from '../../hooks/usePlayerStats'
import { useGameStore } from '../../store/gameStore'
import { derivePitcher } from '../../utils/derivePitcher'
import { computeBBpct, computeKpct, parseStat } from '../../utils/sabermetrics'
import type { DataTableColumn, DataTableRow } from '../ui'
import { EmptyPanel, Segmented, Stat, StatGrid } from '../ui'
import { SprayPanel } from './BattingPanels'
import { Panel, SkeletonRows, TablePanel, ZonePanel } from './PvbPanels'
import {
  PlayerIdentity,
  compareTo,
  monthDay,
  percent,
  rate3,
  rateText,
  ratio,
  signedRate3,
  splitCode,
  sumOptional,
  whole,
} from './PvbShared'

const SEASON = new Date().getFullYear().toString()

const SPAN_OPTIONS = [
  { id: '7', label: '7 G' },
  { id: '15', label: '15 G' },
  { id: '30', label: '30 G' },
]

const SITUATIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'vl', label: 'vs LHP' },
  { code: 'vr', label: 'vs RHP' },
  { code: 'risp', label: 'RISP' },
]

const SPLIT_COLUMNS: ReadonlyArray<DataTableColumn> = [
  { key: 'split', label: 'Split' },
  { key: 'pa', label: 'PA', align: 'right' },
  { key: 'avg', label: 'AVG', align: 'right' },
  { key: 'ops', label: 'OPS', align: 'right' },
  { key: 'hr', label: 'HR', align: 'right' },
  { key: 'k', label: 'K', align: 'right' },
]

const LOG_COLUMNS: ReadonlyArray<DataTableColumn> = [
  { key: 'date', label: 'Date' },
  { key: 'ab', label: 'AB', align: 'right' },
  { key: 'h', label: 'H', align: 'right' },
  { key: 'db', label: '2B', align: 'right' },
  { key: 'hr', label: 'HR', align: 'right' },
  { key: 'rbi', label: 'RBI', align: 'right' },
  { key: 'k', label: 'K', align: 'right' },
]

/** The shape every split source shares: situational, season, and head-to-head. */
interface SplitSource {
  readonly avg: string
  readonly ops: string
  readonly homeRuns: number
  readonly strikeOuts: number
  readonly plateAppearances: number
}

function splitRow(label: string, stat: SplitSource | null): DataTableRow | null {
  if (stat === null) return null
  return {
    split: label,
    pa: String(stat.plateAppearances),
    avg: rateText(stat.avg),
    ops: rateText(stat.ops),
    hr: String(stat.homeRuns),
    k: String(stat.strikeOuts),
  }
}

interface FormLine {
  games: number
  hits: number
  atBats: number | null
  doubles: number
  homeRuns: number
  rbi: number
  strikeOuts: number
  baseOnBalls: number
  plateAppearances: number
}

function aggregate(entries: readonly GameLogEntry[]): FormLine {
  const line: FormLine = {
    games: entries.length,
    hits: 0,
    atBats: sumOptional(entries, 'atBats'),
    doubles: 0,
    homeRuns: 0,
    rbi: 0,
    strikeOuts: 0,
    baseOnBalls: 0,
    plateAppearances: 0,
  }
  for (const entry of entries) {
    line.hits += entry.stat.hits
    line.doubles += entry.stat.doubles
    line.homeRuns += entry.stat.homeRuns
    line.rbi += entry.stat.rbi
    line.strikeOuts += entry.stat.strikeOuts
    line.baseOnBalls += entry.stat.baseOnBalls ?? 0
    line.plateAppearances += entry.stat.plateAppearances
  }
  return line
}

const HANDEDNESS: Record<string, string> = { L: 'LH batter', R: 'RH batter', S: 'Switch hitter' }

export function BattingSubTab(): ReactElement {
  const selectedGame = useGameStore((s) => s.selectedGame)
  const currentPlay = useGameStore((s) => s.currentPlay)
  const liveFeed = useGameStore((s) => s.liveFeed)
  const recentFormGames = useGameStore((s) => s.recentFormGames)
  const setRecentFormGames = useGameStore((s) => s.setRecentFormGames)

  const matchup = currentPlay?.matchup ?? null
  const batter = matchup?.batter ?? null
  const batterId = batter?.id ?? null
  const pitcherId = derivePitcher(currentPlay, liveFeed, selectedGame)?.id ?? null

  const { batterSeason, batterHotCold, batterSplits, gameLog, vsPlayer, savantData, loading } =
    usePlayerStats(batterId, pitcherId)

  const splitRows = useMemo<DataTableRow[]>(() => {
    const byCode = new Map<string, StatSplit>()
    for (const split of batterSplits) byCode.set(splitCode(split), split)
    const candidates = [
      ...SITUATIONS.map(({ code, label }) => splitRow(label, byCode.get(code)?.stat ?? null)),
      splitRow('Season', batterSeason),
      splitRow('vs Pitcher', vsPlayer),
    ]
    return candidates.filter((row): row is DataTableRow => row !== null)
  }, [batterSplits, batterSeason, vsPlayer])

  // Date-ascending log: the newest entries are at the tail, so slice from the end.
  const form = useMemo(
    () => aggregate(gameLog.slice(-recentFormGames)),
    [gameLog, recentFormGames],
  )

  const logRows = useMemo<DataTableRow[]>(
    () =>
      [...gameLog].reverse().map((entry) => ({
        date: `${entry.isHome ? 'vs' : '@'} ${monthDay(entry.date)}`,
        ab: whole(sumOptional([entry], 'atBats')),
        h: String(entry.stat.hits),
        db: String(entry.stat.doubles),
        hr: String(entry.stat.homeRuns),
        rbi: String(entry.stat.rbi),
        k: String(entry.stat.strikeOuts),
      })),
    [gameLog],
  )

  if (batterId === null || batter === null) {
    return (
      <div>
        <Panel title="Batting">
          <EmptyPanel
            message="No batter at the plate yet"
            hint="Batting data appears once the first at-bat begins."
          />
        </Panel>
      </div>
    )
  }

  const seasonAvg = parseStat(batterSeason?.avg ?? '')
  const spanAvg = ratio(form.hits, form.atBats)
  const delta = spanAvg !== null && seasonAvg !== null ? spanAvg - seasonAvg : null
  const verdict = compareTo(spanAvg, seasonAvg, false)
  const side = matchup?.batSide.code
  const logSpan =
    gameLog.length > 0
      ? `${monthDay(gameLog[0]?.date ?? '')}\u2013${monthDay(gameLog[gameLog.length - 1]?.date ?? '')}`
      : undefined

  return (
    <div>
      <PlayerIdentity
        personId={batter.id}
        name={batter.fullName}
        role={`${(side === undefined ? undefined : HANDEDNESS[side]) ?? 'Batter'} · ${SEASON} season`}
      >
        <StatGrid>
          <Stat label="AVG" value={rateText(batterSeason?.avg)} />
          <Stat label="OBP" value={rateText(batterSeason?.obp)} />
          <Stat label="SLG" value={rateText(batterSeason?.slg)} />
          <Stat label="OPS" value={rateText(batterSeason?.ops)} />
        </StatGrid>
      </PlayerIdentity>

      <Panel title="Recent Form" meta={`${String(form.games)} of ${String(gameLog.length)} G`}>
        <Segmented
          options={SPAN_OPTIONS}
          activeId={String(recentFormGames)}
          onSelect={(id) => setRecentFormGames(Number(id))}
        />
        {form.games > 0 ? (
          <StatGrid>
            <Stat label="AVG" value={`${rate3(spanAvg)}${verdict.mark}`} tone={verdict.tone} />
            <Stat label="Szn AVG" value={rateText(batterSeason?.avg)} />
            <Stat label="vs Szn" value={signedRate3(delta)} tone={verdict.tone} />
            <Stat label="H / AB" value={`${String(form.hits)}-${whole(form.atBats)}`} />
            <Stat label="PA" value={String(form.plateAppearances)} />
            <Stat label="2B" value={String(form.doubles)} />
            <Stat label="HR" value={String(form.homeRuns)} />
            <Stat label="K%" value={percent(computeKpct(form.strikeOuts, form.plateAppearances), 0)} />
            <Stat label="BB%" value={percent(computeBBpct(form.baseOnBalls, form.plateAppearances), 0)} />
          </StatGrid>
        ) : loading ? (
          <SkeletonRows rows={4} />
        ) : (
          <EmptyPanel message="No games logged this season" />
        )}
      </Panel>

      <SprayPanel data={savantData} loading={loading} />

      <ZonePanel
        title="Hot / Cold"
        caption="Batting average by strike-zone cell"
        zones={batterHotCold}
        loading={loading}
        emptyMessage="No zone data for this season"
      />

      <TablePanel
        title="Splits"
        meta={SEASON}
        columns={SPLIT_COLUMNS}
        rows={splitRows}
        loading={loading}
        emptyMessage="No situational splits published yet"
        emptyHint="Splits appear once the batter records enough plate appearances."
        skeletonRows={5}
      />

      <TablePanel
        title="Game Log"
        meta={logSpan}
        columns={LOG_COLUMNS}
        rows={logRows}
        loading={loading}
        emptyMessage="No games logged this season"
        skeletonRows={5}
      />
    </div>
  )
}
