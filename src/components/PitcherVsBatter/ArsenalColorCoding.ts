import type { SavantGamePitch, PitchArsenalItem, CurrentPlay, LiveFeed, SavantBattedBall } from '../../api/types'
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
  readonly breakHorizontal: ArsenalMetric
}

export interface SeasonBaseline {
  readonly velo: number | null
  readonly spin: number | null
  readonly vBrk: number | null
  readonly hBrk: number | null
}

/**
 * Savant reports a pitch code; only the MLB arsenal endpoint ships a display
 * name. Rows built straight from Savant need this to avoid printing `FF`.
 */
const PITCH_NAMES: Record<string, string> = {
  FF: 'Four-seam FB',
  SI: 'Sinker',
  FC: 'Cutter',
  SL: 'Slider',
  ST: 'Sweeper',
  SV: 'Slurve',
  CU: 'Curveball',
  KC: 'Knuckle Curve',
  CH: 'Changeup',
  FS: 'Splitter',
  FO: 'Forkball',
  KN: 'Knuckleball',
  EP: 'Eephus',
  SC: 'Screwball',
}

function pitchName(code: string): string {
  return PITCH_NAMES[code] ?? code
}

const DEAD_BAND_VELO = 0.8
const DEAD_BAND_SPIN = 50
const DEAD_BAND_BREAK = 1.0

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

function metricTone(actual: number, baseline: number, deadBand: number): StatTone {
  const delta = actual - baseline
  if (Math.abs(delta) < deadBand) return 'default'
  return delta > 0 ? 'positive' : 'negative'
}

function metricDelta(actual: number, baseline: number, label: string): string {
  const delta = actual - baseline
  const sign = delta >= 0 ? '+' : '\u2212'
  return `${sign}${Math.abs(delta).toFixed(1)} ${label}`
}

function toMetric(
  actual: number | null,
  baseline: number | null,
  deadBand: number,
  label: string,
): ArsenalMetric {
  if (actual === null || baseline === null) {
    return { value: actual, tone: 'default', delta: null }
  }
  return {
    value: actual,
    tone: metricTone(actual, baseline, deadBand),
    delta: metricDelta(actual, baseline, label),
  }
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

export function buildSeasonBaselines(
  savantPitches: readonly SavantBattedBall[],
): Map<string, SeasonBaseline> {
  const byType = new Map<string, { velos: number[]; spins: number[]; vBrks: number[]; hBrks: number[] }>()

  for (const p of savantPitches) {
    const type = p.pitch_type ?? 'UN'
    const bucket = byType.get(type) ?? { velos: [], spins: [], vBrks: [], hBrks: [] }
    const velo = parseNumber(p.release_speed)
    const spin = parseNumber(p.release_spin_rate)
    const vBrk = parseNumber(p.pfx_z)
    const hBrk = parseNumber(p.pfx_x)
    if (velo !== null) bucket.velos.push(velo)
    if (spin !== null) bucket.spins.push(spin)
    if (vBrk !== null) bucket.vBrks.push(vBrk)
    if (hBrk !== null) bucket.hBrks.push(hBrk)
    byType.set(type, bucket)
  }

  const result = new Map<string, SeasonBaseline>()
  for (const [type, bucket] of byType) {
    result.set(type, {
      velo: mean(bucket.velos),
      spin: mean(bucket.spins),
      vBrk: mean(bucket.vBrks),
      hBrk: mean(bucket.hBrks),
    })
  }
  return result
}

export function buildGameArsenalRows(
  pitches: readonly SavantGamePitch[],
  allPlays: readonly CurrentPlay[],
  liveFeed: LiveFeed,
  pitcherId: number,
  handedness: HandednessFilter,
  seasonBaselines?: Map<string, SeasonBaseline>,
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
    const horizontals = typePitches
      .map((p) => finite(p.breaks?.breakHorizontal))
      .filter((v): v is number => v !== null)

    const avgVelo = mean(velos)
    const avgSpin = mean(spins)
    const avgBreak = mean(breaks)
    const avgHorizontal = mean(horizontals)

    const seasonVelo =
      parseNumber(
        typePitches[0]?.avg_pitch_speed?.find((item) => item.pitch_type === type)?.avg_pitch_speed,
      ) ?? null

    const bl = seasonBaselines?.get(type)
    const seasonSpin = bl?.spin ?? null
    const seasonVBrk = bl?.vBrk ?? null
    const seasonHBrk = bl?.hBrk ?? null

    const veloToneVal =
      avgVelo !== null && seasonVelo !== null ? metricTone(avgVelo, seasonVelo, DEAD_BAND_VELO) : 'default'
    const veloDeltaVal =
      avgVelo !== null && seasonVelo !== null ? metricDelta(avgVelo, seasonVelo, 'vs szn') : null

    const spinToneVal =
      avgSpin !== null && seasonSpin !== null ? metricTone(avgSpin, seasonSpin, DEAD_BAND_SPIN) : 'default'
    const spinDeltaVal =
      avgSpin !== null && seasonSpin !== null ? metricDelta(avgSpin, seasonSpin, 'vs L60') : null

    const vBrkToneVal =
      avgBreak !== null && seasonVBrk !== null ? metricTone(avgBreak, seasonVBrk, DEAD_BAND_BREAK) : 'default'
    const vBrkDeltaVal =
      avgBreak !== null && seasonVBrk !== null ? metricDelta(avgBreak, seasonVBrk, 'vs L60') : null

    const hBrkToneVal =
      avgHorizontal !== null && seasonHBrk !== null ? metricTone(avgHorizontal, seasonHBrk, DEAD_BAND_BREAK) : 'default'
    const hBrkDeltaVal =
      avgHorizontal !== null && seasonHBrk !== null ? metricDelta(avgHorizontal, seasonHBrk, 'vs L60') : null

    rows.push({
      pitchType: type,
      pitchDescription: pitchName(type),
      usage,
      count,
      velo: { value: avgVelo, tone: veloToneVal, delta: veloDeltaVal },
      spin: { value: avgSpin, tone: spinToneVal, delta: spinDeltaVal },
      breakVertical: { value: avgBreak, tone: vBrkToneVal, delta: vBrkDeltaVal },
      breakHorizontal: { value: avgHorizontal, tone: hBrkToneVal, delta: hBrkDeltaVal },
    })
  }

  rows.sort((a, b) => b.usage - a.usage)
  return rows
}

/**
 * The mix a batter actually saw in this game, across every pitcher who has
 * faced them. Savant tags each game pitch with its batter, so the same rows can
 * be grouped from the receiving end without an extra request. Season baselines
 * are the batter's own, so a delta reads "harder than what this hitter usually
 * sees" rather than anything about one pitcher.
 */
export function buildBatterGameArsenalRows(
  pitches: readonly SavantGamePitch[],
  batterId: number,
  seasonBaselines?: Map<string, SeasonBaseline>,
): ColorCodedArsenalRow[] {
  const faced = pitches.filter((p) => p.batter === batterId)
  if (faced.length === 0) return []

  const byType = new Map<string, SavantGamePitch[]>()
  for (const p of faced) {
    const type = p.pitch_type ?? 'UN'
    const arr = byType.get(type) ?? []
    arr.push(p)
    byType.set(type, arr)
  }

  const rows: ColorCodedArsenalRow[] = []
  for (const [type, typePitches] of byType) {
    const count = typePitches.length
    const velos = typePitches.map((p) => finite(p.start_speed)).filter((v): v is number => v !== null)
    const spins = typePitches.map((p) => finite(p.spin_rate)).filter((v): v is number => v !== null)
    const vBrks = typePitches
      .map((p) => finite(p.breaks?.breakVertical))
      .filter((v): v is number => v !== null)
    const hBrks = typePitches
      .map((p) => finite(p.breaks?.breakHorizontal))
      .filter((v): v is number => v !== null)

    const bl = seasonBaselines?.get(type)
    rows.push({
      pitchType: type,
      pitchDescription: pitchName(type),
      usage: (count / faced.length) * 100,
      count,
      velo: toMetric(mean(velos), bl?.velo ?? null, DEAD_BAND_VELO, 'vs L60'),
      spin: toMetric(mean(spins), bl?.spin ?? null, DEAD_BAND_SPIN, 'vs L60'),
      breakVertical: toMetric(mean(vBrks), bl?.vBrk ?? null, DEAD_BAND_BREAK, 'vs L60'),
      breakHorizontal: toMetric(mean(hBrks), bl?.hBrk ?? null, DEAD_BAND_BREAK, 'vs L60'),
    })
  }

  rows.sort((a, b) => b.usage - a.usage)
  return rows
}

/**
 * The batter's arsenal faced over their recent window, grouped from their own
 * Savant rows. No MLB endpoint publishes a hitter's pitch mix faced, and the
 * Savant search is capped to a rolling 60 days in-season, so the caller must
 * label this window rather than calling it a full season.
 */
export function buildFacedSeasonArsenalRows(
  savantPitches: readonly SavantBattedBall[],
): ColorCodedArsenalRow[] {
  const baselines = buildSeasonBaselines(savantPitches)
  const counts = new Map<string, number>()
  for (const p of savantPitches) {
    const type = p.pitch_type ?? 'UN'
    counts.set(type, (counts.get(type) ?? 0) + 1)
  }
  if (counts.size === 0) return []

  const total = savantPitches.length
  const rows: ColorCodedArsenalRow[] = []
  for (const [type, count] of counts) {
    const bl = baselines.get(type)
    rows.push({
      pitchType: type,
      pitchDescription: pitchName(type),
      usage: (count / total) * 100,
      count,
      velo: { value: bl?.velo ?? null, tone: 'default', delta: null },
      spin: { value: bl?.spin ?? null, tone: 'default', delta: null },
      breakVertical: { value: bl?.vBrk ?? null, tone: 'default', delta: null },
      breakHorizontal: { value: bl?.hBrk ?? null, tone: 'default', delta: null },
    })
  }

  rows.sort((a, b) => b.usage - a.usage)
  return rows
}

export function buildSeasonArsenalRows(
  arsenal: readonly PitchArsenalItem[],
  savantPitches: readonly SavantBattedBall[] = [],
): ColorCodedArsenalRow[] {
  const baselines = buildSeasonBaselines(savantPitches)

  return [...arsenal]
    .sort((a, b) => b.percentage - a.percentage)
    .map((item) => {
      const bl = baselines.get(item.type.code)
      return {
        pitchType: item.type.code,
        pitchDescription: item.type.description,
        usage: item.percentage,
        count: item.count,
        velo: { value: item.averageSpeed, tone: 'default' as StatTone, delta: null },
        spin: { value: bl?.spin ?? null, tone: 'default' as StatTone, delta: null },
        breakVertical: { value: bl?.vBrk ?? null, tone: 'default' as StatTone, delta: null },
        breakHorizontal: { value: bl?.hBrk ?? null, tone: 'default' as StatTone, delta: null },
      }
    })
}
