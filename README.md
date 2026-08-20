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
                                            gameStore.selectGame on click. Its `.game-select` container is this
                                            screen's single scroll owner (see section 8). Imported by App.tsx.
     LiveGame/LiveGameTab.tsx              Live Game tab wrapper. Exports LiveGameTab. Owns the `.tab-content`
                                            flex root directly under the 48px `.tab-bar`; renders the 44px
                                            `.sub-tab-nav` (At Bat / Batter Game / Pitcher Game) as a sibling above
                                            `.sub-tab-panel`, which is the scroll owner and takes whatever height
                                            is left over (no fixed budget -- see section 8). Calls useLiveFeed() for
                                           its polling side effect. Dispatches to LiveAtBat, BatterGameSubTab, or
                                           PitcherGameSubTab based on gameStore.liveSubTab. Imported by App.tsx.
    LiveGame/BatterGameSubTab.tsx         "Batter Game" sub-tab. Derives everything from
                                           liveFeed.liveData.plays.allPlays and gameStore.gameFeedPitches already
                                           in the store; issues no network requests itself. Renders a pitch-type
                                            tally + ZonePlot, a per-plate-appearance game log, and a batted-ball
                                            list with joined bat speed. Declares no heights. Imported by
                                           LiveGameTab.
    LiveGame/PitcherGameSubTab.tsx        "Pitcher Game" sub-tab. Derives an in-game PitcherGame summary
                                           (pitches, arsenal, strikes/balls, battersFaced, outs, by-inning pitch
                                           counts, first-pitch-strike rate) purely from allPlays, bounded to
                                           plays at or before the current at-bat index. Renders ArsenalBars +
                                            ZonePlot, a workload stat grid + by-inning strip, and an efficiency
                                            stat grid. Declares no heights. Imported by LiveGameTab.
    LiveAtBat/LiveAtBat.tsx               The "At Bat" sub-tab (the default liveSubTab). Renders the full live
                                           at-bat view: back button + score + baserunner diamond + inning
                                           indicator, per-team linescore rows, batter-vs-pitcher matchup header,
                                           pace stats (count, pitch count, times through the order), a ZonePlot
                                           of the at-bat's pitches, last-pitch detail (velo, spin, break,
                                           extension, plate time), contact detail (exit velo, launch angle,
                                           distance, hardness, joined bat speed), and the play result banner.
                                           Imported by LiveGameTab.
    PitcherVsBatter/PitcherVsBatter.tsx   Exports PitcherVsBatter (the Pitcher-vs-Batter tab root). Owns
                                            `.tab-content`; renders the `.pvb-cards-wrap` card strip (pitcher
                                            season, pitcher career, batter season, batter career -- horizontally
                                            swipeable below 1024px, a two-column grid at or above it), the 44px
                                            `.sub-tab-nav` (Matchup / Pitching / Batting), and `.pvb-panel`, which
                                            is the scroll owner. Calls usePlayerStats(batterId, pitcherId) and
                                           fetchCareerStats independently for pitcher and batter career rows.
                                           Computes park-adjusted sabermetric cells for the swipe cards using
                                           utils/sabermetrics.ts and utils/leagueConstants.ts. Dispatches to
                                           MatchupSubTab, PitchingSubTab, or BattingSubTab based on
                                           gameStore.activeSubTab. Imported by App.tsx.
    PitcherVsBatter/MatchupSubTab.tsx     H2H career/series toggle (gameStore-independent local `scope` state:
                                           'career' | 'series'). Career mode calls fetchCareerVsPlayer once per
                                           batter/pitcher pair. Series mode calls fetchSeriesSchedule +
                                           fetchPlayByPlayBatch to find the current consecutive-games series and
                                            lists every shared at-bat with a joined pitch-sequence strip (no row
                                            cap -- the panel scrolls). Imported by PitcherVsBatter.
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

Target device: iPhone 13 in PWA standalone mode, 390x844 CSS px. `index.html`'s viewport meta tag includes `viewport-fit=cover`, which is required for `env(safe-area-inset-*)` to resolve to a non-zero value.

**There are no fixed vertical budgets.** An earlier revision divided the viewport into hardcoded pixel allotments (`--content-h`, `--tab-content-h`, `--pvb-content-h`, and a sanctioned `.h-*` utility ladder). That system is gone — every one of those tokens, classes, and raw budget numbers has been deleted, and `scripts/design-checks.mjs` fails if the names reappear. Layout is now flexbox plus one scroll owner per screen.

Shell contract:

```
html, body, #root    height:100%, overflow:hidden                  index.css
  .app               100dvh, flex column, overflow:hidden,
                     padding = all four safe-area insets           App.css
    .tab-bar         var(--tab-bar-h) = 48px   <- fixed chrome     ui.css
    .tab-content     flex:1, min-height:0, overflow:hidden         App.css
      .sub-tab-nav   var(--sub-tab-h) = 44px   <- fixed chrome     ui.css
                     ALWAYS a SIBLING ABOVE the panel, never inside it
      .sub-tab-panel flex:1 1 auto, min-height:0,
      / .pvb-panel   overflow-y:auto           <- THE scroll owner App.css
```

The panel's height is never computed. It claims the remainder with `flex: 1 1 auto; min-height: 0; overflow-y: auto`, so changing either bar height re-flows the layout with no arithmetic to re-derive. `min-height: 0` on every flex ancestor of a scroll owner is a hard requirement — without it the box refuses to shrink and clips instead of scrolling.

**Exactly one vertical scroll owner per screen.** On the Live Game and Pitcher-vs-Batter tabs that is `.sub-tab-panel` / `.pvb-panel`; on the GameSelect screen — which has no sub-tab nav — it is `.game-select`. Everything above them is `overflow: hidden`. The only other scrollable box is `.pvb-cards`, which scrolls **horizontally** (`overflow-x: auto` with scroll-snap) below 1024px and becomes a static two-column grid above it. Every remaining `overflow: hidden` in the codebase is a text-truncation or clipping wrapper, not a layout container.

Breakpoints are literal `min-width` px values — there is no `--bp-*` custom property, and no `max-width` query exists anywhere:

| Breakpoint | What changes |
|---|---|
| `480px` | Stat grids go 3-up (`.stat-grid`, `.tendencies-grid`, `.season-lines`), `.stat-grid-3` goes 4-up; `.matchup__grid`/`.atbat__grid` gaps and linescore type scale up |
| `768px` | Content capped at **720px** and centered via `padding-inline: max(var(--sp-4), calc((100% - 720px) / 2))` on `.sub-tab-panel`, `.pvb-panel`, and `.game-select`; canvas wrappers gain block padding |
| `1024px` | Same mechanism capped at **960px**; `.pvb-cards` becomes a two-column grid with `overflow-x: visible` and scroll-snap disabled |

Centering uses `padding-inline`, not `max-width`, so the scroll owner keeps its full-bleed scrollbar gutter while its content stays within the cap.

**Known divergence from DESIGN.md §6.4.** The spec calls for a three-up game grid at `--bp-lg`. It is deliberately not implemented: three tracks of the §6.5 320px card floor plus two gaps need 976px, exceeding the 960px content cap by 16px. `repeat(3, ...)` was tried and produced 314.7px cards that ellipsis-truncated venue and pitcher names. The grid stays two-up — see the comment in `App.css` and DESIGN.md's change protocol before revisiting.

Surviving hardcoded heights. This is the complete list; additions need justification:

- `--tab-bar-h: 48px` and `--sub-tab-h: 44px` (`src/index.css`), applied by `.ui-tab-bar` / `.ui-sub-tab-nav`. Fixed chrome is the only thing permitted to declare `height`, and it lives in `ui.css`.
- `.arsenal-canvas > canvas { max-height: 186px }` — the canvas clamp described below.
- `.a11y-only { width: 1px; height: 1px }` and the 1px `.matchup-head__vs` hairline pseudo-elements.
- `Skeleton height="44px" / "32px"` placeholders in `GameSelect.tsx`, and `SprayChart`'s `height = 200` default (passed explicitly as `height={200}` from `BattingPanels.tsx`).

Canvas sizing. All four canvases (`ArsenalBars`, `HeatMap`, `SprayChart`, `ZonePlot`) size their own backing store in JS from `window.devicePixelRatio` and set matching CSS pixel dimensions inline. There is no `ResizeObserver` in the codebase — a canvas keeps its intrinsic size inside a `width: 100%` centered slot rather than reacting to it. Call sites: `ZonePlot size={172}` in both live sub-tabs (`LEGEND_MIN_SIZE = 172` gates whether the legend draws), `HeatMap size={150}` in `PvbPanels`, `SprayChart 264x200` in `BattingPanels`. `ArsenalBars` is the exception: it computes its height from the number of pitch types and returns `<canvas style={{ width }}>` with **no** CSS height, so a tall arsenal would render at its raw pixel height. `App.css` constrains it with the descendant selector `.arsenal-canvas > canvas { max-height: 186px }` — the wrapper's own `height`/`max-height` would only clip, not resize, the canvas.

Theme tokens. `src/index.css` declares a white-first system: `--c-bg`, `--c-surface-*`, `--c-border*`, `--c-ink*`, `--c-brand-*`, semantic `--c-live`/`--c-positive`/`--c-negative`/`--c-warn`/`--c-neutral-badge`, chart `--c-heat-*`/`--c-chart-*`, 14 `--c-pitch-*` identity colors and 4 `--c-call-*` markers, plus `--sp-1..8`, `--radius-sm|base|lg|pill`, and `--font-ui`/`--font-num`. Note the spacing scale is `--sp-*`, not `--space-*`. The old dark-green `--mlb-primary`/`--mlb-bg`/`--mlb-accent`/`--mlb-text`/`--mlb-muted` tokens no longer exist.

Three files must move together, and the `theme-lockstep` guard enforces it: `--c-brand-900` (`#041e42`) must equal `index.html`'s `<meta name="theme-color">` and `vite.config.ts`'s manifest `theme_color`; `--c-bg` (`#ffffff`) must equal the manifest `background_color`.

Design guard: `npm run check:design` (`scripts/design-checks.mjs`) runs four checks and exits non-zero on any failure.

| Check | What it actually enforces |
|---|---|
| `no-canvas-hex` | No hex literal may appear in the four `src/components/Canvas/*.tsx` files or `src/utils/pitchConstants.ts`. Canvas colors must be read from tokens. |
| `theme-lockstep` | The token ↔ `theme-color` ↔ manifest agreement above. Fails on a missing value as well as a mismatch. |
| `no-fixed-budgets` | Scans every `.ts`/`.tsx`/`.css` under `src` for the deleted names `h-190 h-172 h-160 h-120 h-55 h-44 h-40 h-22 h-18` and `--pvb-content-h`. The pattern does **not** cover `h-186`, `h-150`, or `h-95`. |
| `tabular-nums` | Asserts only that the literal string `tabular-nums` appears in `src/index.css`; it does not verify that every numeric readout uses it. |

The guard is deliberately **not** wired into `npm run build`: Vercel runs `tsc -b && vite build` directly via `vercel.json`'s `buildCommand` and would bypass an npm-script gate, making the enforcement illusory. Run it manually alongside `tsc -b` and `lint`.

## 9. Maintenance Guide

**Updating league constants annually.** Edit `src/utils/leagueConstants.ts` before each new season: `LEAGUE_ERA`, `LEAGUE_WOBA`, `WOBA_SCALE`, `LEAGUE_R_PER_PA` (sourced from FanGraphs league stats) and the 30 `PARK_FACTORS` entries (sourced from ESPN park factors, full-season values — the sabermetrics functions halve them internally, do not pre-halve them here).

**Adding a new stat.** 1) Add the field to the relevant interface in `src/api/types.ts` if the API response includes it but the type doesn't yet declare it. 2) If it needs a fetcher, add it to `src/api/mlb.ts` or `src/api/savant.ts` following the existing `fetch...` pattern (throw on `!res.ok`, return the parsed/narrowed shape). 3) If it needs computation, add a pure function to `src/utils/sabermetrics.ts` following the `isValidStat`/`roundStat` null-safety pattern used by the existing `compute*` functions. 4) Wire it into the consuming component's stat-cell array (e.g. `pitcherSeasonStats` in `PitcherVsBatter.tsx`, or the `StatCell` lists in `LiveAtBat.tsx`/`PitcherGameSubTab.tsx`).

**Adding a new canvas component.** Follow the pattern in `src/components/Canvas/*.tsx`: a `useRef<HTMLCanvasElement>` plus a `useEffect` that gets the 2D context, scales for `window.devicePixelRatio`, and draws. Accept a `size`/`width`/`height` prop with a default. If the component does not set an explicit CSS height on its `<canvas>` (as `ArsenalBars` does not), add a descendant clamp in `App.css` following the `.arsenal-canvas > canvas { max-height: 186px }` pattern, or the canvas will render at its raw pixel height. Read colors from the chart theme, never as hex literals — the `no-canvas-hex` guard scans `src/components/Canvas/*.tsx`.

**Adding a new sub-tab.** Add the id to the relevant union type in `gameStore.ts` (`LiveSubTab` or the `ActiveSubTab`/`SubTab` type used by `PitcherVsBatter.tsx`/`LiveGameTab.tsx`), add a descriptor to that file's `SUB_TABS` array, add a `case` to its `renderSubTab` switch, and add a new component file under the matching `src/components/<Tab>/` directory. Do not give the new component a height — the surrounding panel is the scroll owner and content sizes to content (see section 8). Run `npm run check:design` afterwards.

## 10. Build & Deploy

Scripts (`package.json`):

- `npm run dev` — `vite` dev server.
- `npm run build` — `tsc -b && vite build`. Type-checks via project references (`tsconfig.json` → `tsconfig.app.json`, `tsconfig.node.json`), then builds with Vite.
- `npm run lint` — `oxlint`.
- `npm run check:design` — `node scripts/design-checks.mjs`, the four layout/theme guards described in section 8. Not wired into `build` on purpose (see section 8).
- `npm run preview` — `vite preview`, serves the built `dist/`.

There is no test framework in this project and none may be added; verification is `npx tsc -b` (judge by empty stdout — it can misleadingly report exit 0 when piped through another command), `npm run build`, `npm run lint`, `npm run check:design`, and manual Playwright QA at the 390x844 viewport. Zero new npm dependencies is a hard project constraint.

Deterministic QA entry point: `http://localhost:5173/?gamePk=746352` — a completed 2024 game whose Savant `gf` feed is still served, useful when no live game exists.

Deployment is Vercel, configured entirely by `vercel.json`: `framework: "vite"`, `buildCommand: "tsc -b && vite build"`, `outputDirectory: "dist"`, and a catch-all SPA rewrite of `/(.*)` to `/index.html` (required since there is no client-side router — the app is a single route with `?gamePk=` as its only query-string input).

PWA behavior is configured in `vite.config.ts` via `vite-plugin-pwa`: `registerType: 'autoUpdate'`, manifest with `display: 'standalone'` and `orientation: 'portrait'`, and Workbox `NetworkFirst` runtime caching for `statsapi.mlb.com` (50 entries, 300s TTL) and `baseballsavant.mlb.com` (20 entries, 600s TTL).

## 11. Known Limitations

1. **Savant CSV has a UTF-8 BOM and every header is quoted.** `parseSavantCSV` strips `\uFEFF` first, then parses the header with the quote-aware `parseCSVLine`. A naive `.split(',')` would yield keys like `"pitch_type"` and silently garble every field.
2. **`fetchSavantBattedBalls` uses `batters_lookup[]` / `pitchers_lookup[]`, never `player_id`.** Savant ignores `player_id` on `statcast_search` and returns the entire league (~25,000 rows) instead of one player.
3. **The `statcast_search` CSV lags roughly a day** and returns zero rows for today's game. In-game bat speed therefore comes from the Savant **game feed** (`GET /gf?game_pk=N`, camelCase `batSpeed`), stored in `gameStore.gameFeedPitches`, never from the CSV endpoint.
4. **Savant-to-live-feed join key is `play_id` alone** (`savantRow.play_id === playEvent.playId`, read defensively via `playIdOf` since `PlayEvent` doesn't declare `playId`). Joining on `at_bat_number` additionally would mismatch every row by one at-bat, because the live feed's `about.atBatIndex` is 0-based while Savant's `ab_number` is 1-based.
5. **`swing_path_tilt` is absent from the game feed** (it's CSV-only and day-lagged), so the Live tab renders `—` for it by design — not a bug.
6. **Balls in play are neither `isStrike` nor `isBall`.** Pitch classification lives in `GameSubTabShared.outcomeOf`, shared by both live sub-tabs: it tests `details.isInPlay` **first** and returns `'inplay'` before any ball/strike check, and `splitPitches` then counts every non-`ball` outcome as a strike, balls in play included. Omitting the in-play case undercounts strike rate substantially (measured at ~46% vs. a true ~63% on gamePk 746352 before this was centralized). Two related deliberate choices in the same module: fouls are classified **by elimination** — anything that is not in play, a ball, a called strike, or a member of the `MISS_CALLS` set — so no Gameday call code has to be guessed; and `inStrikeZone` returns `null` when `pitchData.zone` is absent, so those pitches are excluded from the zone/chase denominators entirely rather than counted as out-of-zone.
7. **`fetchHotColdZones` splits arrive in a fixed but undocumented order, and `value` is a string.** The fetcher selects by `stat?.name === 'battingAverage'` (falling back to `splits[0]`), never by index.
8. **`fetchPitchArsenal` percentages are multiplied by 100** inside the fetcher (raw API values are fractional), so `ArsenalBars` consumes a 0-100 scale. Do not confuse this with `PitcherGameModel.buildArsenal`, which is unrelated: it derives an *in-game* pitch mix from live `PlayEvent`s grouped by `details.type.code` and emits its own `share` rate.
9. **MLB API field casing is inconsistent.** Pitchers return `strikeOuts` (capital O) and `avg` (which for pitchers is opponent batting average) — there is no `strikeouts` or `oppAvg` field.
10. **Career ERA+ and career wRC+ are structurally uncomputable** and render `—` by design: there is no park-adjusted career ERA endpoint, and the Savant CSV (needed for career wOBA) is single-season only. **Career FIP IS computable**, because the career pitching endpoint does return `hitBatsmen` and `homeRuns`.
11. **`babip_denom` is not present in the Savant CSV.** BABIP comes from the MLB Stats API's `SeasonStat.babip` field, parsed with `parseStat()`.
12. **The play-by-play endpoint is `/v1/game/{gamePk}/playByPlay` — v1, not v1.1.** `fetchPlayByPlayBatch` caps concurrency at 5 requests via `chunk(gamePks, 5)`.
13. **ERA+/wRC+ park factor uses the current game's home park** (`PARK_FACTORS[selectedGame.teams.home.team.abbreviation] ?? 1.00`) as an approximation of the player's own home park; it is not looked up per-player.
14. **`env(safe-area-inset-*)` resolves to 0 in headless Chrome**, so QA there renders a marginally taller `.app` than a real iPhone does. Because the layout is flex-based with no fixed budgets (section 8), this only changes how much of the panel is visible before scrolling begins — it is a headless-browser artifact, not a layout violation.
15. **`usePlayerStats` is called independently by four components** (`PitcherVsBatter`, `MatchupSubTab`, `PitchingSubTab`, `BattingSubTab`) with no shared cache. It is a plain `useState`/`useEffect` firing a ten-way `Promise.all`, each request individually `.catch()`-defaulted, so switching between the Pitcher vs Batter card strip and its sub-tabs re-requests the same batter/pitcher pair from scratch.
16. **The recent-form span is global, not per-tab.** `recentFormGames` is a single `gameStore` field (default `7`) and both `PitchingSubTab` and `BattingSubTab` dispatch `setRecentFormGames` against it, so changing the span in one sub-tab silently changes it in the other.
17. **No test framework, no client-side router, and no backend exist in this project**, by design; do not introduce any of the three without updating this document and `vercel.json`'s SPA rewrite assumption.
