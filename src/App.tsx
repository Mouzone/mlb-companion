import { useEffect } from 'react'
import { useGameStore } from './store/gameStore'
import { GameSelect } from './components/GameSelect/GameSelect'
import { LiveGameTab } from './components/LiveGame/LiveGameTab'
import { PitcherVsBatter } from './components/PitcherVsBatter/PitcherVsBatter'
import { fetchLiveFeed } from './api/mlb'
import { fetchSavantGameFeed } from './api/savant'
import { fetchActiveBenchmarkCohorts } from './api/benchmarks'
import { fetchCachedGameLog, fetchCachedCareerVsPlayer } from './api/playerStatsCache'
import { useLiveFeed } from './hooks/useLiveFeed'
import { preloadPlayerStats } from './hooks/usePlayerStats'
import { preloadCareerMatchupStats } from './hooks/useCareerMatchupStats'
import type { LiveFeed, ScheduledGame } from './api/types'
import { Icon, TabBar } from './components/ui'
import { StatsGuide } from './components/StatsGuide/StatsGuide'
import './App.css'

const CURRENT_YEAR = new Date().getFullYear().toString()

/** `as const` keeps the literal ids, so `isTabId` can narrow TabBar's `string`
 *  back to the store's Tab union without a type assertion. */
const TABS = [
  { id: 'live', label: 'Live Game' },
  { id: 'pitcherVsBatter', label: 'Pitcher vs Batter' },
] as const

type TabId = (typeof TABS)[number]['id']

function isTabId(value: string): value is TabId {
  return TABS.some((tab) => tab.id === value)
}

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
  const reset = useGameStore((s) => s.reset)
  const currentPlay = useGameStore((s) => s.currentPlay)

  // Live feed fetches here (not in LiveGameTab) so it survives tab switches
  // and starts the moment a game is selected.
  useLiveFeed()

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

  // Preload league-wide benchmark cohorts the moment a game is selected.
  useEffect(() => {
    if (gamePk == null) return
    // Preload only; useStatBenchmarks reports the real failure when the tab opens.
    fetchActiveBenchmarkCohorts('season', CURRENT_YEAR).catch(() => {})
  }, [gamePk])

  // Derive batter/pitcher IDs the same way PitcherVsBatter does, so we can
  // preload all PVB data the moment the live feed populates — not when the
  // user eventually switches to the PVB tab. Each preload fn is idempotent
  // (module-cache guarded), so repeated calls are no-ops.
  const pvbMatchup = currentPlay?.matchup ?? null
  const pvbBatterId = pvbMatchup?.batter.id ?? null
  const pvbProbable =
    selectedGame?.teams.home.probablePitcher ?? selectedGame?.teams.away.probablePitcher ?? null
  const pvbPitcherId = pvbMatchup?.pitcher.id ?? pvbProbable?.id ?? null

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
      <TabBar
        tabs={TABS}
        activeId={activeTab}
        onSelect={(id) => {
          if (isTabId(id)) setActiveTab(id)
        }}
        leading={
          <button type="button" className="ui-tab-back" onClick={reset}>
            <Icon name="chevron-left" size={16} />
            Games
          </button>
        }
      />
      {activeTab === 'live' ? <LiveGameTab /> : <PitcherVsBatter />}
      <StatsGuide />
    </div>
  )
}

export default App
