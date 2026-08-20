/**
 * Nightly watchability pipeline.
 *
 * Emits `public/watchability.json`: the *inputs* to the watchability score, not
 * the score itself. Scoring lives in `src/utils/watchability.ts` so the formula
 * can be retuned in a normal deploy without re-running this job or invalidating
 * a cached payload.
 *
 * Everything here comes from statsapi.mlb.com. FanGraphs forbids automated
 * access, so SIERA/wRC+/projections are computed from raw components instead of
 * fetched, and every league baseline is derived from the 30 teams themselves
 * rather than hardcoded from literature. That makes the z-scores self-calibrate
 * as run environment drifts year to year.
 *
 * Usage: node scripts/build-watchability.mjs [YYYY-MM-DD]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_FILE = resolve(ROOT, 'public/watchability.json');
const ELO_STATE_FILE = resolve(ROOT, 'public/elo-state.json');

const API = 'https://statsapi.mlb.com/api/v1';

/** Elo constants. K is tiny by design: one MLB game is barely evidence. */
const ELO_START = 1500;
const ELO_K = 4;
const ELO_HFA = 24;
/** Fraction of last season's rating carried forward; the rest reverts to 1500. */
const ELO_CARRYOVER = 0.75;

/** FIP's additive constant, matching computeFIP in src/utils/sabermetrics.ts. */
const FIP_CONSTANT = 3.15;

/** wOBA linear weights (FanGraphs scale, stable enough to hardcode). */
const WOBA_UBB = 0.69;
const WOBA_HBP = 0.72;
const WOBA_1B = 0.89;
const WOBA_2B = 1.27;
const WOBA_3B = 1.62;
const WOBA_HR = 2.1;

/** Divisors that put wOBA on the wRC+ scale; mirrors src/utils/leagueConstants.ts. */
const WOBA_SCALE = 1.24;
const LEAGUE_R_PER_PA = 0.12;

// ---------------------------------------------------------------------------
// fetch helpers
// ---------------------------------------------------------------------------

async function getJson(url, { retries = 3 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

/** Runs tasks with bounded concurrency so we never hammer the API. */
async function mapLimit(items, limit, worker) {
  const results = Array.from({ length: items.length });
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

const num = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** MLB reports innings as "6.2" meaning six and two thirds, not 6.2 innings. */
function ipToDecimal(value) {
  const raw = num(value);
  if (raw === null) return null;
  const whole = Math.trunc(raw);
  const outs = Math.round((raw - whole) * 10);
  return whole + outs / 3;
}

// ---------------------------------------------------------------------------
// sabermetrics
// ---------------------------------------------------------------------------

function fipFrom(stat) {
  const ip = ipToDecimal(stat?.inningsPitched);
  const hr = num(stat?.homeRuns);
  const bb = num(stat?.baseOnBalls);
  const hbp = num(stat?.hitBatsmen) ?? num(stat?.hitByPitch);
  const k = num(stat?.strikeOuts);
  if (!ip || ip <= 0 || hr === null || bb === null || k === null) return null;
  return (13 * hr + 3 * (bb + (hbp ?? 0)) - 2 * k) / ip + FIP_CONSTANT;
}

function wobaFrom(stat) {
  const h = num(stat?.hits);
  const doubles = num(stat?.doubles);
  const triples = num(stat?.triples);
  const hr = num(stat?.homeRuns);
  const bb = num(stat?.baseOnBalls);
  const ibb = num(stat?.intentionalWalks) ?? 0;
  const hbp = num(stat?.hitByPitch) ?? 0;
  const ab = num(stat?.atBats);
  const sf = num(stat?.sacFlies) ?? 0;
  if (h === null || doubles === null || triples === null || hr === null) return null;
  if (bb === null || ab === null) return null;

  const singles = h - doubles - triples - hr;
  const ubb = bb - ibb;
  const denominator = ab + bb - ibb + sf + hbp;
  if (denominator <= 0) return null;

  const numerator =
    WOBA_UBB * ubb +
    WOBA_HBP * hbp +
    WOBA_1B * singles +
    WOBA_2B * doubles +
    WOBA_3B * triples +
    WOBA_HR * hr;
  return numerator / denominator;
}

/**
 * Tango's Game Score v2: 40 baseline, +2 per out, +1 per K, -2 per walk,
 * -2 per hit, -3 per run, -6 per home run. Centred near 50 for an average start.
 */
function gameScoreV2(stat) {
  const ip = ipToDecimal(stat?.inningsPitched);
  if (ip === null) return null;
  const outs = Math.round(ip * 3);
  const k = num(stat?.strikeOuts) ?? 0;
  const bb = num(stat?.baseOnBalls) ?? 0;
  const hits = num(stat?.hits) ?? 0;
  const runs = num(stat?.runs) ?? num(stat?.earnedRuns) ?? 0;
  const hr = num(stat?.homeRuns) ?? 0;
  return 40 + 2 * outs + k - 2 * bb - 2 * hits - 3 * runs - 6 * hr;
}

function meanAndSd(values) {
  const clean = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (clean.length === 0) return { mean: 0, sd: 1 };
  const mean = clean.reduce((sum, v) => sum + v, 0) / clean.length;
  const variance = clean.reduce((sum, v) => sum + (v - mean) ** 2, 0) / clean.length;
  const sd = Math.sqrt(variance);
  // A degenerate spread would make every z-score infinite; 1 keeps them at zero.
  return { mean, sd: sd > 1e-9 ? sd : 1 };
}

// ---------------------------------------------------------------------------
// Elo
// ---------------------------------------------------------------------------

function eloExpected(ratingA, ratingB) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/**
 * 538's margin-of-victory multiplier. The log dampens blowouts and the second
 * term corrects autocorrelation: favourites are expected to win big, so a rout
 * by a strong team moves the rating less than the same rout by an underdog.
 */
function movMultiplier(margin, eloDiffWinnerPerspective) {
  return Math.log(Math.abs(margin) + 1) * (2.2 / (eloDiffWinnerPerspective * 0.001 + 2.2));
}

/**
 * Replays every completed regular-season game to produce current ratings and a
 * 10-game trend. Seeded from last season's file when present, regressed toward
 * the mean, because a club is not the same club it was in October.
 */
function computeElo(games, priorRatings) {
  const ratings = new Map();
  const history = new Map();

  const ratingFor = (teamId) => {
    if (!ratings.has(teamId)) {
      const prior = priorRatings?.[teamId];
      const seed =
        typeof prior === 'number'
          ? ELO_START + (prior - ELO_START) * ELO_CARRYOVER
          : ELO_START;
      ratings.set(teamId, seed);
      history.set(teamId, [seed]);
    }
    return ratings.get(teamId);
  };

  for (const game of games) {
    const { homeId, awayId, homeScore, awayScore } = game;
    const homeElo = ratingFor(homeId);
    const awayElo = ratingFor(awayId);

    const homeAdjusted = homeElo + ELO_HFA;
    const expectedHome = eloExpected(homeAdjusted, awayElo);
    const homeWon = homeScore > awayScore;
    const actualHome = homeWon ? 1 : 0;

    const margin = Math.abs(homeScore - awayScore);
    const winnerEdge = homeWon ? homeAdjusted - awayElo : awayElo - homeAdjusted;
    const shift = ELO_K * movMultiplier(margin, winnerEdge) * (actualHome - expectedHome);

    ratings.set(homeId, homeElo + shift);
    ratings.set(awayId, awayElo - shift);
    history.get(homeId).push(homeElo + shift);
    history.get(awayId).push(awayElo - shift);
  }

  const trend = new Map();
  for (const [teamId, series] of history) {
    const current = series[series.length - 1];
    const past = series[Math.max(0, series.length - 11)];
    trend.set(teamId, current - past);
  }
  return { ratings, trend };
}

// ---------------------------------------------------------------------------
// data collection
// ---------------------------------------------------------------------------

async function fetchTeams(season) {
  const data = await getJson(`${API}/teams?sportId=1&season=${season}`);
  const teams = new Map();
  for (const team of data.teams ?? []) {
    teams.set(team.id, {
      teamId: team.id,
      abbreviation: team.abbreviation ?? team.teamCode?.toUpperCase() ?? '',
      divisionId: team.division?.id ?? null,
      leagueId: team.league?.id ?? null,
    });
  }
  return teams;
}

async function fetchBulkTeamStats(season, group) {
  const data = await getJson(
    `${API}/teams/stats?stats=season&group=${group}&sportId=1&season=${season}`,
  );
  const byTeam = new Map();
  for (const split of data.stats?.[0]?.splits ?? []) {
    const teamId = split.team?.id;
    if (teamId) byTeam.set(teamId, split.stat ?? {});
  }
  return byTeam;
}

/**
 * Starter/reliever splits. The bulk endpoint truncates around 50 rows, so any
 * team missing a side is refetched individually rather than silently scored
 * off a missing bullpen.
 */
async function fetchRoleSplits(season, teamIds) {
  const byTeam = new Map();
  const record = (teamId, code, stat) => {
    if (!teamId || (code !== 'sp' && code !== 'rp')) return;
    const entry = byTeam.get(teamId) ?? {};
    entry[code] = stat;
    byTeam.set(teamId, entry);
  };

  const bulk = await getJson(
    `${API}/teams/stats?stats=statSplits&sitCodes=rp,sp&group=pitching&sportId=1&season=${season}`,
  );
  for (const group of bulk.stats ?? []) {
    for (const split of group.splits ?? []) {
      record(split.team?.id, split.split?.code, split.stat ?? {});
    }
  }

  const incomplete = teamIds.filter((id) => {
    const entry = byTeam.get(id);
    return !entry?.sp || !entry?.rp;
  });

  await mapLimit(incomplete, 5, async (teamId) => {
    const data = await getJson(
      `${API}/teams/${teamId}/stats?stats=statSplits&sitCodes=rp,sp&group=pitching&season=${season}&sportId=1`,
    );
    for (const group of data.stats ?? []) {
      for (const split of group.splits ?? []) {
        record(teamId, split.split?.code, split.stat ?? {});
      }
    }
  });

  return byTeam;
}

async function fetchStandings(season) {
  const data = await getJson(
    `${API}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`,
  );
  const rows = new Map();
  for (const division of data.records ?? []) {
    for (const entry of division.teamRecords ?? []) {
      const teamId = entry.team?.id;
      if (!teamId) continue;
      rows.set(teamId, {
        teamId,
        wins: num(entry.wins) ?? 0,
        losses: num(entry.losses) ?? 0,
        winPct: num(entry.winningPercentage),
        divisionGamesBack: entry.divisionGamesBack === '-' ? 0 : num(entry.divisionGamesBack),
        wildCardGamesBack: entry.wildCardGamesBack === '-' ? 0 : num(entry.wildCardGamesBack),
        divisionId: division.division?.id ?? null,
        leagueId: division.league?.id ?? null,
      });
    }
  }
  return rows;
}

/**
 * Distance from a first-round bye, which the top two seeds in each league get.
 * Seeding cannot be read off a single standings row, so division leaders are
 * ranked league-wide and every club is measured in games behind the second one.
 */
function computeByeContention(standings) {
  const contention = new Map();
  const byLeague = new Map();

  for (const row of standings.values()) {
    if (row.leagueId === null) continue;
    const league = byLeague.get(row.leagueId) ?? [];
    league.push(row);
    byLeague.set(row.leagueId, league);
  }

  for (const [, rows] of byLeague) {
    const leadersByDivision = new Map();
    for (const row of rows) {
      const current = leadersByDivision.get(row.divisionId);
      if (!current || row.wins - row.losses > current.wins - current.losses) {
        leadersByDivision.set(row.divisionId, row);
      }
    }
    const leaders = [...leadersByDivision.values()].sort(
      (a, b) => b.wins - b.losses - (a.wins - a.losses),
    );
    const byeCutoff = leaders[1];
    if (!byeCutoff) continue;

    for (const row of rows) {
      const gamesBack =
        (byeCutoff.wins - row.wins + (row.losses - byeCutoff.losses)) / 2;
      // Eight games is roughly where a race stops feeling live in September.
      contention.set(row.teamId, Math.max(0, Math.min(1, 1 - Math.max(0, gamesBack) / 8)));
    }
  }
  return contention;
}

async function fetchCompletedGames(season) {
  const data = await getJson(
    `${API}/schedule?sportId=1&gameType=R&startDate=${season}-02-01&endDate=${season}-12-01`,
  );
  const games = [];
  for (const day of data.dates ?? []) {
    for (const game of day.games ?? []) {
      if (game.status?.abstractGameState !== 'Final') continue;
      const homeScore = num(game.teams?.home?.score);
      const awayScore = num(game.teams?.away?.score);
      const homeId = game.teams?.home?.team?.id;
      const awayId = game.teams?.away?.team?.id;
      if (homeScore === null || awayScore === null || !homeId || !awayId) continue;
      if (homeScore === awayScore) continue;
      games.push({ homeId, awayId, homeScore, awayScore, date: day.date });
    }
  }
  return games;
}

async function fetchSlate(date) {
  const data = await getJson(
    `${API}/schedule?sportId=1&date=${date}&hydrate=probablePitcher,team`,
  );
  const games = [];
  for (const day of data.dates ?? []) {
    for (const game of day.games ?? []) {
      games.push({
        gamePk: game.gamePk,
        homeId: game.teams?.home?.team?.id ?? null,
        awayId: game.teams?.away?.team?.id ?? null,
        homeStarter: game.teams?.home?.probablePitcher ?? null,
        awayStarter: game.teams?.away?.probablePitcher ?? null,
      });
    }
  }
  return games;
}

/**
 * Season rate stats plus a recent-form Game Score. Recent starts are weighted
 * toward the newest outings, since a single start is mostly noise but the last
 * three carry real signal about how a pitcher is throwing right now.
 */
async function fetchPitcherRating(personId, fullName, season) {
  const [seasonData, logData] = await Promise.all([
    getJson(
      `${API}/people/${personId}/stats?stats=season&group=pitching&season=${season}`,
    ).catch(() => null),
    getJson(
      `${API}/people/${personId}/stats?stats=gameLog&group=pitching&season=${season}`,
    ).catch(() => null),
  ]);

  const seasonStat = seasonData?.stats?.[0]?.splits?.[0]?.stat ?? null;
  const fip = seasonStat ? fipFrom(seasonStat) : null;
  const batters = num(seasonStat?.battersFaced);
  const strikeouts = num(seasonStat?.strikeOuts);
  const kPct = batters && batters > 0 && strikeouts !== null ? strikeouts / batters : null;

  const starts = (logData?.stats?.[0]?.splits ?? [])
    .filter((split) => num(split.stat?.gamesStarted) === 1)
    .slice(-5);

  let recentGameScore = null;
  if (starts.length > 0) {
    let weightSum = 0;
    let total = 0;
    starts.forEach((split, index) => {
      const score = gameScoreV2(split.stat);
      if (score === null) return;
      // Most recent start counts ~5x the oldest of the five.
      const weight = index + 1;
      total += score * weight;
      weightSum += weight;
    });
    if (weightSum > 0) recentGameScore = total / weightSum;
  }

  return {
    personId,
    fullName,
    fip,
    kPct,
    recentGameScore,
    startsSampled: starts.length,
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  const season = Number(date.slice(0, 4));
  console.log(`[watchability] building for ${date} (season ${season})`);

  const priorState = await readFile(ELO_STATE_FILE, 'utf8')
    .then((raw) => JSON.parse(raw))
    .catch(() => null);
  const priorRatings = priorState?.season === season - 1 ? priorState.ratings : null;

  const teams = await fetchTeams(season);
  const teamIds = [...teams.keys()];

  const [hitting, pitching, roleSplits, standings, completed, slate] = await Promise.all([
    fetchBulkTeamStats(season, 'hitting'),
    fetchBulkTeamStats(season, 'pitching'),
    fetchRoleSplits(season, teamIds),
    fetchStandings(season),
    fetchCompletedGames(season),
    fetchSlate(date),
  ]);

  console.log(
    `[watchability] ${teams.size} teams, ${completed.length} completed games, ${slate.length} on slate`,
  );

  const { ratings: eloRatings, trend: eloTrend } = computeElo(completed, priorRatings);
  const byeContention = computeByeContention(standings);

  // A full season is 162 games; progress gates how much playoff stakes matter.
  const gamesPlayedMax = Math.max(
    1,
    ...[...standings.values()].map((row) => row.wins + row.losses),
  );
  const seasonProgress = Math.min(1, gamesPlayedMax / 162);

  const teamRatings = new Map();
  for (const teamId of teamIds) {
    const identity = teams.get(teamId);
    const hit = hitting.get(teamId);
    const pitch = pitching.get(teamId);
    const roles = roleSplits.get(teamId) ?? {};
    const standing = standings.get(teamId);
    if (!hit || !pitch) continue;

    const games = num(hit.gamesPlayed) ?? num(pitch.gamesPitched) ?? 0;
    const homeRuns = num(hit.homeRuns);
    const saveOpportunities = num(pitch.saveOpportunities);
    const blownSaves = num(pitch.blownSaves);

    teamRatings.set(teamId, {
      teamId,
      abbreviation: identity.abbreviation,
      elo: eloRatings.get(teamId) ?? ELO_START,
      eloTrend10: eloTrend.get(teamId) ?? 0,
      winPct: standing?.winPct ?? null,
      // wOBA now, rescaled to the wRC+ frame once the league mean is known.
      wrcPlus: wobaFrom(hit),
      iso: num(hit.slg) !== null && num(hit.avg) !== null ? num(hit.slg) - num(hit.avg) : null,
      hrPerGame: homeRuns !== null && games > 0 ? homeRuns / games : null,
      rotationFip: roles.sp ? fipFrom(roles.sp) : null,
      bullpenFip: roles.rp ? fipFrom(roles.rp) : null,
      blownSaveRate:
        blownSaves !== null && saveOpportunities !== null && saveOpportunities > 0
          ? blownSaves / saveOpportunities
          : null,
      divisionGamesBack: standing?.divisionGamesBack ?? null,
      wildCardGamesBack: standing?.wildCardGamesBack ?? null,
      byeContention: byeContention.get(teamId) ?? null,
      divisionId: identity.divisionId,
      leagueId: identity.leagueId,
    });
  }

  // Convert wOBA to the familiar wRC+ frame where 100 is league average. The
  // league wOBA is the mean of the 30 teams rather than a hardcoded constant,
  // so this tracks run environment automatically. Park is deliberately left out
  // here because the scoring formula applies its own park term.
  const wobaBase = meanAndSd([...teamRatings.values()].map((t) => t.wrcPlus));
  const runsPerWoba = WOBA_SCALE * LEAGUE_R_PER_PA;
  for (const rating of teamRatings.values()) {
    rating.wrcPlus =
      rating.wrcPlus === null
        ? null
        : 100 * (1 + (rating.wrcPlus - wobaBase.mean) / runsPerWoba);
  }

  const all = [...teamRatings.values()];
  const pick = (key) => all.map((t) => t[key]);

  // Competitiveness needs its own baseline: the spread of matchup closeness
  // across every possible pairing, not the spread of team strength.
  const competitivenessSamples = [];
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      const p = eloExpected(all[i].elo + ELO_HFA, all[j].elo);
      competitivenessSamples.push(1 - 2 * Math.abs(p - 0.5));
    }
  }

  const probables = new Map();
  for (const game of slate) {
    for (const starter of [game.homeStarter, game.awayStarter]) {
      if (starter?.id && !probables.has(starter.id)) {
        probables.set(starter.id, starter.fullName ?? '');
      }
    }
  }
  const pitcherRatings = await mapLimit(
    [...probables.entries()],
    5,
    ([personId, fullName]) => fetchPitcherRating(personId, fullName, season),
  );
  const pitcherById = new Map(pitcherRatings.map((p) => [p.personId, p]));

  const baseline = {
    wrcPlus: meanAndSd(pick('wrcPlus')),
    iso: meanAndSd(pick('iso')),
    hrPerGame: meanAndSd(pick('hrPerGame')),
    rotationFip: meanAndSd(pick('rotationFip')),
    bullpenFip: meanAndSd(pick('bullpenFip')),
    blownSaveRate: meanAndSd(pick('blownSaveRate')),
    starterFip: meanAndSd(pitcherRatings.map((p) => p.fip)),
    starterKPct: meanAndSd(pitcherRatings.map((p) => p.kPct)),
    starterGameScore: meanAndSd(pitcherRatings.map((p) => p.recentGameScore)),
    elo: meanAndSd(pick('elo')),
    winPct: meanAndSd(pick('winPct')),
    competitiveness: meanAndSd(competitivenessSamples),
  };

  const games = slate
    .filter((game) => teamRatings.has(game.homeId) && teamRatings.has(game.awayId))
    .map((game) => ({
      gamePk: game.gamePk,
      seasonProgress,
      home: teamRatings.get(game.homeId),
      away: teamRatings.get(game.awayId),
      homeStarter: game.homeStarter?.id ? pitcherById.get(game.homeStarter.id) ?? null : null,
      awayStarter: game.awayStarter?.id ? pitcherById.get(game.awayStarter.id) ?? null : null,
    }));

  const payload = {
    date,
    generatedAt: new Date().toISOString(),
    season,
    baseline,
    games,
  };

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify(payload)}\n`, 'utf8');
  await writeFile(
    ELO_STATE_FILE,
    `${JSON.stringify(
      {
        season,
        updatedAt: payload.generatedAt,
        ratings: Object.fromEntries([...eloRatings].map(([id, elo]) => [id, elo])),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(`[watchability] wrote ${games.length} games to public/watchability.json`);
}

main().catch((error) => {
  console.error('[watchability] failed:', error);
  process.exit(1);
});
