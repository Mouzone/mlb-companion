import { create } from 'zustand'
import type { LiveFeed, ScheduledGame, CurrentPlay, SavantGamePitch } from '../api/types'

type Tab = 'live' | 'pitcherVsBatter'
type ActiveSubTab = 'matchup' | 'pitching' | 'batting'
type LiveSubTab = 'atBat' | 'batterGame' | 'pitcherGame'

interface GameState {
  selectedGame: ScheduledGame | null
  gamePk: number | null
  liveFeed: LiveFeed | null
  currentPlay: CurrentPlay | null
  lastTimecode: string | null
  isPolling: boolean
  activeTab: Tab
  activeSubTab: ActiveSubTab
  liveSubTab: LiveSubTab
  recentFormGames: number
  gameFeedPitches: SavantGamePitch[]
  error: string | null

  selectGame: (game: ScheduledGame) => void
  setLiveFeed: (feed: LiveFeed) => void
  setCurrentPlay: (play: CurrentPlay | null) => void
  setTimecode: (tc: string) => void
  setPolling: (polling: boolean) => void
  setActiveTab: (tab: Tab) => void
  setActiveSubTab: (subTab: ActiveSubTab) => void
  setLiveSubTab: (subTab: LiveSubTab) => void
  setRecentFormGames: (games: number) => void
  setGameFeedPitches: (pitches: SavantGamePitch[]) => void
  setError: (err: string | null) => void
  reset: () => void
}

export const useGameStore = create<GameState>((set) => ({
  selectedGame: null,
  gamePk: null,
  liveFeed: null,
  currentPlay: null,
  lastTimecode: null,
  isPolling: false,
  activeTab: 'live',
  activeSubTab: 'matchup',
  liveSubTab: 'atBat',
  recentFormGames: 7,
  gameFeedPitches: [],
  error: null,

  selectGame: (game) =>
    set({ selectedGame: game, gamePk: game.gamePk, liveFeed: null, currentPlay: null, lastTimecode: null, gameFeedPitches: [], error: null }),
  setLiveFeed: (feed) =>
    set({ liveFeed: feed, currentPlay: feed.liveData.plays.currentPlay ?? null, lastTimecode: feed.metaData.timecode }),
  setCurrentPlay: (play) => set({ currentPlay: play }),
  setTimecode: (tc) => set({ lastTimecode: tc }),
  setPolling: (polling) => set({ isPolling: polling }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setActiveSubTab: (subTab) => set({ activeSubTab: subTab }),
  setLiveSubTab: (subTab) => set({ liveSubTab: subTab }),
  setRecentFormGames: (games) => set({ recentFormGames: games }),
  setGameFeedPitches: (pitches) => set({ gameFeedPitches: pitches }),
  setError: (err) => set({ error: err }),
  reset: () => set({ selectedGame: null, gamePk: null, liveFeed: null, currentPlay: null, lastTimecode: null, isPolling: false, gameFeedPitches: [], error: null }),
}))
