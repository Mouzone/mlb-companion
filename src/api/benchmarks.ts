import type {
  CareerBatterStat,
  CareerPitcherStat,
  PitcherSeasonStat,
  SeasonStat,
} from './types'

const BASE = 'https://statsapi.mlb.com/api'
const CAREER_BATCH_SIZE = 200

export type BenchmarkScope = 'season' | 'career'
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

export interface CareerBenchmarkCohorts {
  readonly scope: 'career'
  readonly batters: ReadonlyArray<BenchmarkPlayerStat<CareerBatterStat>>
  readonly starters: ReadonlyArray<BenchmarkPlayerStat<CareerPitcherStat>>
  readonly relievers: ReadonlyArray<BenchmarkPlayerStat<CareerPitcherStat>>
}

export type ActiveBenchmarkCohorts = SeasonBenchmarkCohorts | CareerBenchmarkCohorts

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

interface HydratedStatGroup {
  readonly type: { readonly displayName: string }
  readonly group: { readonly displayName: string }
  readonly splits?: readonly {
    readonly stat: CareerBatterStat | CareerPitcherStat
  }[]
}

interface HydratedPerson {
  readonly id: number
  readonly stats?: readonly HydratedStatGroup[]
}

interface HydratedPeopleResponse {
  readonly people?: readonly HydratedPerson[]
}

const seasonRequests = new Map<string, Promise<SeasonBenchmarkCohorts>>()
const careerRequests = new Map<string, Promise<CareerBenchmarkCohorts>>()

function pitcherRole(stat: PitcherSeasonStat): PitcherRole {
  const starts = stat.gamesStarted ?? 0
  const appearances = stat.gamesPitched ?? stat.gamesPlayed
  return starts > 0 && starts >= appearances / 2 ? 'starter' : 'reliever'
}

function isCareerPitcher(
  stat: CareerBatterStat | CareerPitcherStat,
): stat is CareerPitcherStat {
  return 'era' in stat
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

async function fetchCareerCohorts(season: string): Promise<CareerBenchmarkCohorts> {
  const cached = careerRequests.get(season)
  if (cached !== undefined) return cached

  const request = fetchSeasonCohorts(season).then(async (seasonCohorts) => {
    const batterIds = new Set(seasonCohorts.batters.map((player) => player.playerId))
    const starterIds = new Set(seasonCohorts.starters.map((player) => player.playerId))
    const relieverIds = new Set(seasonCohorts.relievers.map((player) => player.playerId))
    const activeIds = [...new Set([...batterIds, ...starterIds, ...relieverIds])]
    const batches = Array.from(
      { length: Math.ceil(activeIds.length / CAREER_BATCH_SIZE) },
      (_, index) => activeIds.slice(index * CAREER_BATCH_SIZE, (index + 1) * CAREER_BATCH_SIZE),
    )
    const responses = await Promise.all(
      batches.map((personIds) => {
        const params = new URLSearchParams({
          personIds: personIds.join(','),
          hydrate: 'stats(group=[hitting,pitching],type=[career])',
        })
        return fetchJson<HydratedPeopleResponse>(
          `${BASE}/v1/people?${params.toString()}`,
          'Active career benchmarks',
        )
      }),
    )

    const batters: BenchmarkPlayerStat<CareerBatterStat>[] = []
    const starters: BenchmarkPlayerStat<CareerPitcherStat>[] = []
    const relievers: BenchmarkPlayerStat<CareerPitcherStat>[] = []

    for (const person of responses.flatMap((response) => response.people ?? [])) {
      for (const group of person.stats ?? []) {
        if (group.type.displayName !== 'career') continue
        const stat = group.splits?.[0]?.stat
        if (stat === undefined) continue

        if (group.group.displayName === 'hitting' && batterIds.has(person.id) && !isCareerPitcher(stat)) {
          batters.push({ playerId: person.id, stat })
        }
        if (group.group.displayName !== 'pitching' || !isCareerPitcher(stat)) continue
        if (starterIds.has(person.id)) starters.push({ playerId: person.id, stat })
        if (relieverIds.has(person.id)) relievers.push({ playerId: person.id, stat })
      }
    }

    return { scope: 'career' as const, batters, starters, relievers }
  })

  careerRequests.set(season, request)
  void request.catch(() => {
    careerRequests.delete(season)
  })
  return request
}

export function fetchActiveBenchmarkCohorts(
  scope: BenchmarkScope,
  season: string,
): Promise<ActiveBenchmarkCohorts> {
  return scope === 'season' ? fetchSeasonCohorts(season) : fetchCareerCohorts(season)
}
