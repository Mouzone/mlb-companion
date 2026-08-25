import type { SavantGamePitch, PitchArsenalItem, CurrentPlay, LiveFeed } from '../../api/types'
import type { StatTone } from '../ui'

export type HandednessFilter = 'all' | 'RHB' | 'LHB'

export interface ArsenalMetric {
  readonly value: number | null
  readonly tone: StatTone
  readonly delta: string | null
}

export interface ColorCodedArsenalRow {
  readonly pitchType: string
  readonly pitchDescription: string
  readonly usage: number
  readonly count: number
  readonly velo: ArsenalMetric
  readonly spin: ArsenalMetric
  readonly breakVertical: ArsenalMetric
}

const DEAD_BAND_VELO = 0.8

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  let total = 0
  for (const v of values) total += v
  return total / values.length
}

function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function veloTone(actual: number, baseline: number): StatTone {
  const delta = actual - baseline
  if (Math.abs(delta) < DEAD_BAND_VELO) return 'default'
  return delta > 0 ? 'positive' : 'negative'
}

function veloDelta(actual: number, baseline: number): string {
  const delta = actual - baseline
  const sign = delta >= 0 ? '+' : '\u2212'
  return `${sign}${Math.abs(delta).toFixed(1)} vs szn`
}

function pitcherAbNumbers(allPlays: readonly CurrentPlay[], pitcherId: number): Set<number> {
  const set = new Set<number>()
  for (const play of allPlays) {
    if (play.matchup.pitcher.id === pitcherId) {
      set.add(play.about.atBatIndex + 1)
    }
  }
  return set
}

function batterHand(liveFeed: LiveFeed, batterId: number): 'L' | 'R' | 'S' | null {
  const player = liveFeed.gameData.players[`ID${batterId}`]
  return player?.batSide.code ?? null
}

export function buildGameArsenalRows(
  pitches: readonly SavantGamePitch[],
  allPlays: readonly CurrentPlay[],
  liveFeed: LiveFeed,
  pitcherId: number,
  handedness: HandednessFilter,
): ColorCodedArsenalRow[] {
  const abSet = pitcherAbNumbers(allPlays, pitcherId)

  const pitcherPitches = pitches.filter((p) => {
    if (!abSet.has(p.ab_number)) return false
    if (handedness === 'all') return true
    if (p.batter === undefined) return false
    const hand = batterHand(liveFeed, p.batter)
    if (handedness === 'RHB') return hand === 'R'
    if (handedness === 'LHB') return hand === 'L'
    return true
  })

  if (pitcherPitches.length === 0) return []

  const byType = new Map<string, SavantGamePitch[]>()
  for (const p of pitcherPitches) {
    const type = p.pitch_type ?? 'UN'
    const arr = byType.get(type) ?? []
    arr.push(p)
    byType.set(type, arr)
  }

  const totalPitches = pitcherPitches.length
  const rows: ColorCodedArsenalRow[] = []

  for (const [type, typePitches] of byType) {
    const count = typePitches.length
    const usage = (count / totalPitches) * 100

    const velos = typePitches.map((p) => finite(p.start_speed)).filter((v): v is number => v !== null)
    const spins = typePitches.map((p) => finite(p.spin_rate)).filter((v): v is number => v !== null)
    const breaks = typePitches
      .map((p) => finite(p.breaks?.breakVertical))
      .filter((v): v is number => v !== null)

    const avgVelo = mean(velos)
    const avgSpin = mean(spins)
    const avgBreak = mean(breaks)

    const seasonVelo =
      parseNumber(
        typePitches[0]?.avg_pitch_speed?.find((item) => item.pitch_type === type)?.avg_pitch_speed,
      ) ?? null

    const veloToneVal =
      avgVelo !== null && seasonVelo !== null ? veloTone(avgVelo, seasonVelo) : 'default'
    const veloDeltaVal =
      avgVelo !== null && seasonVelo !== null ? veloDelta(avgVelo, seasonVelo) : null

    rows.push({
      pitchType: type,
      pitchDescription: typePitches[0]?.description ?? type,
      usage,
      count,
      velo: { value: avgVelo, tone: veloToneVal, delta: veloDeltaVal },
      spin: { value: avgSpin, tone: 'default', delta: null },
      breakVertical: { value: avgBreak, tone: 'default', delta: null },
    })
  }

  rows.sort((a, b) => b.usage - a.usage)
  return rows
}

export function buildSeasonArsenalRows(
  arsenal: readonly PitchArsenalItem[],
): ColorCodedArsenalRow[] {
  return [...arsenal]
    .sort((a, b) => b.percentage - a.percentage)
    .map((item) => ({
      pitchType: item.type.code,
      pitchDescription: item.type.description,
      usage: item.percentage,
      count: item.count,
      velo: { value: item.averageSpeed, tone: 'default' as StatTone, delta: null },
      spin: { value: null, tone: 'default' as StatTone, delta: null },
      breakVertical: { value: null, tone: 'default' as StatTone, delta: null },
    }))
}
