// Update these constants annually before each season. Sources: FanGraphs league stats, ESPN park factors.

export const LEAGUE_ERA = 4.20
export const LEAGUE_WOBA = 0.310
export const WOBA_SCALE = 1.24
export const LEAGUE_R_PER_PA = 0.120

export const PARK_FACTORS: Record<string, number> = {
  AZ: 1.03,
  ATL: 1.00,
  BAL: 0.97,
  BOS: 1.04,
  CHC: 1.01,
  CIN: 1.06,
  CLE: 0.99,
  COL: 1.15,
  CWS: 1.02,
  DET: 0.98,
  HOU: 1.00,
  KC: 1.01,
  LAA: 0.99,
  LAD: 1.02,
  MIA: 0.97,
  MIL: 1.01,
  MIN: 0.99,
  NYM: 0.97,
  NYY: 1.05,
  ATH: 1.02,
  PHI: 1.03,
  PIT: 0.98,
  SD: 0.95,
  SEA: 0.96,
  SF: 0.97,
  STL: 0.99,
  TB: 0.98,
  TEX: 1.00,
  TOR: 1.00,
  WSH: 1.01,
}
