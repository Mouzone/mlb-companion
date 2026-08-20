import { useMemo } from 'react'
import type { JSX } from 'react'
import type { GameLogEntry, StatSplit } from '../../api/types'
import { usePlayerStats } from '../../hooks/usePlayerStats'
import { useGameStore } from '../../store/gameStore'
import { HeatMap } from '../Canvas/HeatMap'
import { SprayChart } from '../Canvas/SprayChart'
import { computeKpct, parseStat } from '../../utils/sabermetrics'

const EM_DASH = '—'

/** The three spans the segmented control offers; all are served from the season log already in memory. */
const FORM_SPANS: readonly number[] = [7, 15, 30]

/** Structural shape shared by a situational split stat and the season stat line. */
interface RateSource {
  avg: string
  ops: string
  strikeOuts: number
  plateAppearances: number
  atBats: number
}

interface SplitRow {
  key: string
  label: string
  avg: string
  ops: string
  pa: string
  kPct: string
}

interface FormLine {
  games: number
  hits: number
  atBats: number
  homeRuns: number
  rbi: number
  strikeOuts: number
  plateAppearances: number
}

/**
 * statSplits answers carry the situation as either the bare code or a `{ code, description }`
 * object depending on the endpoint revision, so both shapes are read without widening the type.
 */
function splitCode(split: StatSplit): string {
  const raw: unknown = split.split
  if (typeof raw === 'string') return raw.toLowerCase()
  if (typeof raw === 'object' && raw !== null && 'code' in raw) {
    const { code } = raw
    return typeof code === 'string' ? code.toLowerCase() : ''
  }
  return ''
}

/** The game log ships at-bats that GameLogEntry does not declare; read it defensively, never as `any`. */
function optionalCount(stat: GameLogEntry['stat'], key: string): number | null {
  const record: Record<string, unknown> = stat
  const raw = record[key]
  if (typeof raw === 'number' || typeof raw === 'string') return parseStat(raw)
  return null
}

function atBatsOf(entry: GameLogEntry): number {
  const declared = optionalCount(entry.stat, 'atBats')
  if (declared !== null) return declared
  return Math.max(entry.stat.plateAppearances - (entry.stat.baseOnBalls ?? 0), 0)
}

function toSplitRow(key: string, label: string, stat: RateSource | null): SplitRow {
  if (stat === null) {
    return { key, label, avg: EM_DASH, ops: EM_DASH, pa: EM_DASH, kPct: EM_DASH }
  }
  const denominator = stat.plateAppearances > 0 ? stat.plateAppearances : stat.atBats
  const kPct = computeKpct(stat.strikeOuts, denominator)
  return {
    key,
    label,
    avg: stat.avg,
    ops: stat.ops,
    pa: String(denominator),
    kPct: kPct === null ? EM_DASH : `${kPct.toFixed(0)}%`,
  }
}

function aggregateForm(entries: GameLogEntry[]): FormLine {
  return entries.reduce<FormLine>(
    (total, entry) => ({
      games: total.games + 1,
      hits: total.hits + entry.stat.hits,
      atBats: total.atBats + atBatsOf(entry),
      homeRuns: total.homeRuns + entry.stat.homeRuns,
      rbi: total.rbi + entry.stat.rbi,
      strikeOuts: total.strikeOuts + entry.stat.strikeOuts,
      plateAppearances: total.plateAppearances + entry.stat.plateAppearances,
    }),
    { games: 0, hits: 0, atBats: 0, homeRuns: 0, rbi: 0, strikeOuts: 0, plateAppearances: 0 },
  )
}

/** Baseball averages print without the leading zero, matching every other surface in the app. */
function formatAvg(value: number | null): string {
  if (value === null) return EM_DASH
  return value.toFixed(3).replace(/^0/, '')
}

function formatDelta(value: number | null): string {
  if (value === null) return EM_DASH
  const sign = value >= 0 ? '+' : '-'
  return `${sign}${Math.abs(value).toFixed(3).replace(/^0/, '')}`
}

function trendClass(delta: number | null): string {
  if (delta === null || delta === 0) return 'stat-value'
  return delta > 0 ? 'stat-value good' : 'stat-value bad'
}

export function BattingSubTab(): JSX.Element {
  const selectedGame = useGameStore((s) => s.selectedGame)
  const currentPlay = useGameStore((s) => s.currentPlay)
  const recentFormGames = useGameStore((s) => s.recentFormGames)
  const setRecentFormGames = useGameStore((s) => s.setRecentFormGames)

  const batterId = currentPlay?.matchup?.batter.id ?? null
  // The stats hook keys every batter fetch on having a pitcher too; it is never rendered here.
  const pitcherId =
    currentPlay?.matchup?.pitcher.id ??
    selectedGame?.teams.home.probablePitcher?.id ??
    selectedGame?.teams.away.probablePitcher?.id ??
    null

  const { batterSeason, batterHotCold, batterSplits, gameLog, savantData, loading } =
    usePlayerStats(batterId, pitcherId)

  // Memoised so the canvas keeps a stable data identity and only redraws when the rows change.
  const sprayData = useMemo(() => savantData.filter((r) => r.hc_x && r.hc_y), [savantData])

  const splitRows = useMemo<SplitRow[]>(() => {
    const byCode = new Map<string, StatSplit>()
    for (const split of batterSplits) byCode.set(splitCode(split), split)
    return [
      toSplitRow('vl', 'vs L', byCode.get('vl')?.stat ?? null),
      toSplitRow('vr', 'vs R', byCode.get('vr')?.stat ?? null),
      toSplitRow('risp', 'RISP', byCode.get('risp')?.stat ?? null),
      toSplitRow('season', 'Season', batterSeason),
    ]
  }, [batterSplits, batterSeason])

  // Date-ascending log: the newest games are at the tail, so slice from the end and flip.
  const form = useMemo(
    () => aggregateForm(gameLog.slice(-recentFormGames).reverse()),
    [gameLog, recentFormGames],
  )

  const spanAvg = form.atBats > 0 ? form.hits / form.atBats : null
  const seasonAvg = parseStat(batterSeason?.avg ?? '')
  const delta = spanAvg !== null && seasonAvg !== null ? spanAvg - seasonAvg : null
  const spanKpct = computeKpct(form.strikeOuts, form.plateAppearances)

  if (batterId === null) {
    return (
      <div>
        <div className="h-190 panel-row">
          <div className="section-title">
            <span>Batting</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Waiting for a batter…</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="h-190 panel-split">
        <div className="panel-row">
          <div className="section-title">
            <span>Hot / Cold</span>
          </div>
          <div className="heatmap-canvas">
            <HeatMap zones={batterHotCold} size={172} />
          </div>
        </div>

        <div className="panel-row">
          <div className="section-title">
            <span>Spray</span>
            <span>{sprayData.length}</span>
          </div>
          {sprayData.length > 0 ? (
            <div className="spray-canvas">
              <SprayChart data={sprayData} width={172} height={150} />
            </div>
          ) : (
            <div className="stat-row">
              <span className="stat-label">
                {loading ? 'Loading batted balls…' : 'No batted-ball data'}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="h-160 panel-row">
        <div className="section-title">
          <span>Splits</span>
          <span>vl · vr · risp</span>
        </div>
        <div className="split-table">
          <table>
            <thead>
              <tr>
                <th>Split</th>
                <th>AVG</th>
                <th>OPS</th>
                <th>PA</th>
                <th>K%</th>
              </tr>
            </thead>
            <tbody>
              {splitRows.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td>{row.avg}</td>
                  <td>{row.ops}</td>
                  <td>{row.pa}</td>
                  <td>{row.kPct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="h-120 panel-row">
        <div className="section-title">
          <span>Recent Form</span>
          <span>{form.games} G</span>
        </div>
        <div className="segmented">
          {FORM_SPANS.map((span) => (
            <button
              key={span}
              type="button"
              className={recentFormGames === span ? 'active' : ''}
              onClick={() => setRecentFormGames(span)}
            >
              {span}G
            </button>
          ))}
        </div>
        <div className="stat-grid">
          <div className="stat-row">
            <span className="stat-label">AVG</span>
            <span className={trendClass(delta)}>{formatAvg(spanAvg)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">vs Szn</span>
            <span className={trendClass(delta)}>{formatDelta(delta)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">H-AB</span>
            <span className="stat-value">
              {form.games > 0 ? `${form.hits}-${form.atBats}` : EM_DASH}
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-label">HR·RBI·K%</span>
            <span className="stat-value">
              {form.games > 0
                ? `${form.homeRuns}·${form.rbi}·${spanKpct === null ? EM_DASH : `${spanKpct.toFixed(0)}%`}`
                : loading
                  ? 'Loading…'
                  : EM_DASH}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
