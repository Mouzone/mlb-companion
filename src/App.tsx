import { useEffect } from 'react'
import { useGameStore } from './store/gameStore'
import { GameSelect } from './components/GameSelect/GameSelect'
import { LiveAtBat } from './components/LiveAtBat/LiveAtBat'
import { PitcherVsBatter } from './components/PitcherVsBatter/PitcherVsBatter'
import { fetchLiveFeed } from './api/mlb'
import { fetchSavantGameFeed } from './api/savant'
import type { LiveFeed, ScheduledGame } from './api/types'
import './App.css'

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
  const activeTab = useGameStore((s) => s.activeTab)
  const setActiveTab = useGameStore((s) => s.setActiveTab)
  const selectGame = useGameStore((s) => s.selectGame)
  const setLiveFeed = useGameStore((s) => s.setLiveFeed)
  const setGameFeedPitches = useGameStore((s) => s.setGameFeedPitches)
  const setError = useGameStore((s) => s.setError)

  // Deterministic QA/deep-link entry point: ?gamePk=<id> bypasses GameSelect.
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

  // Runs for both the GameSelect path and the ?gamePk= path, since both funnel
  // through selectGame -> gamePk. The statcast_search CSV lags a day and must
  // never feed this tab; only the same-day Savant game feed does.
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

  if (!selectedGame) {
    return (
      <div className="app">
        <GameSelect />
      </div>
    )
  }

  return (
    <div className="app">
      <div className="tab-bar">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'live' ? 'active' : ''}`}
          onClick={() => setActiveTab('live')}
        >
          Live Game
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'pitcherVsBatter' ? 'active' : ''}`}
          onClick={() => setActiveTab('pitcherVsBatter')}
        >
          Pitcher vs Batter
        </button>
      </div>
      {activeTab === 'live' ? <LiveAtBat /> : <PitcherVsBatter />}
    </div>
  )
}

export default App
