import type {
  CareerBatterStat,
  CareerPitcherStat,
  DiffPatchResponse,
  GameLogEntry,
  HotColdZone,
  LiveFeed,
  PlayByPlayResponse,
  PitchArsenalItem,
  PitcherSeasonStat,
  PlayerInfo,
  ScheduleResponse,
  ScheduledGame,
  SeasonStat,
  StatSplit,
  VsPlayerStat,
} from './types'
import type { WinProbabilityPlay } from '../utils/watchability'

const BASE = 'https://statsapi.mlb.com/api'

export async function fetchSchedule(date: string): Promise<ScheduledGame[]> {
  const res = await fetch(`${BASE}/v1/schedule?sportId=1&date=${date}&hydrate=probablePitcher,linescore,team`)
  if (!res.ok) throw new Error(`Schedule fetch failed: ${res.status}`)
  const data: ScheduleResponse = await res.json()
  return data.dates.flatMap(d => d.games)
}

export async function fetchLiveFeed(gamePk: number): Promise<LiveFeed> {
  const res = await fetch(`${BASE}/v1.1/game/${gamePk}/feed/live`)
  if (!res.ok) throw new Error(`Live feed fetch failed: ${res.status}`)
  return res.json()
}

export async function fetchDiffPatch(
  gamePk: number,
  startTimecode: string,
): Promise<DiffPatchResponse> {
  const res = await fetch(
    `${BASE}/v1.1/game/${gamePk}/feed/live/diffPatch?startTimecode=${startTimecode}`,
  )
  if (!res.ok) throw new Error(`DiffPatch fetch failed: ${res.status}`)
  return res.json()
}

/**
 * Per-play win-probability feed, the input to the live half of the watchability
 * score. This is a separate endpoint from the live feed on purpose: the live
 * feed carries `about.captivatingIndex` but omits `leverageIndex`, win
 * probability, and `dramaIndex`, so there is no way to derive excitement from
 * it alone. One call returns the whole game (~75 plays for nine innings).
 *
 * Fields are read through guards rather than a declared response type because
 * `dramaIndex` and `captivatingIndex` are undocumented, so a schema change
 * degrades to a null component instead of throwing.
 */
export async function fetchWinProbability(gamePk: number): Promise<WinProbabilityPlay[]> {
  const res = await fetch(`${BASE}/v1/game/${gamePk}/winProbability`)
  if (!res.ok) throw new Error(`Win probability fetch failed: ${res.status}`)
  const data: unknown = await res.json()
  if (!Array.isArray(data)) return []

  return data.map((raw): WinProbabilityPlay => {
    const play = isRecord(raw) ? raw : {}
    const about = isRecord(play.about) ? play.about : {}
    return {
      homeTeamWinProbability: numberOrNull(play.homeTeamWinProbability),
      homeTeamWinProbabilityAdded: numberOrNull(play.homeTeamWinProbabilityAdded),
      leverageIndex: numberOrNull(play.leverageIndex),
      dramaIndex: numberOrNull(play.dramaIndex),
      inning: numberOrNull(about.inning),
      captivatingIndex: numberOrNull(about.captivatingIndex),
    }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export async function fetchPlayer(personId: number): Promise<PlayerInfo> {
  const res = await fetch(`${BASE}/v1/people/${personId}`)
  if (!res.ok) throw new Error(`Player fetch failed: ${res.status}`)
  const data = await res.json()
  return data.people[0]
}

export async function fetchSeasonStats(
  personId: number,
  group: 'hitting' | 'pitching',
  season: string,
  mode: 'season' | 'career' = 'season',
): Promise<SeasonStat | PitcherSeasonStat | CareerBatterStat | CareerPitcherStat | null> {
  if (mode === 'career') return fetchCareerStats(personId, group)
  const res = await fetch(
    `${BASE}/v1/people/${personId}/stats?stats=season&group=${group}&season=${season}`,
  )
  if (!res.ok) throw new Error(`Season stats fetch failed: ${res.status}`)
  const data = await res.json()
  const splits = data.stats?.[0]?.splits
  if (!splits || splits.length === 0) return null
  return splits[0].stat
}

export async function fetchCareerStats(
  personId: number,
  group: 'hitting' | 'pitching',
): Promise<CareerBatterStat | CareerPitcherStat | null> {
  const res = await fetch(`${BASE}/v1/people/${personId}/stats?stats=career&group=${group}`)
  if (!res.ok) throw new Error(`Career stats fetch failed: ${res.status}`)
  const data = await res.json()
  const splits = data.stats?.[0]?.splits
  if (!splits || splits.length === 0) return null
  return splits[0].stat
}

export async function fetchPitchArsenal(
  personId: number,
  season: string,
): Promise<PitchArsenalItem[]> {
  const res = await fetch(
    `${BASE}/v1/people/${personId}/stats?stats=pitchArsenal&group=pitching&season=${season}`,
  )
  if (!res.ok) throw new Error(`Pitch arsenal fetch failed: ${res.status}`)
  const data = await res.json()
  const splits: { stat: PitchArsenalItem }[] = data.stats?.[0]?.splits ?? []
  return splits.map((split) => ({
    ...split.stat,
    percentage: Number(split.stat.percentage) * 100,
  }))
}

export async function fetchHotColdZones(
  personId: number,
  group: 'hitting' | 'pitching',
  season: string,
): Promise<HotColdZone[]> {
  const res = await fetch(
    `${BASE}/v1/people/${personId}/stats?stats=hotColdZones&group=${group}&season=${season}`,
  )
  if (!res.ok) throw new Error(`Hot/cold zones fetch failed: ${res.status}`)
  const data = await res.json()
  const splits: {
    stat?: {
      name?: string
      zones?: { zone: string; temp: HotColdZone['temp']; value: string | number }[]
    }
  }[] = data.stats?.[0]?.splits ?? []
  const split = splits.find((entry) => entry.stat?.name === 'battingAverage') ?? splits[0]
  return (split?.stat?.zones ?? []).map((zone) => ({
    zone: zone.zone,
    temp: zone.temp,
    value: Number.isFinite(Number(zone.value)) ? Number(zone.value) : 0,
  }))
}

export async function fetchStatSplits(
  personId: number,
  group: 'hitting' | 'pitching',
  season: string,
  sitCodes = 'vl,vr,risp',
): Promise<StatSplit[]> {
  const res = await fetch(
    `${BASE}/v1/people/${personId}/stats?stats=statSplits&group=${group}&season=${season}&sitCodes=${sitCodes}`,
  )
  if (!res.ok) throw new Error(`Stat splits fetch failed: ${res.status}`)
  const data = await res.json()
  return data.stats?.[0]?.splits ?? []
}

export async function fetchGameLog(
  personId: number,
  season: string,
  group: 'hitting' | 'pitching' = 'hitting',
): Promise<GameLogEntry[]> {
  const res = await fetch(
    `${BASE}/v1/people/${personId}/stats?stats=gameLog&group=${group}&season=${season}`,
  )
  if (!res.ok) throw new Error(`Game log fetch failed: ${res.status}`)
  const data = await res.json()
  return data.stats?.[0]?.splits ?? []
}

export async function fetchVsPlayer(
  batterId: number,
  pitcherId: number,
  season: string,
  mode: 'season' | 'career' = 'season',
): Promise<VsPlayerStat | null> {
  if (mode === 'career') return fetchCareerVsPlayer(batterId, pitcherId)
  return fetchVsPlayerQuery(batterId, pitcherId, `stats=vsPlayer&group=hitting&season=${season}`)
}

async function fetchVsPlayerQuery(
  batterId: number,
  pitcherId: number,
  query: string,
): Promise<VsPlayerStat | null> {
  const res = await fetch(
    `${BASE}/v1/people/${batterId}/stats?${query}&opposingPlayerId=${pitcherId}`,
  )
  if (!res.ok) throw new Error(`Vs player fetch failed: ${res.status}`)
  const data = await res.json()
  const splits = data.stats?.[0]?.splits
  if (!splits || splits.length === 0) return null
  const stat = splits[0].stat
  return {
    gamesPlayed: stat.gamesPlayed ?? 0,
    plateAppearances: stat.plateAppearances ?? 0,
    hits: stat.hits ?? 0,
    homeRuns: stat.homeRuns ?? 0,
    avg: stat.avg ?? '---',
    obp: stat.obp ?? '---',
    slg: stat.slg ?? '---',
    ops: stat.ops ?? '---',
    strikeOuts: stat.strikeOuts ?? 0,
    baseOnBalls: stat.baseOnBalls ?? 0,
  }
}

export async function fetchCareerVsPlayer(
  batterId: number,
  pitcherId: number,
): Promise<VsPlayerStat | null> {
  try {
    const total = await fetchVsPlayerQuery(batterId, pitcherId, 'stats=vsPlayerTotal&group=hitting')
    if (total) return total
  } catch (error) {
    if (!(error instanceof Error)) throw error
  }

  try {
    return await fetchVsPlayerQuery(batterId, pitcherId, 'stats=vsPlayer&group=hitting')
  } catch (error) {
    if (error instanceof Error) return null
    throw error
  }
}

export async function fetchSeriesSchedule(gameDate: string, teamId: number, opponentId: number): Promise<{ gamePk: number; date: string }[]> {
  const targetDate = gameDate.slice(0, 10)
  const center = new Date(`${targetDate}T00:00:00Z`)
  const start = new Date(center)
  const end = new Date(center)
  start.setUTCDate(start.getUTCDate() - 7)
  end.setUTCDate(end.getUTCDate() + 7)

  const res = await fetch(`${BASE}/v1/schedule?sportId=1&startDate=${start.toISOString().slice(0, 10)}&endDate=${end.toISOString().slice(0, 10)}`)
  if (!res.ok) throw new Error(`Series schedule fetch failed: ${res.status}`)
  const data: ScheduleResponse = await res.json()
  const games = data.dates
    .flatMap((date) => date.games)
    .filter((game) => {
      const awayId = game.teams.away.team.id
      const homeId = game.teams.home.team.id
      return (
        (awayId === teamId && homeId === opponentId) ||
        (awayId === opponentId && homeId === teamId)
      )
    })
    .map((game) => ({ gamePk: game.gamePk, date: game.gameDate }))
  const sortedGames = [...new Map(games.map((game) => [game.gamePk, game])).values()]
    .sort((left, right) => left.date.localeCompare(right.date))
  const runs: { gamePk: number; date: string }[][] = []

  for (const game of sortedGames) {
    const run = runs.at(-1)
    const previous = run?.at(-1)
    const dayGap = previous
      ? (Date.parse(game.date) - Date.parse(previous.date)) / 86_400_000
      : 0
    if (!run || dayGap > 1) runs.push([game])
    else run.push(game)
  }

  return runs.find((run) => run.some((game) => game.date.slice(0, 10) === targetDate)) ?? []
}

export async function fetchPlayByPlay(gamePk: number): Promise<PlayByPlayResponse> {
  const res = await fetch(`${BASE}/v1/game/${gamePk}/playByPlay`)
  if (!res.ok) throw new Error(`Play-by-play fetch failed: ${res.status}`)
  return res.json()
}

export function chunk<T>(arr: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) throw new RangeError('Chunk size must be a positive integer')
  const chunks: T[][] = []
  for (let index = 0; index < arr.length; index += size) chunks.push(arr.slice(index, index + size))
  return chunks
}

export async function fetchPlayByPlayBatch(gamePks: number[]): Promise<PlayByPlayResponse[]> {
  const responses: PlayByPlayResponse[] = []
  for (const gamePkChunk of chunk(gamePks, 5)) {
    responses.push(...(await Promise.all(gamePkChunk.map(fetchPlayByPlay))))
  }
  return responses
}
