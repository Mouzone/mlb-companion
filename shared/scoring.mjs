/**
 * Shared scoring module — pure math for the watchability score.
 *
 * Importable by both the frontend (via src/utils/watchability.ts re-export)
 * and the Cloud Functions (via functions/src/scoring.ts re-export) and the
 * nightly build script (scripts/build-watchability.mjs).
 *
 * This file has ZERO imports. It is plain ESM JavaScript with JSDoc types
 * so it can be consumed without a TypeScript compilation step.
 */

/* -------------------------------------------------------------------------- */
/* League constants (mirrored from the old leagueConstants.ts)                */
/* -------------------------------------------------------------------------- */

export const LEAGUE_ERA = 4.20;
export const LEAGUE_WOBA = 0.310;
export const WOBA_SCALE = 1.24;
export const LEAGUE_R_PER_PA = 0.120;

export const PARK_FACTORS = {
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
};

/* -------------------------------------------------------------------------- */
/* Component weights                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Pregame component weights. These sum to 1.
 */
export const WEIGHTS = {
  pitching: 0.27,
  offense: 0.20,
  competitiveness: 0.18,
  teamQuality: 0.14,
  bullpen: 0.09,
  stakes: 0.12,
};

/** Live component weights. These sum to 1. */
const LIVE_WEIGHTS = {
  excitementIndex: 0.40,
  leverage: 0.30,
  closeness: 0.20,
  drama: 0.10,
};

const EGI_MEAN = 33;
const EGI_SD = 15;

const LI_MEAN = 1.0;
const LI_SD = 0.8;

const DRAMA_MEAN = 70;
const DRAMA_SD = 45;

const LIVE_SATURATION_PLAYS = 45;

const SQUASH_K = 1.15;

/* -------------------------------------------------------------------------- */
/* Small numeric helpers                                                       */
/* -------------------------------------------------------------------------- */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const clamp01 = (value) => clamp(value, 0, 1);

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

const z = (value, baseline) => {
  if (value === null || !Number.isFinite(value) || baseline.sd <= 0) return 0;
  return clamp((value - baseline.mean) / baseline.sd, -3, 3);
};

const zInverted = (value, baseline) => -z(value, baseline);

const weightedMean = (parts) => {
  let sum = 0;
  let weight = 0;
  for (const [value, w] of parts) {
    if (value === null || !Number.isFinite(value)) continue;
    sum += value * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : 0;
};

const squash = (composite) => Math.round(100 * sigmoid(SQUASH_K * composite));

export const tierFor = (score) => {
  if (score >= 80) return 'elite';
  if (score >= 65) return 'great';
  if (score >= 50) return 'good';
  if (score >= 35) return 'average';
  return 'skip';
};

/* -------------------------------------------------------------------------- */
/* Elo win probability                                                         */
/* -------------------------------------------------------------------------- */

export const HOME_FIELD_ELO = 24;

export const eloWinProbability = (homeElo, awayElo) => {
  const diff = homeElo + HOME_FIELD_ELO - awayElo;
  return 1 / (1 + Math.pow(10, -diff / 400));
};

/* -------------------------------------------------------------------------- */
/* Pregame components                                                          */
/* -------------------------------------------------------------------------- */

const starterQuality = (pitcher, fallbackRotationFip, baseline) => {
  if (pitcher === null) {
    return zInverted(fallbackRotationFip, baseline.rotationFip);
  }

  const skill = weightedMean([
    [zInverted(pitcher.fip, baseline.starterFip), 0.6],
    [z(pitcher.kPct, baseline.starterKPct), 0.4],
  ]);

  if (pitcher.recentGameScore === null || pitcher.startsSampled <= 0) {
    return skill;
  }

  const formConfidence = clamp01(pitcher.startsSampled / 5);
  const form = z(pitcher.recentGameScore, baseline.starterGameScore);
  const formWeight = 0.35 * formConfidence;

  return skill * (1 - formWeight) + form * formWeight;
};

const pitchingTerm = (inputs, baseline) => {
  const home = starterQuality(inputs.homeStarter, inputs.home.rotationFip, baseline);
  const away = starterQuality(inputs.awayStarter, inputs.away.rotationFip, baseline);
  return 0.6 * Math.max(home, away) + 0.4 * Math.min(home, away);
};

const offenseTerm = (inputs, baseline) => {
  const teamOffense = (team) =>
    weightedMean([
      [z(team.wrcPlus, baseline.wrcPlus), 0.45],
      [z(team.iso, baseline.iso), 0.30],
      [z(team.hrPerGame, baseline.hrPerGame), 0.25],
    ]);

  const bats = (teamOffense(inputs.home) + teamOffense(inputs.away)) / 2;
  const park = (inputs.parkFactor - 1) * 3;

  return clamp(bats + park, -3, 3);
};

const competitivenessRaw = (inputs) => {
  const p = eloWinProbability(inputs.home.elo, inputs.away.elo);
  return 1 - 2 * Math.abs(p - 0.5);
};

const teamQualityTerm = (inputs, baseline) => {
  const strength = (team) =>
    weightedMean([
      [z(team.elo, baseline.elo), 0.6],
      [z(team.winPct, baseline.winPct), 0.4],
    ]);

  const homeZ = strength(inputs.home);
  const awayZ = strength(inputs.away);
  const mean = (homeZ + awayZ) / 2;
  const worse = Math.min(homeZ, awayZ);

  const quality = 0.65 * mean + 0.35 * worse;

  const form = (inputs.home.eloTrend10 + inputs.away.eloTrend10) / 2;
  const formZ = clamp(form / 15, -0.5, 0.5);

  return clamp(quality + formZ, -3, 3);
};

const bullpenTerm = (inputs, baseline, competitivenessZ) => {
  const teamBullpen = (team) =>
    weightedMean([
      [zInverted(team.bullpenFip, baseline.bullpenFip), 0.65],
      [zInverted(team.blownSaveRate, baseline.blownSaveRate), 0.35],
    ]);

  const quality = (teamBullpen(inputs.home) + teamBullpen(inputs.away)) / 2;
  const blowoutRisk = 1 - sigmoid(competitivenessZ);

  return quality * blowoutRisk;
};

const stakesTerm = (inputs) => {
  const raceLeverage = (team) => {
    const paths = [team.divisionGamesBack, team.wildCardGamesBack].filter(
      (gb) => gb !== null && Number.isFinite(gb),
    );
    if (paths.length === 0) return 0.5;
    return clamp01(1 - Math.min(...paths) / 8);
  };

  const homeRace = raceLeverage(inputs.home);
  const awayRace = raceLeverage(inputs.away);
  const race = (homeRace + awayRace) / 2;

  const mutual = Math.min(homeRace, awayRace);

  const sameDivision =
    inputs.home.divisionId !== null &&
    inputs.home.divisionId === inputs.away.divisionId;

  const rivalryRace = sameDivision ? mutual : 0;

  const bye =
    inputs.home.byeContention === null || inputs.away.byeContention === null
      ? 0
      : Math.min(inputs.home.byeContention, inputs.away.byeContention);

  const byeDuel = sameDivision ? bye : 0;

  const raw =
    race * 0.35 +
    bye * 0.2 +
    byeDuel * 0.15 +
    rivalryRace * 0.2 +
    (sameDivision ? 0.1 : 0);

  const urgency = clamp01(inputs.seasonProgress) ** 1.5;

  return (raw - 0.3) * 2.4 * urgency;
};

/* -------------------------------------------------------------------------- */
/* Pregame score                                                               */
/* -------------------------------------------------------------------------- */

export const computePregameScore = (inputs, baseline) => {
  const competitiveness = competitivenessRaw(inputs);
  const competitivenessZ = z(competitiveness, baseline.competitiveness);

  const breakdown = {
    pitching: pitchingTerm(inputs, baseline),
    offense: offenseTerm(inputs, baseline),
    competitiveness: competitivenessZ,
    teamQuality: teamQualityTerm(inputs, baseline),
    bullpen: bullpenTerm(inputs, baseline, competitivenessZ),
    stakes: stakesTerm(inputs),
  };

  const composite =
    breakdown.pitching * WEIGHTS.pitching +
    breakdown.offense * WEIGHTS.offense +
    breakdown.competitiveness * WEIGHTS.competitiveness +
    breakdown.teamQuality * WEIGHTS.teamQuality +
    breakdown.bullpen * WEIGHTS.bullpen +
    breakdown.stakes * WEIGHTS.stakes;

  return { score: squash(composite), breakdown };
};

/* -------------------------------------------------------------------------- */
/* Live score                                                                  */
/* -------------------------------------------------------------------------- */

export const computeExcitementIndex = (plays) => {
  if (plays.length === 0) return null;

  let total = 0;
  for (const play of plays) {
    const wpa = play.homeTeamWinProbabilityAdded;
    if (wpa !== null && Number.isFinite(wpa)) total += Math.abs(wpa) / 100;
  }

  return (total / plays.length) * 1000;
};

export const computeLiveScore = (plays) => {
  if (plays.length === 0) return null;

  const last = plays[plays.length - 1];
  if (last === undefined) return null;

  const egi = computeExcitementIndex(plays);
  const egiZ = egi === null ? 0 : clamp((egi - EGI_MEAN) / EGI_SD, -3, 3);

  const lateness = last.inning === null ? 1 : clamp(last.inning / 9, 0.2, 1.3);

  const leverageZ =
    last.leverageIndex === null
      ? 0
      : clamp((last.leverageIndex - LI_MEAN) / LI_SD, -3, 3) * lateness;

  const closenessZ =
    last.homeTeamWinProbability === null
      ? 0
      : clamp(
          (1 - 2 * Math.abs(last.homeTeamWinProbability / 100 - 0.5) - 0.5) * 2.4 * lateness,
          -3,
          3,
        );

  const recent = plays.slice(-8);
  const dramaValues = recent
    .map((play) => play.dramaIndex)
    .filter((value) => value !== null && Number.isFinite(value));
  const dramaZ =
    dramaValues.length === 0
      ? 0
      : clamp(
          (dramaValues.reduce((a, b) => a + b, 0) / dramaValues.length - DRAMA_MEAN) /
            DRAMA_SD,
          -3,
          3,
        );

  const composite =
    egiZ * LIVE_WEIGHTS.excitementIndex +
    leverageZ * LIVE_WEIGHTS.leverage +
    closenessZ * LIVE_WEIGHTS.closeness +
    dramaZ * LIVE_WEIGHTS.drama;

  return squash(composite);
};

/* -------------------------------------------------------------------------- */
/* Combined                                                                    */
/* -------------------------------------------------------------------------- */

export const computeWatchability = (inputs, baseline, plays, state) => {
  const { score: pregame, breakdown } = computePregameScore(inputs, baseline);

  const live = plays === null ? null : computeLiveScore(plays);

  if (live === null || state === 'preview') {
    return {
      score: pregame,
      pregame,
      live,
      liveWeight: 0,
      tier: tierFor(pregame),
      breakdown,
    };
  }

  const playCount = plays === null ? 0 : plays.length;
  const liveWeight =
    state === 'final' ? 1 : clamp01(playCount / LIVE_SATURATION_PLAYS);

  const score = Math.round(pregame * (1 - liveWeight) + live * liveWeight);

  return { score, pregame, live, liveWeight, tier: tierFor(score), breakdown };
};
