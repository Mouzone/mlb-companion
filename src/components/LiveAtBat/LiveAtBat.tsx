import { useGameStore } from '../../store/gameStore'
import { usePlayerStats } from '../../hooks/usePlayerStats'
import { ZonePlot } from '../Canvas/ZonePlot'
import type { PlayEvent } from '../../api/types'

const PITCH_TYPE_NAMES: Record<string, string> = {
  FF: '4-Seam FB',
  SI: 'Sinker',
  FC: 'Cutter',
  SL: 'Slider',
  ST: 'Sweeper',
  CU: 'Curveball',
  KC: 'Knuckle Curve',
  CH: 'Changeup',
  FS: 'Splitter',
  KN: 'Knuckleball',
  FO: 'Forkball',
  SC: 'Screwball',
  EP: 'Eephus',
}

const CALL_NAMES: Record<string, string> = {
  B: 'Ball',
  C: 'Called Strike',
  S: 'Swinging Strike',
  F: 'Foul',
  X: 'In Play',
  E: 'In Play (Error)',
  H: 'Hit By Pitch',
}

export function LiveAtBat() {
  const currentPlay = useGameStore((s) => s.currentPlay)
  const liveFeed = useGameStore((s) => s.liveFeed)
  const reset = useGameStore((s) => s.reset)

  const batterId = currentPlay?.matchup.batter.id ?? null
  const pitcherId = currentPlay?.matchup.pitcher.id ?? null
  const stats = usePlayerStats(batterId, pitcherId)

  if (!currentPlay || !liveFeed) {
    return (
      <div className="tab-content">
        <div className="no-game">
          <p>Waiting for live data...</p>
          <button className="btn-back" onClick={reset}>Back to games</button>
        </div>
      </div>
    )
  }

  const pitches = currentPlay.playEvents.filter((e: PlayEvent) => e.isPitch)
  const lastPitch = pitches[pitches.length - 1]
  const { count, matchup, result, about } = currentPlay
  const homeTeam = liveFeed.gameData.teams.home
  const awayTeam = liveFeed.gameData.teams.away

  return (
    <div className="tab-content live-at-bat">
      <div className="game-header">
        <button className="btn-back" onClick={reset}>← Games</button>
        <span className="game-score">
          {awayTeam.abbreviation} {liveFeed.liveData.linescore.teams.away.runs} -{' '}
          {liveFeed.liveData.linescore.teams.home.runs} {homeTeam.abbreviation}
        </span>
        <span className="inning-info">
          {about.halfInning === 'top' ? '↑' : '↓'} {about.inning}
        </span>
      </div>

      <div className="matchup-info">
        <div className="matchup-player batter">
          <span className="player-name">{matchup.batter.fullName}</span>
          <span className="player-side">{matchup.batSide.code === 'S' ? 'S' : matchup.batSide.code}HB</span>
        </div>
        <div className="matchup-vs">vs</div>
        <div className="matchup-player pitcher">
          <span className="player-name">{matchup.pitcher.fullName}</span>
          <span className="player-side">{matchup.pitchHand.code}HP</span>
        </div>
      </div>

      {stats.vsPlayer && (
        <div className="vs-player-line">
          Career: {stats.vsPlayer.plateAppearances} PA, {stats.vsPlayer.avg} AVG, {stats.vsPlayer.ops} OPS, {stats.vsPlayer.homeRuns} HR, {stats.vsPlayer.strikeOuts} K
        </div>
      )}

      <div className="current-pitch-section">
        <h3>Last Pitch</h3>
        {lastPitch ? (
          <div className="pitch-detail">
            <div className="pitch-info-row">
              <ZonePlot
                zone={lastPitch.pitchData?.zone ?? null}
                size={150}
                pitchType={lastPitch.details?.type?.code}
                callCode={lastPitch.details?.call?.code}
              />
              <div className="pitch-stats">
                <div className="pitch-stat">
                  <span className="stat-label">Type</span>
                  <span className="stat-value">
                    {lastPitch.details?.type?.code ?? '--'}{' '}
                    {lastPitch.details?.type ? PITCH_TYPE_NAMES[lastPitch.details.type.code] ?? '' : ''}
                  </span>
                </div>
                <div className="pitch-stat">
                  <span className="stat-label">Velocity</span>
                  <span className="stat-value">{lastPitch.pitchData?.startSpeed ? `${lastPitch.pitchData.startSpeed.toFixed(1)} mph` : '--'}</span>
                </div>
                <div className="pitch-stat">
                  <span className="stat-label">Spin Rate</span>
                  <span className="stat-value">{lastPitch.pitchData?.spinRate ? `${lastPitch.pitchData.spinRate} rpm` : '--'}</span>
                </div>
                <div className="pitch-stat">
                  <span className="stat-label">Result</span>
                  <span className="stat-value">
                    {lastPitch.details?.call ? CALL_NAMES[lastPitch.details.call.code] ?? lastPitch.details.call.description : '--'}
                  </span>
                </div>
                <div className="pitch-stat">
                  <span className="stat-label">Count</span>
                  <span className="stat-value">{count.balls}-{count.strikes}, {count.outs} out</span>
                </div>
              </div>
            </div>

            {lastPitch.hitData && (
              <div className="hit-data">
                <div className="hit-stat">
                  <span className="stat-label">Exit Velo</span>
                  <span className="stat-value">{lastPitch.hitData.launchSpeed?.toFixed(1)} mph</span>
                </div>
                <div className="hit-stat">
                  <span className="stat-label">Launch Angle</span>
                  <span className="stat-value">{lastPitch.hitData.launchAngle?.toFixed(0)}°</span>
                </div>
                <div className="hit-stat">
                  <span className="stat-label">Distance</span>
                  <span className="stat-value">{lastPitch.hitData.totalDistance?.toFixed(0)} ft</span>
                </div>
                <div className="hit-stat">
                  <span className="stat-label">Trajectory</span>
                  <span className="stat-value">{lastPitch.hitData.trajectory}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="no-pitch">No pitches yet in this at-bat</div>
        )}
      </div>

      <div className="pitch-sequence">
        <h3>Pitch Sequence ({pitches.length})</h3>
        <div className="sequence-strip">
          {pitches.map((pitch, i) => {
            const callCode = pitch.details?.call?.code ?? ''
            const typeCode = pitch.details?.type?.code ?? ''
            const callColor = callCode === 'B' ? '#4488ff' : callCode === 'C' || callCode === 'S' ? '#ff4444' : callCode === 'F' ? '#ffaa44' : callCode === 'X' ? '#44ff44' : '#888'
            return (
              <div key={i} className="sequence-pitch" style={{ borderColor: callColor }}>
                <span className="seq-type">{typeCode}</span>
                <span className="seq-velo">{pitch.pitchData?.startSpeed?.toFixed(0) ?? ''}</span>
                <span className="seq-call" style={{ color: callColor }}>{callCode}</span>
              </div>
            )
          })}
        </div>
      </div>

      {result.event && about.isComplete && (
        <div className="play-result">
          <strong>{result.event}</strong>
          <span>{result.description}</span>
          {result.rbi > 0 && <span className="rbi">{result.rbi} RBI</span>}
        </div>
      )}
    </div>
  )
}
