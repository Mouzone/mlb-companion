/**
 * Type definitions for the shared scoring module.
 *
 * Runtime code lives in scoring.mjs. This file provides TypeScript types
 * so the frontend and Cloud Functions get full type safety.
 */

export interface Baseline {
  mean: number;
  sd: number;
}

export interface LeagueBaseline {
  wrcPlus: Baseline;
  iso: Baseline;
  hrPerGame: Baseline;
  rotationFip: Baseline;
  bullpenFip: Baseline;
  blownSaveRate: Baseline;
  starterFip: Baseline;
  starterKPct: Baseline;
  starterGameScore: Baseline;
  elo: Baseline;
  winPct: Baseline;
  competitiveness: Baseline;
}

export interface TeamRating {
  teamId: number;
  abbreviation: string;
  elo: number;
  eloTrend10: number;
  winPct: number | null;
  wrcPlus: number | null;
  iso: number | null;
  hrPerGame: number | null;
  rotationFip: number | null;
  bullpenFip: number | null;
  blownSaveRate: number | null;
  divisionGamesBack: number | null;
  wildCardGamesBack: number | null;
  byeContention: number | null;
  divisionId: number | null;
  leagueId: number | null;
}

export interface PitcherRating {
  personId: number;
  fullName: string;
  fip: number | null;
  kPct: number | null;
  recentGameScore: number | null;
  startsSampled: number;
}

export interface GameInputs {
  gamePk: number;
  parkFactor: number;
  seasonProgress: number;
  home: TeamRating;
  away: TeamRating;
  homeStarter: PitcherRating | null;
  awayStarter: PitcherRating | null;
}

export type PayloadGame = Omit<GameInputs, 'parkFactor'>;

export interface WatchabilityPayload {
  date: string;
  generatedAt: string;
  season: number;
  baseline: LeagueBaseline;
  games: PayloadGame[];
}

export interface WinProbabilityPlay {
  homeTeamWinProbability: number | null;
  homeTeamWinProbabilityAdded: number | null;
  leverageIndex: number | null;
  dramaIndex: number | null;
  inning: number | null;
  captivatingIndex: number | null;
}

export interface ScoreBreakdown {
  pitching: number;
  offense: number;
  competitiveness: number;
  teamQuality: number;
  bullpen: number;
  stakes: number;
}

export type WatchabilityTier = 'elite' | 'great' | 'good' | 'average' | 'skip';

export interface WatchabilityResult {
  score: number;
  pregame: number;
  live: number | null;
  liveWeight: number;
  tier: WatchabilityTier;
  breakdown: ScoreBreakdown;
}

export type GameProgressState = 'preview' | 'live' | 'final';
