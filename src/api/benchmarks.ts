import type { PitcherSeasonStat, SeasonStat } from './types'

const BASE = 'https://statsapi.mlb.com/api'

export type BenchmarkScope = 'season'
export type PitcherRole = 'starter' | 'reliever'

export interface BenchmarkPlayerStat<T> {
  readonly playerId: number
  readonly stat: T
}

export interface SeasonBenchmarkCohorts {
  readonly scope: 'season'
  readonly batters: ReadonlyArray<BenchmarkPlayerStat<SeasonStat>>
  readonly starters: ReadonlyArray<BenchmarkPlayerStat<PitcherSeasonStat>>
  readonly relievers: ReadonlyArray<BenchmarkPlayerStat<PitcherSeasonStat>>
}

export type ActiveBenchmarkCohorts = SeasonBenchmarkCohorts

interface ActivePlayer {
  readonly id: number
  readonly active: boolean
}

interface ActivePlayersResponse {
  readonly people?: readonly ActivePlayer[]
}

interface LeagueStatSplit<T> {
  readonly player: { readonly id: number }
  readonly stat: T
}

interface LeagueStatsResponse<T> {
  readonly stats?: readonly {
    readonly splits?: ReadonlyArray<LeagueStatSplit<T>>
  }[]
}

const seasonRequests = new Map<string, Promise<SeasonBenchmarkCohorts>>()

function pitcherRole(stat: PitcherSeasonStat): PitcherRole {
  const starts = stat.gamesStarted ?? 0
  const appearances = stat.gamesPitched ?? stat.gamesPlayed
  return starts > 0 && starts >= appearances / 2 ? 'starter' : 'reliever'
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${label} fetch failed: ${response.status}`)
  return response.json()
}

async function fetchSeasonCohorts(season: string): Promise<SeasonBenchmarkCohorts> {
  const cached = seasonRequests.get(season)
  if (cached !== undefined) return cached

  const request = Promise.all([
    fetchJson<ActivePlayersResponse>(
      `${BASE}/v1/sports/1/players?season=${season}`,
      'Active players',
    ),
    fetchJson<LeagueStatsResponse<SeasonStat>>(
      `${BASE}/v1/stats?stats=season&group=hitting&season=${season}&sportIds=1&playerPool=ALL&limit=2000`,
      'Active batter benchmarks',
    ),
    fetchJson<LeagueStatsResponse<PitcherSeasonStat>>(
      `${BASE}/v1/stats?stats=season&group=pitching&season=${season}&sportIds=1&playerPool=ALL&limit=2000`,
      'Active pitcher benchmarks',
    ),
  ]).then(([players, hitting, pitching]): SeasonBenchmarkCohorts => {
    const activeIds = new Set(
      (players.people ?? []).filter((player) => player.active).map((player) => player.id),
    )
    const batters = (hitting.stats?.[0]?.splits ?? [])
      .filter((split) => activeIds.has(split.player.id))
      .map((split) => ({ playerId: split.player.id, stat: split.stat }))
    const pitchers = (pitching.stats?.[0]?.splits ?? [])
      .filter((split) => activeIds.has(split.player.id))
      .map((split) => ({ playerId: split.player.id, stat: split.stat }))

    return {
      scope: 'season',
      batters,
      starters: pitchers.filter((pitcher) => pitcherRole(pitcher.stat) === 'starter'),
      relievers: pitchers.filter((pitcher) => pitcherRole(pitcher.stat) === 'reliever'),
    }
  })

  seasonRequests.set(season, request)
  // A failed cohort fetch must not be cached, or benchmarks stay missing for the
  // rest of the session with no way to recover.
  void request.catch(() => {
    seasonRequests.delete(season)
  })
  return request
}

export function fetchActiveBenchmarkCohorts(
  _scope: BenchmarkScope,
  season: string,
): Promise<ActiveBenchmarkCohorts> {
  return fetchSeasonCohorts(season)
}
