// This module is the single source of truth for canvas colors used by all charts.
// Values mirror DESIGN.md section 2 (Color) including the data-viz heat ramp,
// the 13 pitch-identity hues, and the pitch-call palette. Do not import from any
// CSS tokens or other style sources – every value is a literal hex here.
//
// IMPORTANT: If a hex literal appears in any src/components/Canvas/*.tsx, that
// is a lint-guard violation enforced by scripts/design-checks.mjs. This file
// centralizes all such literals.
//
// This module is strict-mode TypeScript, uses "as const" where appropriate, and
// exposes a small surface area for consumers:
// - PITCH_COLORS: mapping of 13 pitch codes to hues
// - UNKNOWN_PITCH_COLOR: fallback color for unknown codes
// - getPitchColor(code): drop-in replacement for the previous helper
// - CALL_COLORS: palette for ZonePlot call outcomes
// - HEAT_RAMP / HEAT_EMPTY: data-viz heat ramp and empty-color
// - TEMP_COLORS: remapped hot/cold/warm/lukewarm slots (for HeatMap)
// - EVENT_COLORS: mapping for the batted-ball event palette (SprayChart)
// - CHART: shared surface colors used by all canvases
//
// See DESIGN.md (section 2) for the exact color bindings.

// 13 pitch identity hues (FF, SI, FC, SL, ST, CU, KC, SV, CH, FS, FO, KN, EP)
export const PITCH_COLORS = {
  FF: '#d1342f', // red
  SI: '#e2662a', // orange
  FC: '#b8452f', // brick red/brown
  SL: '#1b6fb5', // blue
  ST: '#2b93c9', // sky blue
  CU: '#5b3fa8', // purple
  KC: '#7a4fc0', // purple/blue
  SV: '#3f5fc0', // indigo/blue
  CH: '#1a8a5e', // teal/green
  FS: '#3a9e6f', // green
  FO: '#57a86b', // green
  KN: '#8a7a2f', // olive
  EP: '#9b6a1f', // brown/orange
} as const;

export const UNKNOWN_PITCH_COLOR = '#8792a2' as const;

// Drop-in replacement for existing helper in pitchConstants.ts
export function getPitchColor(code: string | null | undefined): string {
  if (code && (code as string) in PITCH_COLORS) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - safe because we guarded the key above
    return (PITCH_COLORS as any)[code];
  }
  return UNKNOWN_PITCH_COLOR;
}

// Pitch-call colors used by ZonePlot when rendering the zone grid
export const CALL_COLORS = {
  ball: '#1b6fb5',
  strike: '#c8102e',
  foul: '#b25e09',
  inplay: '#0f7b4f',
} as const;

// Heat ramp (data-viz), ordered coldest -> hottest
export const HEAT_RAMP = [
  '#1864ab', // heat-1 (coldest)
  '#7fa8d4', // heat-2
  '#f4b942', // heat-3
  '#e8590c', // heat-4
  '#c8102e', // heat-5 (hottest)
] as const;
export const HEAT_EMPTY = '#f1f4f7' as const;

// Temperature categories remapped to the heat ramp values
export const TEMP_COLORS = {
  hot: '#c8102e',
  cold: '#1864ab',
  warm: '#e8590c',
  lukewarm: '#0f7b4f',
} as const;

// Batted-ball event palette remapped to muted hues on white background
export const EVENT_COLORS = {
  single: '#7a4fc0',
  double: '#2b93c9',
  triple: '#d1342f',
  home_run: '#9b6a1f',
  field_out: '#8792a2',
  force_out: '#8792a2',
  groundout: '#697386',
  flyout: '#8792a2',
  lineout: '#8792a2',
  popup: '#8a7a2f',
  sac_fly: '#57a86b',
  fielders_choice: '#3f5fc0',
  walk: '#1b6fb5',
  strikeout: '#d1342f',
} as const;

// Shared chart surface colors used by the HTML5 canvas renderers
export const CHART = {
  background: '#ffffff',
  grid: '#e3e8ee',
  axis: '#cdd5df',
  label: '#697386',
  border: '#cdd5df',
  ink: '#0a2540',
  inkOnFill: '#ffffff',
  zoneFill: '#f6f8fa',
  fieldLine: '#cdd5df',
  markerStroke: '#ffffff',
} as const;

// Re-exported type helpers for consumers
export type PitchCode = keyof typeof PITCH_COLORS;
