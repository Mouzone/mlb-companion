import { useEffect } from 'react'
import { useGameStore } from './store/gameStore'
import { GameSelect } from './components/GameSelect/GameSelect'
import { GameScreen } from './components/GameScreen'
import { FloatingGamesButton } from './components/ui'
import { fetchLiveFeed } from './api/mlb'
import { fetchSavantGameFeed } from './api/savant'
import { fetchActiveBenchmarkCohorts } from './api/benchmarks'
import { fetchCachedGameLog, fetchCachedCareerVsPlayer } from './api/playerStatsCache'
import { useLiveFeed } from './hooks/useLiveFeed'
import { preloadPlayerStats } from './hooks/usePlayerStats'
import { preloadCareerMatchupStats } from './hooks/useCareerMatchupStats'
import { derivePitcher } from './utils/derivePitcher'
import type { LiveFeed, ScheduledGame } from './api/types'
import { StatsGuide } from './components/StatsGuide/StatsGuide'
import './App.css'

const CURRENT_YEAR = new Date().getFullYear().toString()

function scheduledGameFromLiveFeed(gamePk: number, feed: LiveFeed): ScheduledGame {
  const away = feed.gameData.teams.away
  const home = feed.gameData.teams.home
  return {
    gamePk,
    gameDate: feed.gameData.datetime.dateTime,
    status: {
      abstractGameState: feed.gameData.status.abstractGameState,
      detailedState: feed.gameData.status.detailedState,
      statusCode: '',
    },
    teams: {
      away: { team: { id: away.id, name: away.name, teamName: away.name, abbreviation: away.abbreviation } },
      home: { team: { id: home.id, name: home.name, teamName: home.name, abbreviation: home.abbreviation } },
    },
  }
}

function App() {
  const selectedGame = useGameStore((s) => s.selectedGame)
  const gamePk = useGameStore((s) => s.gamePk)
  const selectGame = useGameStore((s) => s.selectGame)
  const setLiveFeed = useGameStore((s) => s.setLiveFeed)
  const setGameFeedPitches = useGameStore((s) => s.setGameFeedPitches)
  const setError = useGameStore((s) => s.setError)
  const reset = useGameStore((s) => s.reset)
  const currentPlay = useGameStore((s) => s.currentPlay)
  const liveFeed = useGameStore((s) => s.liveFeed)

  useLiveFeed()

  useEffect(() => {
    const urlGamePk = new URLSearchParams(location.search).get('gamePk')
    if (!urlGamePk) return
    const pk = Number(urlGamePk)
    if (!Number.isFinite(pk)) return

    let cancelled = false
    fetchLiveFeed(pk)
      .then((feed) => {
        if (cancelled) return
        selectGame(scheduledGameFromLiveFeed(pk, feed))
        setLiveFeed(feed)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load game')
      })

    return () => {
      cancelled = true
    }
  }, [selectGame, setLiveFeed, setError])

  useEffect(() => {
    if (gamePk == null) return
    let cancelled = false
    fetchSavantGameFeed(gamePk)
      .then((rows) => {
        if (!cancelled) setGameFeedPitches(rows)
      })
      .catch(() => {
        if (!cancelled) setGameFeedPitches([])
      })

    return () => {
      cancelled = true
    }
  }, [gamePk, setGameFeedPitches])

  useEffect(() => {
    if (gamePk == null) return
    fetchActiveBenchmarkCohorts('season', CURRENT_YEAR).catch(() => {})
  }, [gamePk])

  const pvbMatchup = currentPlay?.matchup ?? null
  const pvbBatterId = pvbMatchup?.batter.id ?? null
  const pvbPitcher = derivePitcher(currentPlay, liveFeed, selectedGame)
  const pvbPitcherId = pvbPitcher?.id ?? null

  useEffect(() => {
    if (pvbPitcherId !== null) {
      void fetchCachedGameLog(pvbPitcherId, CURRENT_YEAR, 'pitching')
    }
    if (pvbBatterId !== null && pvbPitcherId !== null) {
      preloadPlayerStats(pvbBatterId, pvbPitcherId)
      preloadCareerMatchupStats(pvbPitcherId, pvbBatterId)
      void fetchCachedCareerVsPlayer(pvbBatterId, pvbPitcherId)
    }
  }, [pvbBatterId, pvbPitcherId])

  if (!selectedGame) {
    return (
      <div className="app">
        <GameSelect />
        <StatsGuide />
      </div>
    )
  }

  return (
    <div className="app">
      <GameScreen />
      <FloatingGamesButton onClick={reset} />
      <StatsGuide />
    </div>
  )
}

export default App
