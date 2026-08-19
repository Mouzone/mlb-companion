import { useGameStore } from '../../store/gameStore'
import { usePlayerStats } from '../../hooks/usePlayerStats'
import { ArsenalBars } from '../Canvas/ArsenalBars'
import { HeatMap } from '../Canvas/HeatMap'
import { SprayChart } from '../Canvas/SprayChart'
import type { StatSplit } from '../../api/types'

export function Tendencies() {
  const currentPlay = useGameStore((s) => s.currentPlay)
  const reset = useGameStore((s) => s.reset)

  const batterId = currentPlay?.matchup.batter.id ?? null
  const pitcherId = currentPlay?.matchup.pitcher.id ?? null
  const stats = usePlayerStats(batterId, pitcherId)

  if (!currentPlay) {
    return (
      <div className="tab-content">
        <div className="no-game">
          <p>Waiting for live data...</p>
          <button className="btn-back" onClick={reset}>Back to games</button>
        </div>
      </div>
    )
  }

  const { matchup } = currentPlay
  const batterSplits = stats.batterSplits as StatSplit[]
  const pitcherSplits = stats.pitcherSplits as StatSplit[]

  return (
    <div className="tab-content tendencies">
      <div className="season-lines">
        <div className="season-card batter-card">
          <h3>{matchup.batter.fullName}</h3>
          {stats.batterSeason ? (
            <div className="stat-line">
              <Stat label="AVG" value={stats.batterSeason.avg} />
              <Stat label="OBP" value={stats.batterSeason.obp} />
              <Stat label="SLG" value={stats.batterSeason.slg} />
              <Stat label="OPS" value={stats.batterSeason.ops} />
              <Stat label="HR" value={String(stats.batterSeason.homeRuns)} />
              <Stat label="RBI" value={String(stats.batterSeason.rbi)} />
              <Stat label="K%" value={`${((stats.batterSeason.strikeOuts / Math.max(stats.batterSeason.plateAppearances, 1)) * 100).toFixed(0)}%`} />
            </div>
          ) : <div className="stat-line">No season data</div>}
        </div>
        <div className="season-card pitcher-card">
          <h3>{matchup.pitcher.fullName}</h3>
          {stats.pitcherSeason ? (
            <div className="stat-line">
              <Stat label="ERA" value={stats.pitcherSeason.era} />
              <Stat label="WHIP" value={stats.pitcherSeason.whip} />
              <Stat label="K/9" value={((stats.pitcherSeason.strikeouts / Math.max(parseFloat(stats.pitcherSeason.inningsPitched || '1'), 1)) * 9).toFixed(1)} />
              <Stat label="BB/9" value={((stats.pitcherSeason.baseOnBalls / Math.max(parseFloat(stats.pitcherSeason.inningsPitched || '1'), 1)) * 9).toFixed(1)} />
              <Stat label="OPP AVG" value={stats.pitcherSeason.oppAvg} />
            </div>
          ) : <div className="stat-line">No season data</div>}
        </div>
      </div>

      <div className="tendencies-grid">
        <div className="tendency-section batter-section">
          <h3>Batter Tendencies</h3>

          <div className="subsection">
            <h4>Hot / Cold Zones</h4>
            <HeatMap zones={stats.batterHotCold} size={160} />
          </div>

          <div className="subsection">
            <h4>Spray Chart</h4>
            <SprayChart data={stats.savantData} width={260} height={200} />
          </div>

          <div className="subsection">
            <h4>Splits</h4>
            <SplitsTable splits={batterSplits} vsHand="LHP/RHP" />
          </div>

          <div className="subsection">
            <h4>Recent Games</h4>
            <div className="game-log">
              {stats.gameLog.length > 0 ? (
                stats.gameLog.map((g, i) => (
                  <div key={i} className="gamelog-entry">
                    <span className="gamelog-date">{g.date}</span>
                    <span className="gamelog-opp">{g.isHome ? 'vs' : '@'} {g.opponent.name}</span>
                    <span className="gamelog-summary">{g.summary}</span>
                  </div>
                ))
              ) : <div className="no-data">No game log</div>}
            </div>
          </div>
        </div>

        <div className="tendency-section pitcher-section">
          <h3>Pitcher Tendencies</h3>

          <div className="subsection">
            <h4>Pitch Arsenal</h4>
            <ArsenalBars arsenal={stats.pitchArsenal} width={280} />
          </div>

          <div className="subsection">
            <h4>Zone Location</h4>
            <HeatMap zones={stats.pitcherHotCold} size={160} />
          </div>

          <div className="subsection">
            <h4>Splits</h4>
            <SplitsTable splits={pitcherSplits} vsHand="LHB/RHB" />
          </div>
        </div>
      </div>

      {stats.loading && <div className="loading-overlay">Loading stats...</div>}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="season-stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  )
}

function SplitsTable({ splits, vsHand }: { splits: StatSplit[]; vsHand: string }) {
  if (!splits || splits.length === 0) return <div className="no-data">No split data</div>

  return (
    <table className="splits-table">
      <thead>
        <tr>
          <th>{vsHand}</th>
          <th>AVG</th>
          <th>OPS</th>
          <th>K%</th>
          <th>BB%</th>
        </tr>
      </thead>
      <tbody>
        {splits.map((split, i) => {
          const pa = split.stat.plateAppearances || split.stat.atBats || 1
          return (
            <tr key={i}>
              <td>{split.split === 'vl' ? 'vs L' : split.split === 'vr' ? 'vs R' : split.split}</td>
              <td>{split.stat.avg}</td>
              <td>{split.stat.ops}</td>
              <td>{((split.stat.strikeOuts / pa) * 100).toFixed(0)}%</td>
              <td>{((split.stat.baseOnBalls / pa) * 100).toFixed(0)}%</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
