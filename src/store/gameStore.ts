import { create } from 'zustand'
import type { LiveFeed, ScheduledGame, CurrentPlay } from '../api/types'

type Tab = 'live' | 'tendencies'

interface GameState {
  selectedGame: ScheduledGame | null
  gamePk: number | null
  liveFeed: LiveFeed | null
  currentPlay: CurrentPlay | null
  lastTimecode: string | null
  isPolling: boolean
  activeTab: Tab
  error: string | null

  selectGame: (game: ScheduledGame) => void
  setLiveFeed: (feed: LiveFeed) => void
  setCurrentPlay: (play: CurrentPlay | null) => void
  setTimecode: (tc: string) => void
  setPolling: (polling: boolean) => void
  setActiveTab: (tab: Tab) => void
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
  error: null,

  selectGame: (game) =>
    set({ selectedGame: game, gamePk: game.gamePk, liveFeed: null, currentPlay: null, lastTimecode: null, error: null }),
  setLiveFeed: (feed) =>
    set({ liveFeed: feed, currentPlay: feed.liveData.plays.currentPlay ?? null, lastTimecode: feed.metaData.timecode }),
  setCurrentPlay: (play) => set({ currentPlay: play }),
  setTimecode: (tc) => set({ lastTimecode: tc }),
  setPolling: (polling) => set({ isPolling: polling }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setError: (err) => set({ error: err }),
  reset: () => set({ selectedGame: null, gamePk: null, liveFeed: null, currentPlay: null, lastTimecode: null, isPolling: false, error: null }),
}))
