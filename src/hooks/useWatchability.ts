/**
 * Watchability scores for a day's slate.
 *
 * Two data sources feed one number:
 *   1. `/watchability.json` — the nightly pipeline's pregame inputs (team
 *      ratings, probable-starter ratings, league baseline). Fetched once.
 *   2. `/game/{pk}/winProbability` — live leverage and win-probability swings,
 *      polled only for games actually in progress.
 *
 * Scoring itself lives in `utils/watchability.ts`, so the formula can be
 * retuned in a normal deploy without regenerating the nightly payload.
 *
 * Live polling is slate-wide, so the interval is deliberately much slower than
 * the 4s single-game live feed: excitement is a game-shape measure, not a
 * pitch-by-pitch one, and a 15-game slate would otherwise issue ~4 requests
 * per second against a public API.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchWinProbability } from '../api/mlb';
import type { ScheduledGame } from '../api/types';
import { PARK_FACTORS } from '../utils/leagueConstants';
import {
  computeWatchability,
  type GameProgressState,
  type PayloadGame,
  type WatchabilityPayload,
  type WatchabilityResult,
  type WinProbabilityPlay,
} from '../utils/watchability';

const PAYLOAD_URL = '/watchability.json';
const LIVE_POLL_INTERVAL = 30_000;
const PLAYS_STORAGE_KEY = 'mlb-watchability-plays';
/** Bump when the persisted shape changes so old entries are dropped, not misread. */
const PLAYS_STORAGE_VERSION = 1;

type PlaysRecord = Record<number, WinProbabilityPlay[]>;

/**
 * Local, not UTC. The slate is fetched with a local date, so a UTC stamp would
 * roll over at 8pm ET and discard plays for every game still in progress.
 */
function localDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadPersistedPlays(today: string): ReadonlyMap<number, WinProbabilityPlay[]> {
  try {
    const raw = sessionStorage.getItem(PLAYS_STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as { v?: number; date: string; plays: PlaysRecord };
    if (parsed.v !== PLAYS_STORAGE_VERSION) return new Map();
    if (parsed.date !== today) return new Map();
    return new Map(Object.entries(parsed.plays).map(([k, v]) => [Number(k), v]));
  } catch {
    return new Map();
  }
}

function persistPlays(plays: ReadonlyMap<number, WinProbabilityPlay[]>, today: string): void {
  try {
    const record: PlaysRecord = {};
    for (const [gamePk, gamePlays] of plays) record[gamePk] = gamePlays;
    sessionStorage.setItem(
      PLAYS_STORAGE_KEY,
      JSON.stringify({ v: PLAYS_STORAGE_VERSION, date: today, plays: record }),
    );
  } catch {
    // sessionStorage full or unavailable — live polling still works, just no seed on next load.
  }
}

/** Every baseline key the scorer dereferences as `.mean`/`.sd`. */
const REQUIRED_BASELINE_KEYS = [
  'wrcPlus',
  'iso',
  'hrPerGame',
  'rotationFip',
  'bullpenFip',
  'blownSaveRate',
  'starterFip',
  'starterKPct',
  'starterGameScore',
  'elo',
  'winPct',
  'competitiveness',
] as const;

function isUsablePayload(data: WatchabilityPayload | null): boolean {
  if (data === null || typeof data !== 'object') return false;
  if (!Array.isArray(data.games)) return false;
  const baseline = data.baseline as unknown as Record<string, unknown> | undefined;
  if (baseline === undefined || baseline === null) return false;
  return REQUIRED_BASELINE_KEYS.every((key) => {
    const entry = baseline[key] as { mean?: unknown; sd?: unknown } | undefined;
    return (
      entry !== undefined &&
      entry !== null &&
      typeof entry.mean === 'number' &&
      typeof entry.sd === 'number'
    );
  });
}

export interface WatchabilityState {
  /** Score per gamePk. Absent when the pipeline has no inputs for that game. */
  readonly scores: ReadonlyMap<number, WatchabilityResult>;
  readonly loading: boolean;
  /** True when the payload was generated for a different date than the slate. */
  readonly stale: boolean;
}

function progressFor(game: ScheduledGame): GameProgressState {
  switch (game.status.abstractGameState) {
    case 'Live':
      return 'live';
    case 'Final':
      return 'final';
    default:
      return 'preview';
  }
}

/** Stable dependency key so re-renders with an equal slate do not restart polling. */
function liveKeyFor(games: readonly ScheduledGame[]): string {
  return games
    .filter((game) => game.status.abstractGameState === 'Live')
    .map((game) => game.gamePk)
    .sort((a, b) => a - b)
    .join(',');
}

export function useWatchability(games: readonly ScheduledGame[]): WatchabilityState {
  const [payload, setPayload] = useState<WatchabilityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [plays, setPlays] = useState<ReadonlyMap<number, WinProbabilityPlay[]>>(() =>
    loadPersistedPlays(localDateStr()),
  );

  // Persisting outside the setState updater keeps the ~200KB stringify off the
  // double-invoked render path and always stamps a freshly computed date.
  useEffect(() => {
    if (plays.size === 0) return;
    persistPlays(plays, localDateStr());
  }, [plays]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveKey = liveKeyFor(games);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const res = await fetch(PAYLOAD_URL, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Watchability payload fetch failed: ${res.status}`);
        const data = (await res.json()) as WatchabilityPayload;
        // A cached payload can outlive a pipeline schema change by up to a day.
        // Reject anything missing the fields the scorer dereferences rather than
        // letting it throw mid-render behind a stale-while-revalidate cache.
        if (!isUsablePayload(data)) throw new Error('Watchability payload shape unrecognised');
        if (!cancelled) setPayload(data);
      } catch {
        // A missing payload is not an app error: cards simply render without a
        // score rather than blocking the slate.
        if (!cancelled) setPayload(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const pollLive = useCallback(async (): Promise<void> => {
    const ids = liveKey ? liveKey.split(',').map(Number) : [];
    if (ids.length === 0) return;

    const settled = await Promise.allSettled(
      ids.map(async (gamePk) => ({ gamePk, plays: await fetchWinProbability(gamePk) })),
    );

    setPlays((prev) => {
      const next = new Map(prev);
      for (const entry of settled) {
        // A failed game keeps its previous plays rather than dropping to no score.
        if (entry.status === 'fulfilled') next.set(entry.value.gamePk, entry.value.plays);
      }
      return next;
    });
  }, [liveKey]);

  useEffect(() => {
    if (!liveKey) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    void pollLive();
    intervalRef.current = setInterval(() => void pollLive(), LIVE_POLL_INTERVAL);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [liveKey, pollLive]);

  const scores = useMemo(() => {
    const result = new Map<number, WatchabilityResult>();
    if (!payload) return result;

    const inputsByGame = new Map<number, PayloadGame>(
      payload.games.map((game) => [game.gamePk, game]),
    );

    for (const game of games) {
      const inputs = inputsByGame.get(game.gamePk);
      if (!inputs) continue;

      result.set(
        game.gamePk,
        computeWatchability(
          // Park factor is owned by leagueConstants, not the nightly payload, so
          // it is reattached here rather than forked into two sources of truth.
          { ...inputs, parkFactor: PARK_FACTORS[inputs.home.abbreviation] ?? 1 },
          payload.baseline,
          plays.get(game.gamePk) ?? null,
          progressFor(game),
        ),
      );
    }

    return result;
  }, [payload, games, plays]);

  const stale = useMemo(() => {
    if (!payload) return false;
    const slateDate = games[0]?.gameDate?.slice(0, 10);
    return slateDate !== undefined && slateDate !== payload.date;
  }, [payload, games]);

  return { scores, loading, stale };
}

export default useWatchability;
