import { create } from 'zustand'
import type { LiveFeed, ScheduledGame, CurrentPlay, SavantGamePitch } from '../api/types'
import type { CurrentPitcher, CurrentBatter } from '../hooks/useLiveScores'

type ActiveTab = 'ab' | 'matchup' | 'game' | 'logs'
type GlobalScope = 'thisGame' | 'season'
type MatchupPerspective = 'pitcher' | 'batter'

interface GameState {
  selectedGame: ScheduledGame | null
  gamePk: number | null
  liveFeed: LiveFeed | null
  currentPlay: CurrentPlay | null
  lastTimecode: string | null
  isPolling: boolean
  activeTab: ActiveTab
  globalScope: GlobalScope
  matchupPerspective: MatchupPerspective
  recentFormGames: number
  gameFeedPitches: SavantGamePitch[]
  error: string | null

  scoreCache: ReadonlyMap<number, number>
  pitcherCache: ReadonlyMap<number, CurrentPitcher>
  batterCache: ReadonlyMap<number, CurrentBatter>

  selectGame: (game: ScheduledGame) => void
  setLiveFeed: (feed: LiveFeed) => void
  setCurrentPlay: (play: CurrentPlay | null) => void
  setTimecode: (tc: string) => void
  setPolling: (polling: boolean) => void
  setActiveTab: (tab: ActiveTab) => void
  setGlobalScope: (scope: GlobalScope) => void
  setMatchupPerspective: (perspective: MatchupPerspective) => void
  setRecentFormGames: (games: number) => void
  setGameFeedPitches: (pitches: SavantGamePitch[]) => void
  setError: (err: string | null) => void
  setLiveScoresCache: (scores: ReadonlyMap<number, number>, pitchers: ReadonlyMap<number, CurrentPitcher>, batters: ReadonlyMap<number, CurrentBatter>) => void
  reset: () => void
}

export const useGameStore = create<GameState>((set) => ({
  selectedGame: null,
  gamePk: null,
  liveFeed: null,
  currentPlay: null,
  lastTimecode: null,
  isPolling: false,
  activeTab: 'ab',
  globalScope: 'thisGame',
  matchupPerspective: 'pitcher',
  recentFormGames: 7,
  gameFeedPitches: [],
  error: null,

  scoreCache: new Map(),
  pitcherCache: new Map(),
  batterCache: new Map(),

  selectGame: (game) =>
    set({ selectedGame: game, gamePk: game.gamePk, liveFeed: null, currentPlay: null, lastTimecode: null, gameFeedPitches: [], error: null }),
  setLiveFeed: (feed) =>
    set({ liveFeed: feed, currentPlay: feed.liveData.plays.currentPlay ?? null, lastTimecode: feed.metaData.timeStamp }),
  setCurrentPlay: (play) => set({ currentPlay: play }),
  setTimecode: (tc) => set({ lastTimecode: tc }),
  setPolling: (polling) => set({ isPolling: polling }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setGlobalScope: (scope) => set({ globalScope: scope }),
  setMatchupPerspective: (perspective) => set({ matchupPerspective: perspective }),
  setRecentFormGames: (games) => set({ recentFormGames: games }),
  setGameFeedPitches: (pitches) => set({ gameFeedPitches: pitches }),
  setError: (err) => set({ error: err }),
  setLiveScoresCache: (scores, pitchers, batters) =>
    set({ scoreCache: scores, pitcherCache: pitchers, batterCache: batters }),
  reset: () => set({ selectedGame: null, gamePk: null, liveFeed: null, currentPlay: null, lastTimecode: null, isPolling: false, activeTab: 'ab', globalScope: 'thisGame', matchupPerspective: 'pitcher', gameFeedPitches: [], error: null }),
}))
