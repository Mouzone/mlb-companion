import type { CurrentPlay, LiveFeed, ScheduledGame } from '../api/types'

export interface PitcherCandidate {
  id: number
  fullName: string
}

/**
 * Resolve the current pitcher from the live feed, falling back to the
 * scheduled probable only when no live data is available.
 *
 * Priority:
 * 1. `currentPlay.matchup.pitcher` — the pitcher in the current at-bat
 * 2. `liveFeed.linescore.defense.pitcher` — always populated once the feed
 *    loads, even between at-bats or when `currentPlay` is transiently null
 * 3. `selectedGame` home probable — home team pitches first (top of 1st)
 * 4. `selectedGame` away probable
 * 5. null
 */
export function derivePitcher(
  currentPlay: CurrentPlay | null,
  liveFeed: LiveFeed | null,
  selectedGame: ScheduledGame | null,
): PitcherCandidate | null {
  return (
    currentPlay?.matchup.pitcher ??
    liveFeed?.liveData.linescore.defense?.pitcher ??
    selectedGame?.teams.home.probablePitcher ??
    selectedGame?.teams.away.probablePitcher ??
    null
  )
}
