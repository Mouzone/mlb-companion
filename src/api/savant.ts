import type { SavantBattedBall } from './types'

const SAVANT_BASE = 'https://baseballsavant.mlb.com'

export async function fetchSavantBattedBalls(
  playerId: number,
  season: string,
  playerType: 'batter' | 'pitcher' = 'batter',
): Promise<SavantBattedBall[]> {
  const url = `${SAVANT_BASE}/statcast_search/csv?all=true&type=details&year=${season}&player_type=${playerType}&player_id=${playerId}&minPA=0`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Savant fetch failed: ${res.status}`)
  const csvText = await res.text()
  return parseSavantCSV(csvText)
}

function parseSavantCSV(csv: string): SavantBattedBall[] {
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',')
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
