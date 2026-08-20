# MLB Companion

## 1. Project Overview

MLB Companion is a mobile-first live MLB game-watching companion PWA. It is built with React 19, TypeScript, Vite 8, and zustand 5, and deploys to Vercel as a static SPA. The app targets a single viewport, iPhone 13 (390x844) in standalone PWA mode, and is designed for zero scrolling anywhere except the pre-game `GameSelect` picker. It has two top-level tabs (Live Game, Pitcher vs Batter), each with three sub-tabs, and pulls data from the public MLB Stats API and Baseball Savant. There is no backend, no router, and no test framework; the store is the only state layer.

## 2. Architecture Map

```
src/
  main.tsx                                React root. Renders <App /> inside <StrictMode>, imports index.css.
  App.tsx                                 Shell component. Exports default App. Decides GameSelect vs the 2-tab
                                           layout based on gameStore.selectedGame; handles the ?gamePk=<id> deep
                                           link (fetches live feed directly, bypassing GameSelect); fetches the
                                           Savant game feed into gameStore.gameFeedPitches whenever gamePk changes.
                                           Imports gameStore, GameSelect, LiveGameTab, PitcherVsBatter, api/mlb,
                                           api/savant, App.css.

  api/
    types.ts                              All shared TypeScript interfaces (439 lines): Team, ScheduledGame,
                                           ScheduleResponse, PlayerInfo, PitchArsenalItem, HotColdZone, StatSplit,
                                           GameLogEntry, VsPlayerStat, SeasonStat, PitcherSeasonStat, PlayEvent,
                                           CurrentPlay, LiveFeed, DiffPatchResponse, SavantBattedBall,
                                           SavantGamePitch, CareerPitcherStat, CareerBatterStat, InGameH2HAtBat,
                                           SeriesH2HGame, H2HAggregate, PlayByPlayResponse. Imported by every
                                           fetcher, hook, and component that touches API data.
    mlb.ts                                MLB Stats API client. BASE = 'https://statsapi.mlb.com/api'. Exports
                                           fetchSchedule, fetchLiveFeed, fetchDiffPatch, fetchPlayer,
                                           fetchSeasonStats, fetchCareerStats, fetchPitchArsenal, fetchHotColdZones,
                                           fetchStatSplits, fetchGameLog, fetchVsPlayer, fetchCareerVsPlayer,
                                           fetchSeriesSchedule, fetchPlayByPlay, chunk, fetchPlayByPlayBatch.
                                           Imported by App.tsx, useLiveFeed, usePlayerStats, PitcherVsBatter,
                                           MatchupSubTab, PitchingSubTab, BattingSubTab, GameSelect.
    savant.ts                             Baseball Savant client. SAVANT_BASE = 'https://baseballsavant.mlb.com'.
                                           Exports fetchSavantGameFeed (GET /gf?game_pk=N) and
                                           fetchSavantBattedBalls (GET /statcast_search/csv?...), plus internal
                                           parseSavantCSV and parseCSVLine. Imported by App.tsx and usePlayerStats.

  store/
    gameStore.ts                          Single zustand store (useGameStore). See section 6 for full shape.
                                           Imported by every component and hook that reads or writes app state.

  hooks/
    useLiveFeed.ts                        useLiveFeed(): fetches the initial live feed on gamePk change, then
                                           polls fetchDiffPatch every 4000ms (POLL_INTERVAL) and diff-patches the
                                           feed in place via applyDiff, but ONLY while
                                           gameData.status.abstractGameState === 'Live'. Returns { isPolling }.
                                           Imported by LiveGameTab (called there for its polling side effect only;
                                           unmounting LiveGameTab stops the interval).
    usePlayerStats.ts                     usePlayerStats(batterId: number | null, pitcherId: number | null):
                                           PlayerStatsData. Takes exactly these TWO arguments; derives the
                                           current season internally via `new Date().getFullYear().toString()`
                                           (module-level `currentYear` constant, not recomputed per render).
                                           Fires 10 parallel fetches (fetchSeasonStats x2, fetchPitchArsenal,
                                           fetchHotColdZones x2, fetchStatSplits x2, fetchGameLog, fetchVsPlayer,
                                           fetchSavantBattedBalls), each independently caught so one failing
                                           endpoint does not blank the rest. Returns batterSeason, pitcherSeason,
                                           pitchArsenal, batterHotCold, pitcherHotCold, batterSplits,
                                           pitcherSplits, gameLog (sliced to 5 most recent), vsPlayer, savantData
                                           (filtered to rows with both hc_x and hc_y present), loading. Imported
                                           by PitcherVsBatter, PitchingSubTab, BattingSubTab.

  utils/
    pitchConstants.ts                     Exports PITCH_COLORS (Record<string,string>, keys FF SI FC SL ST CU KC
                                           CH FS KN FO SC EP) and getPitchColor(code): falls back to '#888888' for
                                           unknown codes. Imported by ArsenalBars, ZonePlot, BatterGameSubTab,
                                           MatchupSubTab.
    leagueConstants.ts                    Exports LEAGUE_ERA (4.20), LEAGUE_WOBA (0.310), WOBA_SCALE (1.24),
                                           LEAGUE_R_PER_PA (0.120), and PARK_FACTORS (Record<string, number>, 30
                                           team-abbreviation keys). Hardcoded; must be updated annually before
                                           each season (see section 9). Imported by PitcherVsBatter.
    sabermetrics.ts                       Pure computation functions: computeFIP, computeERAplus, computeWRCplus,
                                           computeISO, computeKpct, computeBBpct, computeHR9, computeGBpct,
                                           parseStat, ipToDecimal. See section 7 for formulas. Imported by
                                           PitcherVsBatter, MatchupSubTab (indirectly via ipToDecimal/parseStat),
                                           PitchingSubTab, BattingSubTab.

  components/
    GameSelect/GameSelect.tsx             Pre-game picker. Fetches fetchSchedule(todayStr()) on mount, groups
                                           games into Live / Upcoming (Preview) / Final by
                                           status.abstractGameState, renders GameCard buttons that call
                                           gameStore.selectGame on click. THE ONLY component in the app whose
                                           container (`.game-group`) is allowed to scroll vertically. Imported by
                                           App.tsx.
    LiveGame/LiveGameTab.tsx              Live Game tab wrapper. Exports LiveGameTab. Owns the `.tab-content`
                                           flex root (719px) directly under `.tab-bar`; renders the 40px
                                           `.sub-tab-nav` (At Bat / Batter Game / Pitcher Game) as a sibling above
                                           `.sub-tab-panel` (679px = var(--content-h)). Calls useLiveFeed() for
                                           its polling side effect. Dispatches to LiveAtBat, BatterGameSubTab, or
                                           PitcherGameSubTab based on gameStore.liveSubTab. Imported by App.tsx.
    LiveGame/BatterGameSubTab.tsx         "Batter Game" sub-tab. Derives everything from
                                           liveFeed.liveData.plays.allPlays and gameStore.gameFeedPitches already
                                           in the store; issues no network requests itself. Renders a pitch-type
                                           tally + ZonePlot (h-190), a per-plate-appearance game log (h-160), and
                                           a batted-ball list with joined bat speed (h-120). Imported by
                                           LiveGameTab.
    LiveGame/PitcherGameSubTab.tsx        "Pitcher Game" sub-tab. Derives an in-game PitcherGame summary
                                           (pitches, arsenal, strikes/balls, battersFaced, outs, by-inning pitch
                                           counts, first-pitch-strike rate) purely from allPlays, bounded to
                                           plays at or before the current at-bat index. Renders ArsenalBars +
                                           ZonePlot (h-190), a workload stat grid + by-inning strip (h-160), and
                                           an efficiency stat grid (h-120). Imported by LiveGameTab.
    LiveAtBat/LiveAtBat.tsx               The "At Bat" sub-tab (the default liveSubTab). Renders the full live
                                           at-bat view: back button + score + baserunner diamond + inning
                                           indicator, per-team linescore rows, batter-vs-pitcher matchup header,
                                           pace stats (count, pitch count, times through the order), a ZonePlot
                                           of the at-bat's pitches, last-pitch detail (velo, spin, break,
                                           extension, plate time), contact detail (exit velo, launch angle,
                                           distance, hardness, joined bat speed), and the play result banner.
                                           Imported by LiveGameTab.
    PitcherVsBatter/PitcherVsBatter.tsx   Exports PitcherVsBatter (the Pitcher-vs-Batter tab root). Owns
                                           `.tab-content`; renders the 200px `.pvb-cards-wrap` swipeable card
                                           strip (pitcher season, pitcher career, batter season, batter career),
                                           the 40px `.sub-tab-nav` (Matchup / Pitching / Batting), and the 479px
                                           `.pvb-panel`. Calls usePlayerStats(batterId, pitcherId) and
                                           fetchCareerStats independently for pitcher and batter career rows.
                                           Computes park-adjusted sabermetric cells for the swipe cards using
                                           utils/sabermetrics.ts and utils/leagueConstants.ts. Dispatches to
                                           MatchupSubTab, PitchingSubTab, or BattingSubTab based on
                                           gameStore.activeSubTab. Imported by App.tsx.
    PitcherVsBatter/MatchupSubTab.tsx     H2H career/series toggle (gameStore-independent local `scope` state:
                                           'career' | 'series'). Career mode calls fetchCareerVsPlayer once per
                                           batter/pitcher pair. Series mode calls fetchSeriesSchedule +
                                           fetchPlayByPlayBatch to find the current consecutive-games series and
                                           lists each shared at-bat (h-55 rows, max 7 shown via MAX_AT_BAT_ROWS)
                                           with a joined pitch-sequence strip. Imported by PitcherVsBatter.
    PitcherVsBatter/PitchingSubTab.tsx    Pitcher arsenal + hot/cold heatmap + situational splits (vs L / vs R /
                                           RISP) + recent-form aggregation (7/15/30-game spans from one cached
                                           season game log, so switching spans never refetches). Renders
                                           ArsenalBars and HeatMap. Imported by PitcherVsBatter.
    PitcherVsBatter/BattingSubTab.tsx     Batter hot/cold heatmap + spray chart + situational splits + recent
                                           form, same span/caching pattern as PitchingSubTab. Renders HeatMap and
                                           SprayChart. Imported by PitcherVsBatter.
    Canvas/ArsenalBars.tsx                ArsenalBars({ arsenal: PitchArsenalItem[], width = 280 }). Draws a
                                           horizontal bar per pitch type via 2D canvas, colored with
                                           getPitchColor. Renders a bare <canvas> with NO className and NO CSS
                                           height (only an inline width style) — see section 8 on why this
                                           requires a descendant CSS clamp. Imported by PitcherGameSubTab,
                                           PitchingSubTab.
    Canvas/HeatMap.tsx                    HeatMap({ zones: HotColdZone[], size = 150 }). Draws a 3x3 hot/cold
                                           grid on canvas, colored via the local TEMP_COLORS map (hot/cold/warm/
                                           lukewarm). Imported by PitchingSubTab, BattingSubTab.
    Canvas/SprayChart.tsx                 SprayChart({ data: SavantBattedBall[], width = 240, height = 200 }).
                                           Plots batted-ball landing spots from hc_x/hc_y, colored via the local
                                           EVENT_COLORS map. Imported by BattingSubTab.
    Canvas/ZonePlot.tsx                   ZonePlot({ zone?, size?, pitchType?, callCode?, pitches? }). Draws the
                                           strike zone with either a single pitch marker or every pitch in
                                           `pitches`, colored by call outcome (CALL_COLORS) or pitch type
                                           (PITCH_COLORS). Renders an internal legend once `size >=
                                           LEGEND_MIN_SIZE` (172). Imported by LiveAtBat, BatterGameSubTab,
                                           PitcherGameSubTab.

  App.css                                 The height-budget layout system: app shell, tab bar, sub-tab nav,
                                           panels, the `.h-*` utility classes, PvB card strip, canvas wrappers,
                                           dense data primitives (stat rows/grids/split tables), live at-bat
                                           layout, game-select layout, focus-visibility rules. See section 8.
  index.css                               Global reset, CSS custom-property tokens (palette, height budget,
                                           type scale, spacing), base typography, shared loading/error/empty
                                           state utilities. See section 8.

vercel.json                               Vercel deploy config: framework "vite", buildCommand "tsc -b && vite
                                           build", outputDirectory "dist", SPA rewrite of /(.*) to /index.html.
vite.config.ts                            Vite config: @vitejs/plugin-react, vite-plugin-pwa (autoUpdate,
                                           manifest with standalone display/portrait orientation, NetworkFirst
                                           runtime caching for statsapi.mlb.com (5 min TTL) and
                                           baseballsavant.mlb.com (10 min TTL)).
index.html                                Root HTML. Sets viewport-fit=cover and maximum-scale=1.0,
                                           user-scalable=no on the viewport meta tag (viewport-fit=cover is
                                           required for env(safe-area-inset-*) to resolve to a non-zero value).
```

## 3. Data Flow

```
MLB Stats API (statsapi.mlb.com)  ──┐
                                    ├─► src/api/mlb.ts fetchers ──┐
Baseball Savant (baseballsavant   ──┘                            │
  .mlb.com), CSV + gf JSON  ──► src/api/savant.ts fetchers ──────┼─► src/store/gameStore.ts (zustand)
                                                                  │        │
                                                                  │        ├─► src/hooks/useLiveFeed.ts
                                                                  │        │     (polls fetchDiffPatch every 4s,
                                                                  │        │      applies JSON-patch diffs)
                                                                  │        │
                                                                  │        └─► src/hooks/usePlayerStats.ts
                                                                  │              (fires 10 parallel fetches per
                                                                  │               batter/pitcher pair)
                                                                  │
                                                                  └─► components (LiveAtBat, BatterGameSubTab,
                                                                       PitcherGameSubTab, MatchupSubTab,
                                                                       PitchingSubTab, BattingSubTab,
                                                                       PitcherVsBatter, GameSelect)
                                                                            │
                                                                            └─► Canvas renderers (ArsenalBars,
                                                                                 HeatMap, SprayChart, ZonePlot)
```

- `App.tsx` is the only place that writes `selectedGame`/`gamePk` from a URL (`?gamePk=`) or from `GameSelect`'s picker, and the only place that populates `gameFeedPitches` from `fetchSavantGameFeed`.
- `useLiveFeed` is the only source of live-feed polling; it is invoked exactly once, inside `LiveGameTab`, so mounting/unmounting that tab starts/stops the 4s interval.
- `usePlayerStats` is called independently by `PitcherVsBatter`, `PitchingSubTab`, and `BattingSubTab` with the same `(batterId, pitcherId)` pair; each call refetches all 10 endpoints (no cross-component caching layer exists).
- Sabermetric derivations (FIP, ERA+, wRC+, ISO, K%, BB%, HR/9, GB%) happen in the consuming components (`PitcherVsBatter`, indirectly `PitchingSubTab`/`BattingSubTab`), not inside the store or the fetchers — raw stat objects are stored/passed as-is and computed on render.
- No data ever flows backward from components into the API layer; all fetchers are one-directional reads.

## 4. API Endpoints Reference

All MLB Stats API endpoints use `BASE = 'https://statsapi.mlb.com/api'` from `src/api/mlb.ts`.

| Endpoint | Params | Fetcher | Response shape (summary) |
|---|---|---|---|
| `GET /v1/schedule` | `sportId=1&date=<YYYY-MM-DD>&hydrate=probablePitcher,linescore,team` | `fetchSchedule(date)` | `ScheduleResponse.dates[].games[]` (flattened) → `ScheduledGame[]` |
| `GET /v1.1/game/{gamePk}/feed/live` | path param `gamePk` | `fetchLiveFeed(gamePk)` | `LiveFeed` (gameData, liveData.plays, metaData.timecode) |
| `GET /v1.1/game/{gamePk}/feed/live/diffPatch` | `startTimecode=<tc>` | `fetchDiffPatch(gamePk, startTimecode)` | `DiffPatchResponse` (`{ diff: [{path,value}], metaData }`) |
| `GET /v1/people/{personId}` | path param `personId` | `fetchPlayer(personId)` | `{ people: [PlayerInfo] }` (first element returned) |
| `GET /v1/people/{personId}/stats` | `stats=season&group=<hitting\|pitching>&season=<year>` | `fetchSeasonStats(personId, group, season, mode='season')` | `stats[0].splits[0].stat` → `SeasonStat \| PitcherSeasonStat` |
| `GET /v1/people/{personId}/stats` | `stats=career&group=<hitting\|pitching>` | `fetchCareerStats(personId, group)` / `fetchSeasonStats(..., mode='career')` | `stats[0].splits[0].stat` → `CareerBatterStat \| CareerPitcherStat` |
| `GET /v1/people/{personId}/stats` | `stats=pitchArsenal&group=pitching&season=<year>` | `fetchPitchArsenal(personId, season)` | `stats[0].splits[].stat`, with `percentage` multiplied by 100 → `PitchArsenalItem[]` |
| `GET /v1/people/{personId}/stats` | `stats=hotColdZones&group=<hitting\|pitching>&season=<year>` | `fetchHotColdZones(personId, group, season)` | Selects the split named `battingAverage` by name (falls back to `splits[0]`), never by index → `HotColdZone[]` |
| `GET /v1/people/{personId}/stats` | `stats=statSplits&group=<hitting\|pitching>&season=<year>&sitCodes=vl,vr,risp` (default sitCodes) | `fetchStatSplits(personId, group, season, sitCodes?)` | `stats[0].splits` → `StatSplit[]` |
| `GET /v1/people/{personId}/stats` | `stats=gameLog&group=<hitting\|pitching>&season=<year>` (group defaults to `hitting`) | `fetchGameLog(personId, season, group?)` | `stats[0].splits` → `GameLogEntry[]` |
| `GET /v1/people/{batterId}/stats` | `stats=vsPlayer&group=hitting&season=<year>&opposingPlayerId=<pitcherId>` | `fetchVsPlayer(batterId, pitcherId, season, mode='season')` | `stats[0].splits[0].stat`, normalized into `VsPlayerStat` |
| `GET /v1/people/{batterId}/stats` | `stats=vsPlayerTotal&group=hitting&opposingPlayerId=<pitcherId>`, falling back to `stats=vsPlayer&group=hitting&opposingPlayerId=<pitcherId>` | `fetchCareerVsPlayer(batterId, pitcherId)` | Same `VsPlayerStat` shape; tries `vsPlayerTotal` first, falls back to `vsPlayer` on error |
| `GET /v1/schedule` | `sportId=1&startDate=<-7d>&endDate=<+7d>` around the target game date | `fetchSeriesSchedule(gameDate, teamId, opponentId)` | Filters to games between the two teams, groups into consecutive-day runs, returns the run containing the target date as `{ gamePk, date }[]` |
| `GET /v1/game/{gamePk}/playByPlay` | path param `gamePk` (note: **v1**, not v1.1) | `fetchPlayByPlay(gamePk)` / `fetchPlayByPlayBatch(gamePks)` | `PlayByPlayResponse`; batch version chunks requests at most 5 concurrent (`chunk(arr, 5)`) |

Baseball Savant endpoints use `SAVANT_BASE = 'https://baseballsavant.mlb.com'` from `src/api/savant.ts`.

| Endpoint | Params | Fetcher | Response shape (summary) |
|---|---|---|---|
| `GET /gf` | `game_pk=<gamePk>` | `fetchSavantGameFeed(gamePk)` | JSON `{ home_batters, away_batters }`, each a `Record<string, SavantGamePitch[]>`; flattened and concatenated into `SavantGamePitch[]` |
| `GET /statcast_search/csv` | `all=true&type=details&hfSea=<season>%7C&player_type=<batter\|pitcher>&batters_lookup%5B%5D=<id>` (or `pitchers_lookup%5B%5D`) `&minPA=0`, plus `game_date_gt=<60-days-ago>` when `season` is the current year | `fetchSavantBattedBalls(playerId, season, playerType='batter')` | CSV text, parsed by `parseSavantCSV` into `SavantBattedBall[]` |

## 5. Component Hierarchy

```
main.tsx
  App.tsx
    (no selectedGame) GameSelect
    (selectedGame set)
      tab-bar (Live Game | Pitcher vs Batter buttons)
      activeTab === 'live'
        LiveGameTab
          sub-tab-nav (At Bat | Batter Game | Pitcher Game)
          liveSubTab === 'atBat'       -> LiveAtBat        -> ZonePlot
          liveSubTab === 'batterGame'  -> BatterGameSubTab  -> ZonePlot
          liveSubTab === 'pitcherGame' -> PitcherGameSubTab -> ArsenalBars, ZonePlot
      activeTab === 'pitcherVsBatter'
        PitcherVsBatter
          pvb-cards-wrap (pitcher season / pitcher career / batter season / batter career swipe cards)
          sub-tab-nav (Matchup | Pitching | Batting)
          activeSubTab === 'matchup'  -> MatchupSubTab
          activeSubTab === 'pitching' -> PitchingSubTab -> ArsenalBars, HeatMap
          activeSubTab === 'batting'  -> BattingSubTab  -> HeatMap, SprayChart
```

## 6. State Management

`src/store/gameStore.ts` exports a single zustand store, `useGameStore`, typed as `GameState`:

```ts
type Tab = 'live' | 'pitcherVsBatter'
type ActiveSubTab = 'matchup' | 'pitching' | 'batting'
type LiveSubTab = 'atBat' | 'batterGame' | 'pitcherGame'

interface GameState {
  selectedGame: ScheduledGame | null
  gamePk: number | null
  liveFeed: LiveFeed | null
  currentPlay: CurrentPlay | null
  lastTimecode: string | null
  isPolling: boolean
  activeTab: Tab
  activeSubTab: ActiveSubTab
  liveSubTab: LiveSubTab
  recentFormGames: number
  gameFeedPitches: SavantGamePitch[]
  error: string | null
  // actions listed below
}
```

Defaults: `activeTab: 'live'`, `activeSubTab: 'matchup'`, `liveSubTab: 'atBat'`, `recentFormGames: 7`, everything else `null`/`false`/`[]`.

Actions and when each is dispatched:

- `selectGame(game)` — called from `GameSelect`'s card `onClick` and from `App.tsx`'s `?gamePk=` deep-link handler (via `scheduledGameFromLiveFeed`). Sets `selectedGame`, `gamePk`, and resets `liveFeed`, `currentPlay`, `lastTimecode`, `gameFeedPitches`, `error` to their empty state.
- `setLiveFeed(feed)` — called by `useLiveFeed` after the initial `fetchLiveFeed` and after every `fetchDiffPatch` that produces a non-empty diff. Also derives `currentPlay` from `feed.liveData.plays.currentPlay` and `lastTimecode` from `feed.metaData.timecode` in the same update.
- `setCurrentPlay(play)` — declared for direct overrides; not currently dispatched outside `setLiveFeed`'s derivation.
- `setTimecode(tc)` — called by `useLiveFeed`'s poll loop whenever a diffPatch response carries a `metaData.timecode`.
- `setPolling(polling)` — called by `useLiveFeed` around its live-feed initialization (`true` at start, `false` in the `finally` block).
- `setActiveTab(tab)` — called by the tab-bar buttons in `App.tsx`.
- `setActiveSubTab(subTab)` — called by the sub-tab-nav buttons in `PitcherVsBatter`.
- `setLiveSubTab(subTab)` — called by the sub-tab-nav buttons in `LiveGameTab`.
- `setRecentFormGames(games)` — declared for the recent-form span toggle; `PitchingSubTab`/`BattingSubTab` currently keep their own local span state rather than dispatching this action (see section 11).
- `setGameFeedPitches(pitches)` — called by `App.tsx`'s Savant game-feed effect on every `gamePk` change (success sets the rows, failure sets `[]`).
- `setError(err)` — called by `App.tsx`'s deep-link handler and by `useLiveFeed` on any fetch/poll failure.
- `reset()` — called from the "← Games" back button in `LiveAtBat`. Clears `selectedGame`, `gamePk`, `liveFeed`, `currentPlay`, `lastTimecode`, `isPolling`, `gameFeedPitches`, `error`, returning the app to `GameSelect`.

## 7. Sabermetric Computations

All formulas live in `src/utils/sabermetrics.ts`. Every function returns `null` (rendered as `—`) if any required input is missing/NaN or if a denominator is zero — see `isValidStat`.

| Stat | Formula | Inputs | Function |
|---|---|---|---|
| FIP | `(13*HR + 3*(BB+HBP) - 2*K) / IP + 3.15` | `hr, bb, hbp, k, ip` | `computeFIP(hr, bb, hbp, k, ip)` |
| ERA+ | `100 * leagueERA / (era / effectiveParkFactor)`, where `effectiveParkFactor = (1 + parkFactor) / 2` | `era, leagueERA, parkFactor` | `computeERAplus(era, leagueERA, parkFactor)` |
| wRC+ | `((((woba - leagueWOBA) / wobaScale) + leagueRPerPA) / (effectiveParkFactor * leagueRPerPA)) * 100`, where `effectiveParkFactor = (1 + parkFactor) / 2` | `woba, leagueWOBA, wobaScale, leagueRPerPA, parkFactor` | `computeWRCplus(woba, leagueWOBA, wobaScale, leagueRPerPA, parkFactor)` |
| ISO | `slg - avg` | `avg, slg` | `computeISO(avg, slg)` |
| K% | `(k / pa) * 100` | `k, pa` | `computeKpct(k, pa)` |
| BB% | `(bb / pa) * 100` | `bb, pa` | `computeBBpct(bb, pa)` |
| HR/9 | `(hr / ip) * 9` | `hr, ip` | `computeHR9(hr, ip)` |
| GB% | `(groundBalls / totalBattedBalls) * 100` | `groundBalls, totalBattedBalls` | `computeGBpct(groundBalls, totalBattedBalls)` |

Supporting utilities in the same file:

- `parseStat(stat: string | number): number | null` — normalizes the MLB API's numeric-as-string fields; returns `null` for `''`, `'---'`, `'-.--'`, or `NaN`.
- `ipToDecimal(ip: string): number` — converts box-score innings-pitched notation (`"6.2"` = 6 innings + 2 outs) into a true decimal (`6 + 2/3 = 6.67`), rounded to 2 places.

`PARK_FACTORS` values in `leagueConstants.ts` are full-season park factors; both `computeERAplus` and `computeWRCplus` halve them internally via `(1 + parkFactor) / 2` before applying them.

## 8. Layout Constraints

Target device: iPhone 13 in PWA standalone mode, 390x844 CSS px. `index.html`'s viewport meta tag includes `viewport-fit=cover`, which is required for `env(safe-area-inset-*)` to resolve to a non-zero value; without it the entire height budget below collapses because the insets read as 0.

Vertical arithmetic (from `src/index.css`):

```
844 total (iPhone 13)
 -47 env(safe-area-inset-top)
 -34 env(safe-area-inset-bottom)
 = 763 usable
 -44 .tab-bar
 = 719 .tab-content            (--tab-content-h)
 -40 .sub-tab-nav
 = 679 --content-h             <- ALREADY excludes BOTH the tab bar and the sub-tab nav
```

Structural nesting contract (must not be violated):

```
.app            100dvh, overflow hidden, flex column, safe-area padding
  .tab-bar      44px
  .tab-content  719px (flex:1, min-height:0, overflow:hidden)
    .sub-tab-nav   40px   <- ALWAYS a SIBLING ABOVE the content box, never nested inside it
    .sub-tab-panel 679px  = var(--content-h)                     [Live Game tab]
  -- or, for the Pitcher-vs-Batter tab --
    .sub-tab-nav       40px
    .pvb-cards-wrap    200px
    .pvb-panel         479px  = var(--content-h) - 200px  (--pvb-content-h)
```

`--content-h` already subtracts both the 44px tab bar and the 40px sub-tab nav from the safe-area-adjusted viewport height. **Never write `calc(var(--content-h) - 40px)`** anywhere — that double-subtracts the sub-tab nav. `639` (679 - 40) must never appear as a height value in this codebase.

Allowed vertical px values (the `.h-*` utility classes in `App.css`), each `flex: 0 0 Npx; height: Npx; overflow: hidden`: `190 186 172 160 150 120 95 55 44 40 22 18`. Section-level components also reference the raw budget numbers `719 679 479 470 200`. Never invent a height outside this set; every section must justify its allotment against one of these tokens (see the inline budget comments in `BatterGameSubTab.tsx`, `PitcherGameSubTab.tsx`, `LiveAtBat.tsx`, and `MatchupSubTab.tsx`).

Canvas-specific clamp: `ArsenalBars` renders `<canvas style={{ width }}>` with no `className` and no CSS height, so its intrinsic canvas height (5 pitch types x 2 DPR scaling = up to 372px) becomes its rendered CSS height unless constrained. `App.css` fixes this with a required descendant selector, `.arsenal-canvas > canvas { max-height: 186px }`, since the wrapper's own `height`/`max-height` alone would only clip, not resize, the canvas.

Theme tokens (`src/index.css`, must match `vite.config.ts`'s PWA manifest `theme_color`/`background_color`):

- `--mlb-primary: #1b3a2f`
- `--mlb-bg: #0d1b12`
- `--mlb-accent: #2d5a3f`
- `--mlb-text: #e0e0e0`
- `--mlb-muted: #888888`

`GameSelect`'s `.game-group` is the only container in the entire app with `overflow-y: auto`; every other panel is `overflow: hidden` by design.

## 9. Maintenance Guide

**Updating league constants annually.** Edit `src/utils/leagueConstants.ts` before each new season: `LEAGUE_ERA`, `LEAGUE_WOBA`, `WOBA_SCALE`, `LEAGUE_R_PER_PA` (sourced from FanGraphs league stats) and the 30 `PARK_FACTORS` entries (sourced from ESPN park factors, full-season values — the sabermetrics functions halve them internally, do not pre-halve them here).

**Adding a new stat.** 1) Add the field to the relevant interface in `src/api/types.ts` if the API response includes it but the type doesn't yet declare it. 2) If it needs a fetcher, add it to `src/api/mlb.ts` or `src/api/savant.ts` following the existing `fetch...` pattern (throw on `!res.ok`, return the parsed/narrowed shape). 3) If it needs computation, add a pure function to `src/utils/sabermetrics.ts` following the `isValidStat`/`roundStat` null-safety pattern used by the existing `compute*` functions. 4) Wire it into the consuming component's stat-cell array (e.g. `pitcherSeasonStats` in `PitcherVsBatter.tsx`, or the `StatCell` lists in `LiveAtBat.tsx`/`PitcherGameSubTab.tsx`).

**Adding a new canvas component.** Follow the pattern in `src/components/Canvas/*.tsx`: a `useRef<HTMLCanvasElement>` plus a `useEffect` that gets the 2D context, scales for `window.devicePixelRatio`, and draws. Accept a `size`/`width`/`height` prop with a default. If the component does not set an explicit CSS height on its `<canvas>` (as `ArsenalBars` does not), add a descendant clamp in `App.css` under section 5 ("CANVAS WRAPPERS") following the `.arsenal-canvas > canvas` pattern, or the canvas will render at its raw pixel height and blow the layout budget.

**Adding a new sub-tab.** Add the id to the relevant union type in `gameStore.ts` (`LiveSubTab` or the `ActiveSubTab`/`SubTab` type used by `PitcherVsBatter.tsx`/`LiveGameTab.tsx`), add a descriptor to that file's `SUB_TABS` array, add a `case` to its `renderSubTab` switch, and add a new component file under the matching `src/components/<Tab>/` directory. Budget the new component's sections against the surrounding panel's fixed height (`679` for Live Game sub-tabs, `--pvb-content-h` / `479` for Pitcher-vs-Batter sub-tabs) using only the sanctioned `.h-*` values from section 8.

## 10. Build & Deploy

Scripts (`package.json`):

- `npm run dev` — `vite` dev server.
- `npm run build` — `tsc -b && vite build`. Type-checks via project references (`tsconfig.json` → `tsconfig.app.json`, `tsconfig.node.json`), then builds with Vite.
- `npm run lint` — `oxlint`.
- `npm run preview` — `vite preview`, serves the built `dist/`.

There is no test framework in this project and none may be added; verification is `npx tsc -b` (judge by empty stdout — it can misleadingly report exit 0 when piped through another command), `npm run build`, `npm run lint`, and manual Playwright QA at the 390x844 viewport. Zero new npm dependencies is a hard project constraint.

Deterministic QA entry point: `http://localhost:5173/?gamePk=746352` — a completed 2024 game whose Savant `gf` feed is still served, useful when no live game exists.

Deployment is Vercel, configured entirely by `vercel.json`: `framework: "vite"`, `buildCommand: "tsc -b && vite build"`, `outputDirectory: "dist"`, and a catch-all SPA rewrite of `/(.*)` to `/index.html` (required since there is no client-side router — the app is a single route with `?gamePk=` as its only query-string input).

PWA behavior is configured in `vite.config.ts` via `vite-plugin-pwa`: `registerType: 'autoUpdate'`, manifest with `display: 'standalone'` and `orientation: 'portrait'`, and Workbox `NetworkFirst` runtime caching for `statsapi.mlb.com` (50 entries, 300s TTL) and `baseballsavant.mlb.com` (20 entries, 600s TTL).

## 11. Known Limitations

1. **Savant CSV has a UTF-8 BOM and every header is quoted.** `parseSavantCSV` strips `\uFEFF` first, then parses the header with the quote-aware `parseCSVLine`. A naive `.split(',')` would yield keys like `"pitch_type"` and silently garble every field.
2. **`fetchSavantBattedBalls` uses `batters_lookup[]` / `pitchers_lookup[]`, never `player_id`.** Savant ignores `player_id` on `statcast_search` and returns the entire league (~25,000 rows) instead of one player.
3. **The `statcast_search` CSV lags roughly a day** and returns zero rows for today's game. In-game bat speed therefore comes from the Savant **game feed** (`GET /gf?game_pk=N`, camelCase `batSpeed`), stored in `gameStore.gameFeedPitches`, never from the CSV endpoint.
4. **Savant-to-live-feed join key is `play_id` alone** (`savantRow.play_id === playEvent.playId`, read defensively via `playIdOf` since `PlayEvent` doesn't declare `playId`). Joining on `at_bat_number` additionally would mismatch every row by one at-bat, because the live feed's `about.atBatIndex` is 0-based while Savant's `ab_number` is 1-based.
5. **`swing_path_tilt` is absent from the game feed** (it's CSV-only and day-lagged), so the Live tab renders `—` for it by design — not a bug.
6. **Balls in play are neither `isStrike` nor `isBall`.** `PitcherGameSubTab.countsAsStrike` explicitly folds in `details.isInPlay`; omitting it undercounts strike rate substantially (documented empirically at ~46% vs. a true ~63% on one sampled game, gamePk 746352).
7. **`fetchHotColdZones` splits arrive in a fixed but undocumented order, and `value` is a string.** The fetcher selects by `stat?.name === 'battingAverage'` (falling back to `splits[0]`), never by index.
8. **`fetchPitchArsenal` percentages are multiplied by 100** inside the fetcher (raw API values are fractional); `ArsenalBars`/`buildArsenal` expect a 0-100 scale.
9. **MLB API field casing is inconsistent.** Pitchers return `strikeOuts` (capital O) and `avg` (which for pitchers is opponent batting average) — there is no `strikeouts` or `oppAvg` field.
10. **Career ERA+ and career wRC+ are structurally uncomputable** and render `—` by design: there is no park-adjusted career ERA endpoint, and the Savant CSV (needed for career wOBA) is single-season only. **Career FIP IS computable**, because the career pitching endpoint does return `hitBatsmen` and `homeRuns`.
11. **`babip_denom` is not present in the Savant CSV.** BABIP comes from the MLB Stats API's `SeasonStat.babip` field, parsed with `parseStat()`.
12. **The play-by-play endpoint is `/v1/game/{gamePk}/playByPlay` — v1, not v1.1.** `fetchPlayByPlayBatch` caps concurrency at 5 requests via `chunk(gamePks, 5)`.
13. **ERA+/wRC+ park factor uses the current game's home park** (`PARK_FACTORS[selectedGame.teams.home.team.abbreviation] ?? 1.00`) as an approximation of the player's own home park; it is not looked up per-player.
14. **`env(safe-area-inset-*)` resolves to 0 in headless Chrome.** QA there will measure `--content-h` as 760px and `.pvb-panel` as 560px rather than the real-device 679px/479px. The layout arithmetic still holds — these larger numbers are not a layout violation, just a headless-browser artifact.
15. **`usePlayerStats` is called independently by three components** (`PitcherVsBatter`, `PitchingSubTab`, `BattingSubTab`) with no shared cache, so switching between the Pitcher vs Batter tab's card strip and its sub-tabs triggers redundant network requests for the same batter/pitcher pair.
16. **`gameStore.setRecentFormGames`/`recentFormGames` are declared on the store but the recent-form span toggle in `PitchingSubTab`/`BattingSubTab` currently keeps its own local component state instead of dispatching this action** — the store field exists but is effectively unused for that purpose today.
17. **No test framework, no client-side router, and no backend exist in this project**, by design; do not introduce any of the three without updating this document and `vercel.json`'s SPA rewrite assumption.
