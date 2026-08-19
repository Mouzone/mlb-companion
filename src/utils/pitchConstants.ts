// Unified pitch-type color map. Source of truth: ZonePlot.tsx's original palette (KN: '#ffffff').

export const PITCH_COLORS: Record<string, string> = {
  FF: '#ff4444',
  SI: '#ff6644',
  FC: '#ff8844',
  SL: '#4488ff',
  ST: '#44aaff',
  CU: '#44ff88',
  KC: '#44ffaa',
  CH: '#88ff44',
  FS: '#aaff44',
  KN: '#ffffff',
  FO: '#ffff44',
  SC: '#ff44ff',
  EP: '#44ffff',
}

export function getPitchColor(code: string): string {
  return PITCH_COLORS[code] ?? '#888888'
}
