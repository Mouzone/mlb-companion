/**
 * League constants — re-exported from the shared scoring module.
 *
 * The constants live in `shared/scoring.mjs` so they can be imported by the
 * Cloud Functions and the nightly build script without duplication. This
 * file preserves the existing import path for the frontend.
 */

import {
  LEAGUE_ERA as _LEAGUE_ERA,
  LEAGUE_WOBA as _LEAGUE_WOBA,
  WOBA_SCALE as _WOBA_SCALE,
  LEAGUE_R_PER_PA as _LEAGUE_R_PER_PA,
  PARK_FACTORS as _PARK_FACTORS,
} from '../../shared/scoring.mjs'

export const LEAGUE_ERA: number = _LEAGUE_ERA
export const LEAGUE_WOBA: number = _LEAGUE_WOBA
export const WOBA_SCALE: number = _WOBA_SCALE
export const LEAGUE_R_PER_PA: number = _LEAGUE_R_PER_PA
export const PARK_FACTORS: Record<string, number> = _PARK_FACTORS
