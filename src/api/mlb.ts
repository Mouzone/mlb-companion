import type {
  DiffPatchResponse,
  GameLogEntry,
  HotColdZone,
  LiveFeed,
  PitchArsenalItem,
  PitcherSeasonStat,
  PlayerInfo,
  ScheduleResponse,
  ScheduledGame,
  SeasonStat,
  StatSplit,
  VsPlayerStat,
} from './types'

const BASE = 'https://statsapi.mlb.com/api'

export async function fetchSchedule(date: string): Promise<ScheduledGame[]> {
  const res = await fetch(`${BASE}/v1/schedule?sportId=1&date=${date}&hydrate=probablePitcher,linescore`)
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
): Promise<SeasonStat | PitcherSeasonStat | null> {
  const res = await fetch(
    `${BASE}/v1/people/${personId}/stats?stats=season&group=${group}&season=${season}`,
  )
  if (!res.ok) throw new Error(`Season stats fetch failed: ${res.status}`)
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
  return data.stats?.[0]?.splits ?? []
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
  return data.stats?.[0]?.splits ?? []
}

export async function fetchStatSplits(
  personId: number,
  group: 'hitting' | 'pitching',
  season: string,
  sitCodes = 'vl,vr',
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
): Promise<GameLogEntry[]> {
  const res = await fetch(
    `${BASE}/v1/people/${personId}/stats?stats=gameLog&group=hitting&season=${season}`,
  )
  if (!res.ok) throw new Error(`Game log fetch failed: ${res.status}`)
  const data = await res.json()
  return data.stats?.[0]?.splits ?? []
}

export async function fetchVsPlayer(
  batterId: number,
  pitcherId: number,
  season: string,
): Promise<VsPlayerStat | null> {
  const res = await fetch(
    `${BASE}/v1/people/${batterId}/stats?stats=vsPlayer&group=hitting&season=${season}&opposingPlayerId=${pitcherId}`,
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
