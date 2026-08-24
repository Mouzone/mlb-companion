/**
 * Re-export from the shared scoring module with type safety for the
 * Cloud Functions TypeScript context.
 */

import {
  computePregameScore as _computePregameScore,
  computeExcitementIndex as _computeExcitementIndex,
  computeLiveScore as _computeLiveScore,
  computeWatchability as _computeWatchability,
  tierFor as _tierFor,
  eloWinProbability as _eloWinProbability,
  PARK_FACTORS as _PARK_FACTORS,
  WOBA_SCALE as _WOBA_SCALE,
  LEAGUE_R_PER_PA as _LEAGUE_R_PER_PA,
} from '../../shared/scoring.mjs'

import type {
  GameInputs,
  LeagueBaseline,
  WinProbabilityPlay,
  GameProgressState,
  WatchabilityResult,
  WatchabilityTier,
} from '../../shared/scoring-types'

export const computePregameScore = _computePregameScore as (
  inputs: GameInputs,
  baseline: LeagueBaseline,
) => { score: number; breakdown: { pitching: number; offense: number; competitiveness: number; teamQuality: number; bullpen: number; stakes: number } }

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

export const PARK_FACTORS: Record<string, number> = _PARK_FACTORS
export const WOBA_SCALE: number = _WOBA_SCALE
export const LEAGUE_R_PER_PA: number = _LEAGUE_R_PER_PA
