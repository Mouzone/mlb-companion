// This module is the single source of truth for canvas colors used by all charts.
// Values mirror DESIGN.md section 2 (Color) including the data-viz heat ramp,
// the 13 pitch-identity hues, and the pitch-call palette. Do not import from any
// CSS tokens or other style sources – every value is a literal hex here.
//
// IMPORTANT: If a hex literal appears in any src/components/Canvas/*.tsx or in
// src/utils/pitchConstants.ts, that is a lint-guard violation enforced by
// scripts/design-checks.mjs. This file centralizes all such literals.
//
// This module uses "as const" where appropriate and exposes a small surface
// area for consumers:
// - PITCH_COLORS: mapping of 13 pitch codes to hues
// - PITCH_COLOR_LOOKUP: the same map widened for arbitrary API codes, plus the
//   legacy `SC` alias
// - UNKNOWN_SERIES_COLOR / UNKNOWN_PITCH_COLOR: neutral fallback for any series
//   whose category is missing or unrecognized
// - getPitchColor(code): the single pitch-color lookup path
// - CALL_COLORS: palette for ZonePlot call outcomes
// - HEAT_RAMP / HEAT_EMPTY: data-viz heat ramp and empty-cell color
// - TEMP_COLORS: hot/cold/warm/lukewarm slots (for HeatMap)
// - EVENT_COLORS: batted-ball event palette (SprayChart)
// - CHART: shared surface, ink, and label colors used by all canvases
// - readableInkOn(fill): picks the higher-contrast ink for text drawn on a fill
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

/** Neutral fill for any series whose category is missing or unrecognized. */
export const UNKNOWN_SERIES_COLOR = '#8792a2';

/** Pitch-specific alias of the neutral series color, kept for existing consumers. */
export const UNKNOWN_PITCH_COLOR = UNKNOWN_SERIES_COLOR;

/**
 * Widened pitch map for lookups keyed by raw API codes. `SC` is the legacy
 * Gameday code for the screwball that `SV` replaced; both share one hue so
 * historical feeds keep rendering with their pitch identity intact.
 */
export const PITCH_COLOR_LOOKUP: Readonly<Record<string, string>> = {
  ...PITCH_COLORS,
  SC: PITCH_COLORS.SV,
};

/** The single pitch-color lookup path. Unknown or absent codes fall back to neutral. */
export function getPitchColor(code: string | null | undefined): string {
  if (!code) return UNKNOWN_PITCH_COLOR;
  return PITCH_COLOR_LOOKUP[code] ?? UNKNOWN_PITCH_COLOR;
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
export const HEAT_EMPTY = '#f1f4f7';

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
  legendLabel: '#697386',
  border: '#cdd5df',
  ink: '#0a2540',
  inkOnFill: '#ffffff',
  zoneFill: '#f6f8fa',
  fieldLine: '#cdd5df',
  markerStroke: '#ffffff',
} as const;

function channelLuminance(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.1 relative luminance of an opaque `#rrggbb` literal from this module. */
function relativeLuminance(hex: string): number {
  const packed = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channelLuminance((packed >> 16) & 0xff) +
    0.7152 * channelLuminance((packed >> 8) & 0xff) +
    0.0722 * channelLuminance(packed & 0xff)
  );
}

function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const INK_LUMINANCE = relativeLuminance(CHART.ink);
const INK_ON_FILL_LUMINANCE = relativeLuminance(CHART.inkOnFill);

/**
 * Picks whichever of CHART.ink / CHART.inkOnFill contrasts better against `fill`,
 * for text drawn on top of a saturated marker or bar. Deep hues take the light
 * ink; pale hues and the neutral series grey take the dark ink.
 */
export function readableInkOn(fill: string): string {
  const fillLuminance = relativeLuminance(fill);
  const darkInk = contrastRatio(fillLuminance, INK_LUMINANCE);
  const lightInk = contrastRatio(fillLuminance, INK_ON_FILL_LUMINANCE);
  return darkInk >= lightInk ? CHART.ink : CHART.inkOnFill;
}

// Re-exported type helpers for consumers
export type PitchCode = keyof typeof PITCH_COLORS;
