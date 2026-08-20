// Back-compat shim over ./chartTheme, which is the single source of truth for
// every chart color literal (enforced by scripts/design-checks.mjs). Existing
// consumers import PITCH_COLORS / getPitchColor from here; new code should
// import from ./chartTheme directly.
//
// PITCH_COLORS is the widened lookup rather than the 13-key canonical map so
// that callers can index it with raw API pitch codes, including the legacy
// screwball code `SC`.

export {
  PITCH_COLOR_LOOKUP as PITCH_COLORS,
  UNKNOWN_PITCH_COLOR,
  getPitchColor,
} from './chartTheme'
