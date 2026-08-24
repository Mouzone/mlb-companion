/**
 * Watchability — thin re-export layer for the shared scoring module.
 *
 * The pure scoring math lives in `shared/scoring.mjs` so it can be imported by
 * both the frontend (here) and the Cloud Functions and the nightly build
 * script without duplication. Type definitions live in `shared/scoring-types.ts`.
 * All existing imports from `useWatchability`, `ScoreRing`, etc. remain
 * unchanged — they import from `utils/watchability` and this file still
 * exports everything.
 *
 * DESIGN NOTE ON DIVISION OF LABOUR
 * The nightly pipeline (scripts/build-watchability.mjs) emits *inputs* only —
 * team ratings, Elo, and the league baseline. All scoring happens in the
 * shared module. That means the formula can be retuned and shipped in a normal
 * deploy without re-running the pipeline or invalidating cached JSON.
 *
 * EVERY BASELINE IS SELF-CALIBRATING. Means and standard deviations are
 * computed across all 30 teams by the pipeline each night rather than
 * hardcoded from literature, so the z-scores stay correct as run environment
 * drifts between seasons.
 */

import {
  computePregameScore as _computePregameScore,
  computeExcitementIndex as _computeExcitementIndex,
  computeLiveScore as _computeLiveScore,
  computeWatchability as _computeWatchability,
  tierFor as _tierFor,
  eloWinProbability as _eloWinProbability,
  WEIGHTS as _WEIGHTS,
  HOME_FIELD_ELO as _HOME_FIELD_ELO,
} from '../../shared/scoring.mjs'

import type {
  GameInputs,
  LeagueBaseline,
  WinProbabilityPlay,
  ScoreBreakdown,
  WatchabilityResult,
  WatchabilityTier,
  GameProgressState,
} from '../../shared/scoring-types'

export const computePregameScore = _computePregameScore as (
  inputs: GameInputs,
  baseline: LeagueBaseline,
) => { score: number; breakdown: ScoreBreakdown }

export const computeExcitementIndex = _computeExcitementIndex as (
  plays: readonly WinProbabilityPlay[],
) => number | null

export const computeLiveScore = _computeLiveScore as (
  plays: readonly WinProbabilityPlay[],
) => number | null

export const computeWatchability = _computeWatchability as (
  inputs: GameInputs,
  baseline: LeagueBaseline,
  plays: readonly WinProbabilityPlay[] | null,
  state: GameProgressState,
) => WatchabilityResult

export const tierFor = _tierFor as (score: number) => WatchabilityTier

export const eloWinProbability = _eloWinProbability as (
  homeElo: number,
  awayElo: number,
) => number

export const WEIGHTS = _WEIGHTS as {
  readonly pitching: number
  readonly offense: number
  readonly competitiveness: number
  readonly teamQuality: number
  readonly bullpen: number
  readonly stakes: number
}

export const HOME_FIELD_ELO = _HOME_FIELD_ELO as number

export type {
  Baseline,
  LeagueBaseline,
  TeamRating,
  PitcherRating,
  GameInputs,
  PayloadGame,
  WatchabilityPayload,
  WinProbabilityPlay,
  ScoreBreakdown,
  WatchabilityResult,
  WatchabilityTier,
  GameProgressState,
} from '../../shared/scoring-types'
