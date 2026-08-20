import type { SavantBattedBall, SavantGamePitch } from './types'

const SAVANT_BASE = 'https://baseballsavant.mlb.com'

interface SavantGameFeedResponse {
  home_batters: Record<string, SavantGamePitch[]>
  away_batters: Record<string, SavantGamePitch[]>
}

export async function fetchSavantGameFeed(gamePk: number): Promise<SavantGamePitch[]> {
  const res = await fetch(`${SAVANT_BASE}/gf?game_pk=${gamePk}`)
  if (!res.ok) throw new Error(`Savant game feed fetch failed: ${res.status}`)
  const data: SavantGameFeedResponse = await res.json()
  const homeRows = Object.values(data.home_batters ?? {}).flat()
  const awayRows = Object.values(data.away_batters ?? {}).flat()
  return [...homeRows, ...awayRows]
}

const RECENT_WINDOW_DAYS = 60

// Savant ignores `player_id` on statcast_search and silently returns the entire
// league (~25k rows). The recognised filters are the bracketed lookup params.
function playerLookupParam(playerType: 'batter' | 'pitcher'): string {
  return playerType === 'batter' ? 'batters_lookup%5B%5D' : 'pitchers_lookup%5B%5D'
}

// Bound in-season requests to a recent window so a single player stays well
// under ~1500 rows. Past seasons are already bounded by hfSea.
function recentWindowStart(season: string): string | null {
  const now = new Date()
  if (String(now.getUTCFullYear()) !== season) return null
  const start = new Date(now.getTime() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  return start.toISOString().slice(0, 10)
}

export async function fetchSavantBattedBalls(
  playerId: number,
  season: string,
  playerType: 'batter' | 'pitcher' = 'batter',
): Promise<SavantBattedBall[]> {
  const params = [
    'all=true',
    'type=details',
    `hfSea=${season}%7C`,
    `player_type=${playerType}`,
    `${playerLookupParam(playerType)}=${playerId}`,
    'minPA=0',
  ]
  const windowStart = recentWindowStart(season)
  if (windowStart) params.push(`game_date_gt=${windowStart}`)

  const res = await fetch(`${SAVANT_BASE}/statcast_search/csv?${params.join('&')}`)
  if (!res.ok) throw new Error(`Savant fetch failed: ${res.status}`)
  const csvText = await res.text()
  return parseSavantCSV(csvText)
}

function parseSavantCSV(csv: string): SavantBattedBall[] {
  // Savant serves a UTF-8 BOM and quotes every header cell, so a naive split
  // yields keys like `"pitch_type"` and every lookup misses.
  const lines = csv.replace(/^\uFEFF/, '').trim().split('\n')
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0]).map((h) => h.trim())
  const rows: SavantBattedBall[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length < headers.length) continue

    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? ''
    }

    rows.push({
      pitch_type: row.pitch_type ?? '',
      release_speed: row.release_speed ?? '',
      release_spin_rate: row.release_spin_rate ?? '',
      launch_speed: row.launch_speed ?? '',
      launch_angle: row.launch_angle ?? '',
      hit_distance_sc: row.hit_distance_sc ?? '',
      hc_x: row.hc_x ?? '',
      hc_y: row.hc_y ?? '',
      bb_type: row.bb_type ?? '',
      events: row.events ?? '',
      description: row.description ?? '',
      stand: row.stand ?? '',
      p_throws: row.p_throws ?? '',
      game_date: row.game_date ?? '',
      game_pk: row.game_pk ?? '',
      at_bat_number: row.at_bat_number ?? '',
      pitch_number: row.pitch_number ?? '',
      inning: row.inning ?? '',
      balls: row.balls ?? '',
      strikes: row.strikes ?? '',
      outs_when_up: row.outs_when_up ?? '',
      woba_value: row.woba_value ?? '',
      woba_denom: row.woba_denom ?? '',
      estimated_woba_using_speedangle: row.estimated_woba_using_speedangle ?? '',
      estimated_ba_using_speedangle: row.estimated_ba_using_speedangle ?? '',
      launch_speed_angle: row.launch_speed_angle ?? '',
      babip_value: row.babip_value ?? '',
      iso_value: row.iso_value ?? '',
      delta_run_exp: row.delta_run_exp ?? '',
      swing_path_tilt: row.swing_path_tilt ?? '',
      bat_speed: row.bat_speed ?? '',
    })
  }

  return rows
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}
