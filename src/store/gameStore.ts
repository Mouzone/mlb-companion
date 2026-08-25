import { create } from 'zustand'
import type { LiveFeed, ScheduledGame, CurrentPlay, SavantGamePitch } from '../api/types'
import type { CurrentPitcher, CurrentBatter } from '../hooks/useLiveScores'

type ScrollAnchor = 'ab' | 'matchup' | 'game' | 'pitching' | 'batting'
type GlobalScope = 'thisGame' | 'season'
type ZonePerspective = 'pitcher' | 'batter'

interface GameState {
  selectedGame: ScheduledGame | null
  gamePk: number | null
  liveFeed: LiveFeed | null
  currentPlay: CurrentPlay | null
  lastTimecode: string | null
  isPolling: boolean
  scrollAnchor: ScrollAnchor
  globalScope: GlobalScope
  zonePerspective: ZonePerspective
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
  setScrollAnchor: (anchor: ScrollAnchor) => void
  setGlobalScope: (scope: GlobalScope) => void
  setZonePerspective: (perspective: ZonePerspective) => void
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
  scrollAnchor: 'ab',
  globalScope: 'thisGame',
  zonePerspective: 'pitcher',
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
  setScrollAnchor: (anchor) => set({ scrollAnchor: anchor }),
  setGlobalScope: (scope) => set({ globalScope: scope }),
  setZonePerspective: (perspective) => set({ zonePerspective: perspective }),
  setRecentFormGames: (games) => set({ recentFormGames: games }),
  setGameFeedPitches: (pitches) => set({ gameFeedPitches: pitches }),
  setError: (err) => set({ error: err }),
  setLiveScoresCache: (scores, pitchers, batters) =>
    set({ scoreCache: scores, pitcherCache: pitchers, batterCache: batters }),
  reset: () => set({ selectedGame: null, gamePk: null, liveFeed: null, currentPlay: null, lastTimecode: null, isPolling: false, scrollAnchor: 'ab', globalScope: 'thisGame', zonePerspective: 'pitcher', gameFeedPitches: [], error: null }),
}))
