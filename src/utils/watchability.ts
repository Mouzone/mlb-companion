/**
 * Watchability — a single 0-100 estimate of how worth watching a game is.
 *
 * Two modes feed one number:
 *
 *   PREGAME  Predicted from starters, offenses, bullpens, Elo and stakes.
 *   LIVE     Measured from what has actually happened, via the win-probability
 *            feed (leverage, win-probability swings, closeness, lateness).
 *
 * They are crossfaded by sample size, so the circle on a game card always shows
 * one meaningful number: a projection at first pitch, reality by the 6th.
 *
 * DESIGN NOTE ON DIVISION OF LABOUR
 * The nightly pipeline (scripts/build-watchability.mjs) emits *inputs* only —
 * team ratings, Elo, and the league baseline. All scoring happens here. That
 * means the formula can be retuned and shipped in a normal deploy without
 * re-running the pipeline or invalidating cached JSON.
 *
 * EVERY BASELINE IS SELF-CALIBRATING. Means and standard deviations are
 * computed across all 30 teams by the pipeline each night rather than
 * hardcoded from literature, so the z-scores stay correct as run environment
 * drifts between seasons.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/** Mean and standard deviation of one component across the league. */
export interface Baseline {
  mean: number;
  sd: number;
}

/**
 * League-wide distributions, computed nightly across all 30 teams. `sd` is
 * never allowed to reach zero by the pipeline, so division is always safe.
 */
export interface LeagueBaseline {
  /** Team wRC+ — centred near 100 by construction. */
  wrcPlus: Baseline;
  /** Team isolated power (SLG - AVG). */
  iso: Baseline;
  /** Team home runs per game. */
  hrPerGame: Baseline;
  /** Starting-rotation FIP (lower is better). */
  rotationFip: Baseline;
  /** Bullpen-only FIP, from the `rp` split (lower is better). */
  bullpenFip: Baseline;
  /** Blown saves / save opportunities (lower is better). */
  blownSaveRate: Baseline;
  /** Individual starter FIP. */
  starterFip: Baseline;
  /** Individual starter strikeout rate. */
  starterKPct: Baseline;
  /** Rolling Game Score v2 over a starter's recent outings. */
  starterGameScore: Baseline;
  /** Team Elo rating. */
  elo: Baseline;
  /** Team winning percentage. Centred near .500 by construction. */
  winPct: Baseline;
  /** Matchup competitiveness, 1 - 2*|p - 0.5|, across the season's games. */
  competitiveness: Baseline;
}

/** One team's season-to-date profile, as emitted by the pipeline. */
export interface TeamRating {
  teamId: number;
  abbreviation: string;
  elo: number;
  /** Elo movement over the last 10 games — recent form, in Elo points. */
  eloTrend10: number;
  winPct: number | null;
  wrcPlus: number | null;
  iso: number | null;
  hrPerGame: number | null;
  rotationFip: number | null;
  bullpenFip: number | null;
  blownSaveRate: number | null;
  /** Games behind the division lead. 0 means leading it. */
  divisionGamesBack: number | null;
  /** Games behind the final wild-card spot. 0 or less means currently holding one. */
  wildCardGamesBack: number | null;
  /**
   * How live this club's shot at a top-two seed is, 0-1, computed by the
   * pipeline from full league standings. Under the current format the top two
   * division winners in each league skip the wild-card round, so this is the
   * highest-stakes race in baseball and cannot be derived from one team's row.
   */
  byeContention: number | null;
  divisionId: number | null;
  leagueId: number | null;
}

/** One probable starter's profile. */
export interface PitcherRating {
  personId: number;
  fullName: string;
  fip: number | null;
  kPct: number | null;
  /** EWMA of Game Score v2 across recent starts — recent form. */
  recentGameScore: number | null;
  /** Number of starts backing `recentGameScore`. Low counts are down-weighted. */
  startsSampled: number;
}

/** Everything the client needs for one scheduled game. */
export interface GameInputs {
  gamePk: number;
  /** Park factor for the venue, full-season scale where 1.00 is neutral. */
  parkFactor: number;
  /** Fraction of the regular season elapsed, 0 at opening day, 1 at game 162. */
  seasonProgress: number;
  home: TeamRating;
  away: TeamRating;
  homeStarter: PitcherRating | null;
  awayStarter: PitcherRating | null;
}

/** The shape of the nightly artifact at /watchability.json. */
/**
 * A game as emitted by the pipeline. Park factor is excluded on purpose: it is
 * a static per-venue constant that already lives in leagueConstants.ts, so
 * shipping it in every nightly payload would fork the source of truth.
 */
export type PayloadGame = Omit<GameInputs, 'parkFactor'>;

export interface WatchabilityPayload {
  /** ISO date (YYYY-MM-DD) the slate was built for. */
  date: string;
  /** ISO timestamp of the pipeline run. */
  generatedAt: string;
  season: number;
  baseline: LeagueBaseline;
  games: PayloadGame[];
}

/** A single play from /api/v1/game/{gamePk}/winProbability. */
export interface WinProbabilityPlay {
  /** Win probability for the home team, in percentage points (0-100). */
  homeTeamWinProbability: number | null;
  /** Change in home win probability on this play, in percentage points. */
  homeTeamWinProbabilityAdded: number | null;
  /** Tango leverage index; 1.0 is a neutral situation. */
  leverageIndex: number | null;
  /** MLB's own undocumented drama measure for the play. */
  dramaIndex: number | null;
  inning: number | null;
  captivatingIndex: number | null;
}

/** Per-component breakdown, kept for debugging and future surfacing. */
export interface ScoreBreakdown {
  pitching: number;
  offense: number;
  competitiveness: number;
  teamQuality: number;
  bullpen: number;
  stakes: number;
}

export interface WatchabilityResult {
  /** The number to render, 0-100. */
  score: number;
  /** Predicted score before any live data is folded in. */
  pregame: number;
  /** Measured score from live data, or null before enough plays exist. */
  live: number | null;
  /** How much of `score` came from live data, 0-1. */
  liveWeight: number;
  tier: WatchabilityTier;
  breakdown: ScoreBreakdown;
}

export type WatchabilityTier = 'elite' | 'great' | 'good' | 'average' | 'skip';

/* -------------------------------------------------------------------------- */
/* Component weights                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Pregame component weights. These sum to 1.
 *
 * Rationale, in the order the numbers were argued:
 *
 * - Starting pitching is the single largest lever because it is the one thing
 *   a viewer can count on being present at first pitch. A Skenes start is worth
 *   tuning in for regardless of the standings.
 * - Offense is next because run-scoring is what most viewers actually enjoy;
 *   a 1-0 game is beautiful to some and unwatchable to many.
 * - Competitiveness is weighted heavily because a coin-flip matchup is what
 *   manufactures the late-inning leverage that produces memorable baseball.
 * - Team quality blends Elo with plain winning percentage. Elo is the better
 *   predictor, but winning percentage is what a viewer actually perceives —
 *   "two 95-win teams" is a reason to watch in a way a rating number is not.
 *   Both are weighted so the weaker club drags, because two strong teams is
 *   the thing being rewarded, not one strong team.
 * - Bullpen is smaller in absolute weight but is the only component that is
 *   *conditioned* on another (see `bullpenTerm`), so its practical influence
 *   is larger than its weight in exactly the games where it matters.
 * - Stakes carries real weight because postseason implications are the
 *   difference between a September game that matters and one that does not.
 *   It is gated by `seasonProgress`, so it contributes almost nothing in April
 *   and peaks in the last month.
 */
export const WEIGHTS = {
  pitching: 0.27,
  offense: 0.20,
  competitiveness: 0.18,
  teamQuality: 0.14,
  bullpen: 0.09,
  stakes: 0.12,
} as const;

/** Live component weights. These sum to 1. */
const LIVE_WEIGHTS = {
  excitementIndex: 0.40,
  leverage: 0.30,
  closeness: 0.20,
  drama: 0.10,
} as const;

/**
 * Baseball Reference's Excitement Index runs about 33 for a typical game and
 * 65+ for an all-timer. Those two anchors give the mean and a usable spread.
 */
const EGI_MEAN = 33;
const EGI_SD = 15;

/** Leverage Index is defined so that 1.0 is a neutral situation. */
const LI_MEAN = 1.0;
const LI_SD = 0.8;

/** Observed spread of MLB's per-play dramaIndex. */
const DRAMA_MEAN = 70;
const DRAMA_SD = 45;

/**
 * Plays needed before the live score is trusted completely. A nine-inning game
 * runs roughly 75 plays, so this reaches full weight around the 6th inning —
 * late enough for the sample to be stable, early enough to still be useful.
 */
const LIVE_SATURATION_PLAYS = 45;

/** Steepness of the logistic that maps a composite z-score onto 0-100. */
const SQUASH_K = 1.15;

/* -------------------------------------------------------------------------- */
/* Small numeric helpers                                                       */
/* -------------------------------------------------------------------------- */

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clamp01 = (value: number): number => clamp(value, 0, 1);

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/** Z-score against a baseline, clamped to keep one outlier from dominating. */
const z = (value: number | null, baseline: Baseline): number => {
  if (value === null || !Number.isFinite(value) || baseline.sd <= 0) return 0;
  return clamp((value - baseline.mean) / baseline.sd, -3, 3);
};

/** Z-score for a metric where lower is better (FIP, blown-save rate). */
const zInverted = (value: number | null, baseline: Baseline): number =>
  -z(value, baseline);

/** Weighted mean that ignores components with no data. */
const weightedMean = (parts: ReadonlyArray<readonly [number | null, number]>): number => {
  let sum = 0;
  let weight = 0;
  for (const [value, w] of parts) {
    if (value === null || !Number.isFinite(value)) continue;
    sum += value * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : 0;
};

/** Map an unbounded composite z-score onto the 0-100 display scale. */
const squash = (composite: number): number =>
  Math.round(100 * sigmoid(SQUASH_K * composite));

export const tierFor = (score: number): WatchabilityTier => {
  if (score >= 80) return 'elite';
  if (score >= 65) return 'great';
  if (score >= 50) return 'good';
  if (score >= 35) return 'average';
  return 'skip';
};

/* -------------------------------------------------------------------------- */
/* Elo win probability                                                         */
/* -------------------------------------------------------------------------- */

/** Elo points granted to the home side. Roughly the historical MLB edge. */
export const HOME_FIELD_ELO = 24;

/**
 * Win probability for the home team from the two Elo ratings, including home
 * field. The 400-point denominator is the Elo convention.
 */
export const eloWinProbability = (homeElo: number, awayElo: number): number => {
  const diff = homeElo + HOME_FIELD_ELO - awayElo;
  return 1 / (1 + Math.pow(10, -diff / 400));
};

/* -------------------------------------------------------------------------- */
/* Pregame components                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Quality of one starter, blending season-long skill with recent form.
 *
 * Recent form is deliberately down-weighted when it rests on very few starts:
 * a single dominant outing should nudge the number, not define it.
 */
const starterQuality = (
  pitcher: PitcherRating | null,
  fallbackRotationFip: number | null,
  baseline: LeagueBaseline,
): number => {
  // No announced starter yet — fall back to the team's rotation as a whole.
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

  // Trust recent form proportionally to sample, capping out at five starts.
  const formConfidence = clamp01(pitcher.startsSampled / 5);
  const form = z(pitcher.recentGameScore, baseline.starterGameScore);
  const formWeight = 0.35 * formConfidence;

  return skill * (1 - formWeight) + form * formWeight;
};

/**
 * The pitching matchup as a whole.
 *
 * Weighted toward the better of the two starters, because one ace is enough of
 * a reason to watch, while the worse starter mostly caps how good the game can
 * be rather than ruling it out.
 */
const pitchingTerm = (inputs: GameInputs, baseline: LeagueBaseline): number => {
  const home = starterQuality(inputs.homeStarter, inputs.home.rotationFip, baseline);
  const away = starterQuality(inputs.awayStarter, inputs.away.rotationFip, baseline);
  return 0.6 * Math.max(home, away) + 0.4 * Math.min(home, away);
};

/**
 * Expected offensive fireworks: quality of the bats, how much of it is power,
 * and how much the ballpark will amplify it.
 */
const offenseTerm = (inputs: GameInputs, baseline: LeagueBaseline): number => {
  const teamOffense = (team: TeamRating): number =>
    weightedMean([
      [z(team.wrcPlus, baseline.wrcPlus), 0.45],
      [z(team.iso, baseline.iso), 0.30],
      [z(team.hrPerGame, baseline.hrPerGame), 0.25],
    ]);

  const bats = (teamOffense(inputs.home) + teamOffense(inputs.away)) / 2;

  // Park factors are stored full-season; Coors at 1.15 is worth about half a
  // standard deviation of run environment.
  const park = (inputs.parkFactor - 1) * 3;

  return clamp(bats + park, -3, 3);
};

/**
 * How close the game projects to be. Peaks at a coin flip, because that is what
 * produces high-leverage late innings.
 */
const competitivenessRaw = (inputs: GameInputs): number => {
  const p = eloWinProbability(inputs.home.elo, inputs.away.elo);
  return 1 - 2 * Math.abs(p - 0.5);
};

/**
 * Combined strength of the two clubs, weighted so that one weak team drags the
 * matchup down rather than being averaged away.
 */
const teamQualityTerm = (inputs: GameInputs, baseline: LeagueBaseline): number => {
  const strength = (team: TeamRating): number =>
    weightedMean([
      [z(team.elo, baseline.elo), 0.6],
      [z(team.winPct, baseline.winPct), 0.4],
    ]);

  const homeZ = strength(inputs.home);
  const awayZ = strength(inputs.away);
  const mean = (homeZ + awayZ) / 2;
  const worse = Math.min(homeZ, awayZ);

  const quality = 0.65 * mean + 0.35 * worse;

  // A team playing well lately is more fun than its season line suggests.
  const form = (inputs.home.eloTrend10 + inputs.away.eloTrend10) / 2;
  const formZ = clamp(form / 15, -0.5, 0.5);

  return clamp(quality + formZ, -3, 3);
};

/**
 * Bullpen contribution, conditioned on how close the game projects to be.
 *
 * This is the one component that changes sign of *influence* rather than value.
 * A shaky bullpen in a projected blowout is the worst thing on the slate — the
 * game is decided and the innings still take forty minutes. The same bullpen in
 * a coin-flip game is why people stay up: the lead will not be safe.
 *
 * So the penalty is scaled by `1 - sigmoid(competitiveness)`: full weight when
 * a blowout looks likely, fading toward zero as the matchup tightens.
 */
const bullpenTerm = (
  inputs: GameInputs,
  baseline: LeagueBaseline,
  competitivenessZ: number,
): number => {
  const teamBullpen = (team: TeamRating): number =>
    weightedMean([
      [zInverted(team.bullpenFip, baseline.bullpenFip), 0.65],
      [zInverted(team.blownSaveRate, baseline.blownSaveRate), 0.35],
    ]);

  const quality = (teamBullpen(inputs.home) + teamBullpen(inputs.away)) / 2;
  const blowoutRisk = 1 - sigmoid(competitivenessZ);

  return quality * blowoutRisk;
};

/**
 * What the game means. Deliberately modest, and gated by how far into the
 * season we are — a division lead in April is not a reason to watch.
 */
const stakesTerm = (inputs: GameInputs): number => {
  // Take the better of a club's two paths in. A team eight back in the division
  // but holding a wild card is not desperate, and should not be scored as if
  // it were.
  const raceLeverage = (team: TeamRating): number => {
    const paths = [team.divisionGamesBack, team.wildCardGamesBack].filter(
      (gb): gb is number => gb !== null && Number.isFinite(gb),
    );
    if (paths.length === 0) return 0.5;
    // Within eight games of a spot is where a race starts to feel real.
    return clamp01(1 - Math.min(...paths) / 8);
  };

  const homeRace = raceLeverage(inputs.home);
  const awayRace = raceLeverage(inputs.away);
  const race = (homeRace + awayRace) / 2;

  // Both clubs have to be live for a head-to-head to mean anything. One
  // contender beating up on a cellar dweller is not a race game.
  const mutual = Math.min(homeRace, awayRace);

  const sameDivision =
    inputs.home.divisionId !== null &&
    inputs.home.divisionId === inputs.away.divisionId;

  // Two division rivals who both need the game is the best matchup the regular
  // season produces: they are playing each other for the same spot, so the
  // result swings the race by two games instead of one.
  const rivalryRace = sameDivision ? mutual : 0;

  // Only the top two division winners per league skip the wild-card round, so
  // a bye race is the highest-leverage thing on the board. It counts only when
  // both clubs are actually chasing one.
  const bye =
    inputs.home.byeContention === null || inputs.away.byeContention === null
      ? 0
      : Math.min(inputs.home.byeContention, inputs.away.byeContention);

  // Same-division clubs chasing a bye are fighting each other for it directly,
  // because only one of them can win the division. This is the peak case.
  const byeDuel = sameDivision ? bye : 0;

  const raw =
    race * 0.35 +
    bye * 0.2 +
    byeDuel * 0.15 +
    rivalryRace * 0.2 +
    (sameDivision ? 0.1 : 0);

  // Ramp stakes in over the season. The exponent keeps April near zero while
  // letting September reach full weight.
  const urgency = clamp01(inputs.seasonProgress) ** 1.5;

  // Recentre so a typical mid-race game sits near zero on the z-like scale.
  return (raw - 0.3) * 2.4 * urgency;
};

/* -------------------------------------------------------------------------- */
/* Pregame score                                                               */
/* -------------------------------------------------------------------------- */

export const computePregameScore = (
  inputs: GameInputs,
  baseline: LeagueBaseline,
): { score: number; breakdown: ScoreBreakdown } => {
  const competitiveness = competitivenessRaw(inputs);
  const competitivenessZ = z(competitiveness, baseline.competitiveness);

  const breakdown: ScoreBreakdown = {
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

/**
 * Baseball Reference's Excitement Index: the average win-probability swing per
 * play, scaled up for readability. The feed reports win probability in
 * percentage points, so it is converted to a fraction first.
 */
export const computeExcitementIndex = (plays: readonly WinProbabilityPlay[]): number | null => {
  if (plays.length === 0) return null;

  let total = 0;
  for (const play of plays) {
    const wpa = play.homeTeamWinProbabilityAdded;
    if (wpa !== null && Number.isFinite(wpa)) total += Math.abs(wpa) / 100;
  }

  return (total / plays.length) * 1000;
};

/**
 * How exciting the game has *actually* been, and how tense it is right now.
 *
 * Leverage and closeness are weighted by how late it is: a tie in the 2nd is
 * ordinary, the same tie in the 9th is the whole point.
 */
export const computeLiveScore = (plays: readonly WinProbabilityPlay[]): number | null => {
  if (plays.length === 0) return null;

  const last = plays[plays.length - 1];
  if (last === undefined) return null;

  const egi = computeExcitementIndex(plays);
  const egiZ = egi === null ? 0 : clamp((egi - EGI_MEAN) / EGI_SD, -3, 3);

  // Lateness ramps from the 1st through the 9th, and keeps climbing in extras.
  const lateness = last.inning === null ? 1 : clamp(last.inning / 9, 0.2, 1.3);

  const leverageZ =
    last.leverageIndex === null
      ? 0
      : clamp((last.leverageIndex - LI_MEAN) / LI_SD, -3, 3) * lateness;

  // A 50/50 game late is the single most watchable state in baseball. With no
  // win probability reported the term drops out rather than faking a blowout.
  const closenessZ =
    last.homeTeamWinProbability === null
      ? 0
      : clamp(
          (1 - 2 * Math.abs(last.homeTeamWinProbability / 100 - 0.5) - 0.5) * 2.4 * lateness,
          -3,
          3,
        );

  // Average drama across the last handful of plays, so one quiet groundout
  // does not collapse the score mid-rally.
  const recent = plays.slice(-8);
  const dramaValues = recent
    .map((play) => play.dramaIndex)
    .filter((value): value is number => value !== null && Number.isFinite(value));
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

export type GameProgressState = 'preview' | 'live' | 'final';

/**
 * The number that goes in the circle.
 *
 * Before first pitch it is the projection. As plays accumulate the measured
 * score takes over, reaching full weight around the 6th inning — late enough
 * that the sample is stable, early enough that the number still guides a
 * decision about what to turn on. Finals are pure measurement.
 */
export const computeWatchability = (
  inputs: GameInputs,
  baseline: LeagueBaseline,
  plays: readonly WinProbabilityPlay[] | null,
  state: GameProgressState,
): WatchabilityResult => {
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
