import { useEffect, useState, type ReactElement } from 'react'
import { fetchGameLog } from '../../api/mlb'
import type { GameLogEntry, StatSplit } from '../../api/types'
import { usePlayerStats } from '../../hooks/usePlayerStats'
import { useGameStore } from '../../store/gameStore'
import { ipToDecimal, parseStat } from '../../utils/sabermetrics'
import { ArsenalBars } from '../Canvas/ArsenalBars'
import { HeatMap } from '../Canvas/HeatMap'

const SEASON = new Date().getFullYear().toString()

/** Bound to gameStore.recentFormGames; the season log is fetched once, so switching never refetches. */
const SPAN_OPTIONS: readonly number[] = [7, 15, 30]

/** sitCodes 'vl,vr,risp' is fetchStatSplits' default, which usePlayerStats already relies on. */
const SPLIT_ROWS: readonly { code: string; label: string }[] = [
  { code: 'vl', label: 'vs L' },
  { code: 'vr', label: 'vs R' },
  { code: 'risp', label: 'RISP' },
]

/**
 * StatSplit.split is typed as string, but the StatsAPI also returns `{ code, description }`
 * for this field. Normalising through unknown keeps both shapes working without a cast.
 */
function splitCode(entry: StatSplit): string {
  const raw: unknown = entry.split
  if (typeof raw === 'string') return raw.toLowerCase()
  if (typeof raw === 'object' && raw !== null && 'code' in raw) {
    const code: unknown = raw.code
    if (typeof code === 'string') return code.toLowerCase()
  }
  return ''
}

interface FormLine {
  games: number
  innings: number
  earnedRuns: number
  strikeOuts: number
  baseOnBalls: number
  hits: number
  era: number | null
  whip: number | null
}

function aggregateForm(entries: readonly GameLogEntry[]): FormLine {
  let innings = 0
  let earnedRuns = 0
  let strikeOuts = 0
  let baseOnBalls = 0
  let hits = 0

  for (const entry of entries) {
    const ip = entry.stat.inningsPitched
    if (ip !== undefined) innings += ipToDecimal(ip)
    earnedRuns += entry.stat.earnedRuns ?? 0
    baseOnBalls += entry.stat.baseOnBalls ?? 0
    strikeOuts += entry.stat.strikeOuts
    hits += entry.stat.hits
  }

  const totalInnings = Number(innings.toFixed(2))
  return {
    games: entries.length,
    innings: totalInnings,
    earnedRuns,
    strikeOuts,
    baseOnBalls,
    hits,
    era: totalInnings > 0 ? Number(((earnedRuns * 9) / totalInnings).toFixed(2)) : null,
    whip: totalInnings > 0 ? Number(((hits + baseOnBalls) / totalInnings).toFixed(2)) : null,
  }
}

/** Lower ERA over the span than on the season is a hot stretch for a pitcher. */
function trendClass(spanEra: number | null, seasonEra: number | null): string {
  if (spanEra === null || seasonEra === null || spanEra === seasonEra) return ''
  return spanEra < seasonEra ? ' good' : ' bad'
}

function trendMark(spanEra: number | null, seasonEra: number | null): string {
  if (spanEra === null || seasonEra === null || spanEra === seasonEra) return ''
  return spanEra < seasonEra ? ' \u25bc' : ' \u25b2'
}

function num(value: number | null, digits: number): string {
  return value === null ? '\u2014' : value.toFixed(digits)
}

function text(value: string | undefined): string {
  return parseStat(value ?? '') === null ? '\u2014' : (value ?? '\u2014')
}

export function PitchingSubTab(): ReactElement {
  const selectedGame = useGameStore((s) => s.selectedGame)
  const currentPlay = useGameStore((s) => s.currentPlay)
  const recentFormGames = useGameStore((s) => s.recentFormGames)
  const setRecentFormGames = useGameStore((s) => s.setRecentFormGames)

  const matchup = currentPlay?.matchup ?? null
  const batterId = matchup?.batter.id ?? null
  const pitcherId =
    matchup?.pitcher.id ??
    selectedGame?.teams.home.probablePitcher?.id ??
    selectedGame?.teams.away.probablePitcher?.id ??
    null

  const { pitchArsenal, pitcherHotCold, pitcherSplits, pitcherSeason, loading } = usePlayerStats(
    batterId,
    pitcherId,
  )

  const [pitcherGameLog, setPitcherGameLog] = useState<GameLogEntry[]>([])
  const [logError, setLogError] = useState<string | null>(null)

  // usePlayerStats' gameLog is the BATTER's and is pre-truncated to 5, so the pitching log
  // is fetched here once per pitcher. recentFormGames is deliberately not a dependency.
  useEffect((): (() => void) | undefined => {
    if (pitcherId === null) {
      setPitcherGameLog([])
      setLogError(null)
      return undefined
    }

    let cancelled = false
    setLogError(null)
    fetchGameLog(pitcherId, SEASON, 'pitching')
      .then((entries) => {
        if (cancelled) return
        setPitcherGameLog(entries)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setPitcherGameLog([])
        setLogError(error instanceof Error ? error.message : 'Game log unavailable')
      })

    return () => {
      cancelled = true
    }
  }, [pitcherId])

  const splitByCode = new Map<string, StatSplit>()
  for (const entry of pitcherSplits) splitByCode.set(splitCode(entry), entry)

  // The log is date-ascending, so the tail is the most recent span.
  const recentGames = pitcherGameLog.slice(-recentFormGames).reverse()
  const form = aggregateForm(recentGames)
  const seasonEra = parseStat(pitcherSeason?.era ?? '')
  const eraClass = trendClass(form.era, seasonEra)

  const emptyLabel = pitcherId === null ? 'No pitcher selected' : loading ? 'Loading\u2026' : null

  return (
    <div>
      <div className="panel-split h-190">
        <div className="arsenal-canvas">
          {pitchArsenal.length > 0 ? (
            <ArsenalBars
              arsenal={[...pitchArsenal].sort((a, b) => b.percentage - a.percentage).slice(0, 5)}
              width={230}
            />
          ) : (
            <span className="stat-label">{emptyLabel ?? 'No arsenal data'}</span>
          )}
        </div>
        <div className="heatmap-canvas" style={{ flex: '0 0 140px' }}>
          {pitcherHotCold.length > 0 ? (
            <HeatMap zones={pitcherHotCold} size={140} />
          ) : (
            <span className="stat-label">{emptyLabel ?? 'No zones'}</span>
          )}
        </div>
      </div>

      <div className="subsection h-160">
        <div className="section-title">
          <span>Splits</span>
          <span>{SEASON}</span>
        </div>
        <div className="split-table">
          <table>
            <thead>
              <tr>
                <th>Split</th>
                <th>AVG</th>
                <th>OPS</th>
                <th>K</th>
                <th>BB</th>
              </tr>
            </thead>
            <tbody>
              {SPLIT_ROWS.map((row) => {
                const entry = splitByCode.get(row.code)
                return (
                  <tr key={row.code}>
                    <td>{row.label}</td>
                    <td>{entry ? text(entry.stat.avg) : '\u2014'}</td>
                    <td>{entry ? text(entry.stat.ops) : '\u2014'}</td>
                    <td>{entry ? String(entry.stat.strikeOuts) : '\u2014'}</td>
                    <td>{entry ? String(entry.stat.baseOnBalls) : '\u2014'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="subsection h-120">
        <div className="section-title">
          <span>Recent Form</span>
          <span>{`${String(form.games)} G`}</span>
        </div>
        <div className="segmented">
          {SPAN_OPTIONS.map((span) => (
            <button
              key={span}
              type="button"
              className={recentFormGames === span ? 'active' : ''}
              onClick={() => setRecentFormGames(span)}
            >
              {span}
            </button>
          ))}
        </div>
        {logError !== null ? (
          <div className="stat-row">
            <span className="stat-label">Game log error</span>
            <span className="stat-value bad">{logError}</span>
          </div>
        ) : (
          <div className="stat-grid">
            <div className="stat-row">
              <span className="stat-label">ERA</span>
              <span className={`stat-value${eraClass}`}>
                {`${num(form.era, 2)}${trendMark(form.era, seasonEra)}`}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Season</span>
              <span className="stat-value">{text(pitcherSeason?.era)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">IP</span>
              <span className="stat-value">{num(form.innings, 1)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">WHIP</span>
              <span className="stat-value">{num(form.whip, 2)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">K</span>
              <span className="stat-value">{String(form.strikeOuts)}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">BB</span>
              <span className="stat-value">{String(form.baseOnBalls)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
