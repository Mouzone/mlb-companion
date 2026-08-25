# MLB Companion

## 1. Project Overview

MLB Companion is a mobile-first live MLB game-watching companion PWA. It is built with React 19, TypeScript, Vite 8, and zustand 5, and deploys to Vercel as a static SPA. The app targets a single viewport, iPhone 13 (390x844) in standalone PWA mode, with one screen-level scroll owner at a time. It has two top-level tabs (Live Game, Pitcher vs Batter), each with three sub-tabs, and a global searchable Stats Guide that explains every displayed metric and formula. It pulls data from the public MLB Stats API and Baseball Savant. There is no backend, no router, and no test framework; the store is the only state layer.

## 2. Architecture Map

```
src/
  main.tsx                                React root. Renders <App /> inside <ErrorBoundary> inside <StrictMode>,
                                           imports index.css.
  components/ErrorBoundary.tsx            Class component; the only one in the codebase, since only a class can
                                           implement getDerivedStateFromError. Without it a render throw in an
                                           installed PWA is a permanent white screen — the cached bundle throws
                                           again on every launch. Offers a reset that deletes every Cache Storage
                                           bucket and clears sessionStorage before reloading, which recovers the
                                           stale-payload-plus-new-code case.
  App.tsx                                 Shell component. Exports default App. Decides GameSelect vs the 2-tab
                                           layout based on gameStore.selectedGame; handles the ?gamePk=<id> deep
                                           link (fetches live feed directly, bypassing GameSelect); fetches the
                                           Savant game feed into gameStore.gameFeedPitches whenever gamePk changes.
                                           Calls useLiveFeed() (the single call site) so live polling is tied to
                                           the selected game rather than to the Live tab being mounted. Warms
                                            every stat cache as soon as a matchup is known —
                                            fetchActiveBenchmarkCohorts on gamePk, then preloadPlayerStats
                                            and fetchCachedGameLog once currentPlay.matchup resolves — so that
                                            any section opens without a loading pass. Every preload is idempotent
                                            (module-cache guarded) and swallows its own rejection; the hooks
                                            surface real failures when the section actually mounts.
                                            Renders a FloatingGamesButton (fixed bottom-left, wired to
                                            gameStore.reset) so the user can return to GameSelect from any game
                                            screen. Imports gameStore, GameSelect, GameScreen, FloatingGamesButton,
                                            api/mlb, api/savant, App.css. Mounts StatsGuide on both app branches.

  api/
    types.ts                              All shared TypeScript interfaces (439 lines): Team, ScheduledGame,
                                           ScheduleResponse, PlayerInfo, PitchArsenalItem, HotColdZone, StatSplit,
                                           GameLogEntry, VsPlayerStat, SeasonStat, PitcherSeasonStat, PlayEvent,
                                           CurrentPlay, LiveFeed, DiffPatchResponse, SavantBattedBall,
                                           SavantGamePitch, InGameH2HAtBat,
                                           SeriesH2HGame, H2HAggregate, PlayByPlayResponse. Imported by every
                                           fetcher, hook, and component that touches API data.
    mlb.ts                                MLB Stats API client. BASE = 'https://statsapi.mlb.com/api'. Exports
                                           fetchSchedule, fetchLiveFeed, fetchDiffPatch, fetchPlayer,
                                           fetchSeasonStats, fetchPitchArsenal, fetchHotColdZones,
                                           fetchStatSplits, fetchGameLog, fetchVsPlayer,
                                           fetchSeriesSchedule, fetchPlayByPlay, chunk, fetchPlayByPlayBatch.
                                            Imported by App.tsx, useLiveFeed, usePlayerStats, GameScreen,
                                           MatchupSubTab, LogsSubTab, GameSelect.
    savant.ts                             Baseball Savant client. SAVANT_BASE = 'https://baseballsavant.mlb.com'.
                                           Exports fetchSavantGameFeed (GET /gf?game_pk=N) and
                                           fetchSavantBattedBalls (GET /statcast_search/csv?...), plus internal
                                           parseSavantCSV and parseCSVLine. Imported by App.tsx and usePlayerStats.
    benchmarks.ts                         League-wide percentile-benchmark cohort fetcher. Exports
                                           fetchActiveBenchmarkCohorts(scope: BenchmarkScope, season:
                                           string), which batches ~200 players per call into batters,
                                           starters, and relievers cohorts. Also exports types
                                           BenchmarkScope ('season'), PitcherRole, BenchmarkPlayerStat<T>,
                                           SeasonBenchmarkCohorts, and ActiveBenchmarkCohorts.
                                           Imported by App.tsx
                                           (preload) and useStatBenchmarks.
    playerStatsCache.ts                   Module-level promise cache for game-log fetches. Exports
                                           fetchCachedGameLog(personId, season, group), keyed on
                                           person/season/group. A failed
                                           promise is evicted from the cache so a transient error is not
                                           sticky for the session. Imported by App.tsx, MatchupSubTab,
                                           LogsSubTab.

  store/
    gameStore.ts                          Single zustand store (useGameStore). See section 6 for full shape.
                                           Imported by every component and hook that reads or writes app state.

  hooks/
    useLiveFeed.ts                        useLiveFeed(): fetches the initial live feed on gamePk change, then
                                           polls fetchDiffPatch every 4000ms (POLL_INTERVAL) and applies the diff
                                           via applyDiff while
                                           gameData.status.abstractGameState === 'Live'. If the game is still in
                                           Preview at init, a 30s preview-poll (PREVIEW_POLL_INTERVAL) re-fetches
                                           the full feed until the game goes Live, at which point it switches to
                                           the 4s diffPatch interval. This fixes the Preview→Live transition bug
                                           where polling never started if a game was selected before first pitch.
                                           The cursor is
                                           metaData.timeStamp (NOT metaData.timecode — that field does not exist
                                           on the MLB response; assuming it silently disabled polling entirely).
                                           diffPatch returns an ARRAY of { diff: RFC 6902 operations } patch sets,
                                           each op carrying op/path/value/from; when nothing changed since
                                           startTimecode it returns the full feed object instead, which is
                                           detected and stored directly. applyDiff clones every node along a
                                           mutated path so Zustand's Object.is subscribers actually re-render; a
                                           path that does not resolve is skipped rather than throwing. Polls are
                                           skipped while document.hidden and catch up from the same timestamp on
                                           the next visible tick. Skips the initial fetch
                                           when the store already holds a feed for this gamePk (deep-link path).
                                           Returns { isPolling }. Called exactly once, from App, so the feed
                                           survives tab switches instead of refetching.
    usePlayerStats.ts                     usePlayerStats(batterId: number | null, pitcherId: number | null):
                                           PlayerStatsData. Takes exactly these TWO arguments; derives the
                                           current season internally via `new Date().getFullYear().toString()`
                                           (module-level `currentYear` constant, not recomputed per render).
                                           Fires the same 10 endpoints, but split across THREE independently
                                           cached bundles so a mid-inning player swap only refetches the half
                                           that changed: a pitcher bundle (fetchSeasonStats, fetchPitchArsenal,
                                           fetchHotColdZones, fetchStatSplits) keyed `${year}:${pitcherId}`, a
                                           batter bundle (fetchSeasonStats, fetchHotColdZones, fetchStatSplits,
                                           fetchGameLog, fetchSavantBattedBalls) keyed `${year}:${batterId}`, and
                                           fetchVsPlayer keyed on both. Each constituent fetch is independently
                                           caught so one failing endpoint does not blank the rest; because that
                                           means the bundle promise can never reject, a fully-empty result is
                                           evicted from the cache on resolution so a fetch that happened while
                                           offline is not cached as empty for the session. Returns batterSeason,
                                           pitcherSeason, pitchArsenal, batterHotCold, pitcherHotCold,
                                           batterSplits, pitcherSplits, gameLog (full season; consumers
                                           slice locally),
                                           vsPlayer, savantData (filtered to rows with both hc_x and hc_y
                                           present), loading, plus pitcherLoading and batterLoading so each PVB
                                           card resolves on its own. Also exports preloadPlayerStats(batterId,
                                            pitcherId), called from App. Imported by MatchupSubTab.
    useWatchability.ts                    useWatchability(games) => { scores: ReadonlyMap<number,
                                           WatchabilityResult>, loading, stale }. Legacy client-side watchability
                                           hook. Fetches /watchability.json once on mount; polls
                                           fetchWinProbability every 30s for live games. Now superseded by
                                           useLiveScores for GameSelect, but retained as a fallback and for
                                           potential future use. Not currently imported by any component.
    useLiveScores.ts                      useLiveScores(dateStr) => { scores: ReadonlyMap<number, number>,
                                           pitchers: ReadonlyMap<number, CurrentPitcher>,
                                           batters: ReadonlyMap<number, CurrentBatter>, loading }. Polls the
                                           liveScores Cloud Function HTTP endpoint every 15s
                                           (LIVE_SCORES_INTERVAL), a single call that returns watchability scores
                                           AND current pitcher/batter info for all games on the slate. Replaces
                                           useWatchability's per-game winProbability polling (N requests at 30s)
                                           with one server-side call at 15s. Pauses when document.hidden; resumes
                                           on visibilitychange. Graceful failure: keeps prior scores/pitchers if
                                           the Cloud Function is unreachable. CurrentPitcher = { id, fullName,
                                           fieldingSide: 'away'|'home' }. CurrentBatter = { id, fullName,
                                           battingSide: 'away'|'home' }. Imported by GameSelect.
     useStatBenchmarks.ts                  useStatBenchmarks(scope: BenchmarkScope) => { cohorts, loading }.
                                           Fetches ActiveBenchmarkCohorts for the current year on mount; the
                                           cohort object is null until the first successful resolution. No longer
                                           imported by any component after the stat-card removal; retained for
                                           potential future use.
    useLiveSlate.ts                       useLiveSlate(date) => { games, loading, refresh }. Adaptive schedule
                                           polling hook that replaces the one-shot fetchSchedule pattern in
                                           GameSelect. Uses recursive setTimeout (not setInterval) so cadence
                                           adapts after each fetch: 15s when any game is Live, 30s when all
                                           Preview, stops when all Final. Pauses when document.hidden; resumes
                                           with immediate refresh on visibilitychange. On fetch error keeps
                                           existing games (does not clobber with empty array). Imported by
                                           GameSelect.

  utils/
    pitchConstants.ts                     Exports PITCH_COLORS (Record<string,string>, keys FF SI FC SL ST CU KC
                                           CH FS KN FO SC EP) and getPitchColor(code): falls back to '#888888' for
                                           unknown codes. Imported by ZonePlot, BatterGameSubTab,
                                           MatchupSubTab.
    leagueConstants.ts                    Thin re-export layer for constants in shared/scoring.mjs. Exports
                                           LEAGUE_ERA (4.20), LEAGUE_WOBA (0.310), WOBA_SCALE (1.24),
                                           LEAGUE_R_PER_PA (0.120), and PARK_FACTORS (Record<string, number>,
                                           30 team-abbreviation keys). Hardcoded in the shared module; must be
                                           updated annually before each season (see section 9). Imported by
                                           useWatchability (for PARK_FACTORS only), which reattaches park
                                           factor onto the watchability payload client-side.
    sabermetrics.ts                       Pure computation functions: computeFIP, computeERAplus, computeWRCplus,
                                           computeISO, computeKpct, computeBBpct, computeHR9, computeGBpct,
                                           parseStat, ipToDecimal. See section 7 for formulas. Imported by
                                            MatchupSubTab (indirectly via ipToDecimal/parseStat).
    derivePitcher.ts                      Exports derivePitcher(currentPlay, liveFeed, selectedGame): resolves the
                                           current pitcher via a 4-step fallback chain — (1) currentPlay.matchup.pitcher
                                           (the pitcher in the current at-bat), (2) liveFeed.linescore.defense.pitcher
                                           (always populated once the feed loads, even between at-bats or in Preview
                                           state), (3) selectedGame home probable pitcher, (4) selectedGame away probable
                                           pitcher, (5) null. This replaces a copy-pasted 5-line fallback that was
                                            duplicated in App.tsx, MatchupSubTab, and
                                           LogsSubTab. Imported by all three of those files.
    watchability.ts                       Thin re-export layer for the shared scoring module. Runtime math
                                           and constants are imported from shared/scoring.mjs and re-exported
                                           with explicit type annotations from shared/scoring-types.ts. All
                                           existing exports preserved: types (Baseline, LeagueBaseline,
                                           TeamRating, PitcherRating, GameInputs, PayloadGame,
                                           WatchabilityPayload, WinProbabilityPlay, ScoreBreakdown,
                                           WatchabilityResult, WatchabilityTier, GameProgressState), constants
                                           (WEIGHTS, HOME_FIELD_ELO), and functions eloWinProbability, tierFor,
                                           computePregameScore, computeExcitementIndex, computeLiveScore,
                                           computeWatchability. Imported by useWatchability, ScoreRing,
                                           mlb.ts (for WinProbabilityPlay type).
    chartTheme.ts                         Single source of truth for all canvas/chart hex colors. Exports
                                           PITCH_COLORS, PITCH_COLOR_LOOKUP, getPitchColor, CALL_COLORS,
                                           HEAT_RAMP, HEAT_EMPTY, TEMP_COLORS, EVENT_COLORS, CHART, FIELD,
                                           BASE_VALUE_COLORS, readableInkOn, and type PitchCode. Values
                                           mirror DESIGN.md §2 (Color). Enforced by scripts/design-checks.mjs:
                                           no raw hex literals may appear in Canvas/*.tsx or
                                           pitchConstants.ts.                                            Imported by HeatMap, SprayChart.
    gameDay.ts                            Exports gameDateStr(now = new Date()): returns a YYYY-MM-DD string
                                           anchored to a 6 AM local rollover (not midnight), so late West
                                           Coast games that finish after midnight are not dropped from the
                                           slate. Imported by GameSelect, useWatchability.
    mlbAssets.ts                          MLB imagery URL builder (no fetch, no cache — pure string
                                           composition). Exports teamLogoUrl(teamId, variant), where variant
                                           is 'cap-on-light' | 'cap-on-dark' | 'primary-on-light' |
                                           'primary-on-dark' | 'default'; playerHeadshotUrl(personId, size),
                                           where size is 'sm' | 'md' | 'lg' | 'xl'; playerSpotUrl; and type
                                           aliases TeamLogoVariant, HeadshotSize. Imported by PlayerAvatar,
                                           TeamLogo.
    percentile.ts                         Exports StatBenchmark (interface: percentile, sampleSize, cohort)
                                           and percentileBenchmark(value, cohortValues, lowerIsBetter,
                                           cohort) => StatBenchmark | undefined. Computes the percentile
                                           rank of a value against a cohort array; returns undefined for
                                           null/non-finite values or empty cohorts. Imported by
                                           PvbCards, Stat (UI).

  components/
    GameScreen.tsx                       Page-based game screen container. Renders MiniNav (sticky top) and
                                           .game-page (the scroll owner) which conditionally mounts exactly
                                           one <section> at a time for ab, matchup, game, or logs. Nav buttons
                                           call gameStore.setActiveTab; there is no scrolling between sections.
                                           Imports gameStore, MiniNav, LiveAtBat, MatchupSubTab,
                                           PitcherGameSubTab, BatterGameSubTab, LogsSubTab.
                                           Imported by App.tsx.
    ui/MiniNav.tsx                       Sticky 44px nav bar with [AB|Matchup|Game|Logs] buttons (role=tablist,
                                           equal-flex). Active state from gameStore.activeTab. Imported by
                                           GameScreen.
    ui/FloatingGamesButton.tsx           Fixed bottom-left pill button (chevron-left + "Games"), calls
                                           gameStore.reset. Imported by App.tsx.
    GameSelect/GameSelect.tsx             Pre-game picker. Calls useLiveSlate(gameDateStr()) for adaptive
                                           schedule polling (15s when any game is Live, 30s when all Preview,
                                           stops when all Final), replacing the previous one-shot fetchSchedule
                                           on mount. Groups games into Live / Upcoming (Preview) / Final by
                                           status.abstractGameState (now reflects real-time status transitions),
                                           renders GameCard buttons that call gameStore.selectGame on click. Its
                                           `.game-select` container is this screen's single scroll owner (see
                                           section 8). Calls useWatchability(games) and passes each game's score
                                           down to its GameCard. Renders a Segmented (Time | Watchability) sort
                                           control under the date line; sorting happens within each
                                           Live/Upcoming/Final group so that grouping survives a sort change,
                                           and scoreless games sort last rather than as zero. Initial sort mode
                                           reads `?sort=watchability` via initialSortMode(), which backs the PWA
                                           manifest shortcut (section 10). Imported by App.tsx.
    GameSelect/GameCard.tsx               Individual game card, rendered as a <button>. Optional props
                                           `watchability?: number | null` (rendered via `<ScoreRing size="lg">`
                                           in a `.gc-head` row alongside `.gc-teams`), `currentPitcher?:
                                           CurrentPitcher | null`, and `currentBatter?: CurrentBatter | null`
                                           (from useLiveScores). For Live games, the fielding side shows the
                                           current pitcher (role `P`) and the batting side shows the current
                                           batter (role `H`); for Preview/Final games, probable pitchers
                                           (role `SP`) are shown. Each team row always renders its `.gc-score`
                                           span, even when empty, because `.gc-team` is `display: contents`
                                           and a dropped child would shift the next row's logo into the wrong
                                           grid column (see DESIGN.md §6.5). shortenName() shortens any
                                           pitcher/batter name over 15 characters (NAME_MAX) to first-initial
                                           + full surname, box-score style, keeping all trailing tokens so
                                           suffixes survive; PlayerAvatar still receives the full name for
                                           its accessible name. Imported by GameSelect.
    ui/ScoreRing.tsx                      The 14th UI primitive (DESIGN.md §5.14). ScoreRing({ score, size, live
                                           }): renders the 0-100 watchability score as an SVG ring with the
                                           numeral stacked on top, built entirely from <span> and <svg> — never
                                           <div> — because GameCard's root is a <button>, which only admits
                                           phrasing content. `null`/non-finite scores render `0` with an empty
                                           arc. The numeral counts up/down on score changes via
                                           requestAnimationFrame (ease-out, ~600ms); on first render it snaps
                                           to the target so cached scores appear instantly. Respects
                                           prefers-reduced-motion. Imported by GameCard.
    StatsGuide/StatsGuide.tsx             Global searchable metric reference. Renders the fixed information
                                           trigger and accessible right-side dialog; owns search filtering,
                                           focus trapping/restoration, Escape and scrim dismissal, and body
                                           scroll locking. Mounted by App.tsx on every screen.
    StatsGuide/statGlossary.ts            Typed, alphabetically sorted glossary data for standard, advanced,
                                           live, pitch-tracking, batted-ball, linescore, and Watchability metrics.
                                           Includes formulas where a displayed statistic is calculated.
     LiveGame/BatterGameSubTab.tsx         "Batter" subsection of the `game` section in GameScreen.
                                           Derives a plate-discipline summary and per-PA at-bat log purely
                                           from liveFeed.liveData.plays.allPlays; issues no network requests.
                                           Renders GameIdentity (PA/AB/H/HR/RBI/BB/K/Pitches), a Plate
                                           Discipline StatGrid (Swing%/Whiff%/Chase%/Zone%/Taken%/Called/
                                           SwStr/Foul/In Play), and an At Bats DataTable. Declares no
                                           heights. Imported by GameScreen.
     LiveGame/PitcherGameSubTab.tsx        "Pitcher" subsection of the `game` section in GameScreen.
                                           Derives an in-game PitcherGame summary (pitches, strikes/balls,
                                           battersFaced, outs, first-pitch-strike rate) purely from
                                           allPlays, bounded to plays at or before the current at-bat
                                           index. Renders GameIdentity (IP/P/BF/K/BB/H/HR/P-BF) and a
                                           Command StatGrid (Strike%/CSW%/Whiff%/1st-P Str/Zone%/Chase%/
                                           Called/SwStr/In Play). Declares no heights. Imported by
                                           GameScreen.
    LiveAtBat/LiveAtBat.tsx               The `ab` section of GameScreen (the top of the single-scroll game
                                           screen). Renders score + baserunner diamond + inning indicator,
                                           per-team linescore rows, batter-vs-pitcher matchup header, the
                                           three-column AtBatPanel, LastPitchStrip, ContactStrip, and the play
                                           result banner. The pitcher workload and batter game-line grids that
                                           used to sit here now live in the `game` section. Imported by
                                           GameScreen.
    LiveAtBat/LastPitchStrip.tsx          Four readings (Velo, Spin, Brk Vert, Extension) toned against the
                                           pitcher's baseline for that pitch type, with a signed `+1.4 vs szn`
                                           delta under each value. Replaces the old ten-cell telemetry dump.
                                           Imported by LiveAtBat.
    LiveAtBat/ContactStrip.tsx            Four batted-ball readings (Exit Velo, Launch °, Distance, Hardness)
                                           toned from the batter's point of view against league contact
                                           reference points. Launch angle is toned on a band (8°-32°), not a
                                           slope. Imported by LiveAtBat.
    LiveAtBat/lastPitchBaseline.ts        Pure baselines for LastPitchStrip. `derivePitchBaselines(rows, type,
                                           excludePlayId)` returns per-metric `{baseline, isSeason}`: velo from
                                           Savant `avg_pitch_speed` (season) with a same-game fallback, and
                                           spin / vertical break / extension from the pitcher's same-type
                                           pitches in this game. Excludes the pitch being judged so it cannot
                                           inflate its own baseline. `toneFor()` applies a per-metric dead band
                                           (velo 0.8 mph, spin 75 rpm, break 1.5, extension 0.15 ft) and
                                           compares vertical break on magnitude, since the feed signs it by
                                           pitch family. `deltaLabel()` formats the signed caption.
                                           AtBatPanel.tsx renders the three-column At Bat grid (situation /
                                           ZonePlot / Sequence). The Sequence dots are colored by CALL, not by
                                           pitch type -- the FF/KC code beside each dot already carries type,
                                           while the ZonePlot dots and its internal legend are colored by type.
                                           callTone() in liveAtBatFormat.ts maps Gameday `details.call.code`
                                           onto five tones (ball / called / swinging / foul / inplay), each
                                           given a distinct shape as well as a hue, and CALL_TONE_LEGEND drives
                                            the labelled `.atbat__legend` key rendered on its own full-width row
                                            beneath the grid.
     PitcherVsBatter/MatchupSubTab.tsx     Scope driven by gameStore.globalScope ('thisGame' | 'season',
                                           default 'thisGame'), switched only by the MatchupHeader face-card
                                           arrows (SCOPE_CYCLE wraps at both ends); there is no standalone
                                           scope Segmented. Scope rewrites both face-card statlines -- game
                                           scope uses derivePitcherLine/deriveBatterLine summaries from
                                           liveFeed allPlays, season scope uses pitcherSeason/batterSeason.
                                           This-game H2H derived from liveFeed allPlays via
                                           deriveThisGameH2H; season via vsPlayer from
                                            usePlayerStats. Unified perspective toggle
                                             (gameStore.matchupPerspective 'pitcher'|'batter') swaps which HotCold
                                             array feeds ZonePanel/HeatMap (always pitcher-perspective orientation)
                                             and which side's splits render. Render order: MatchupHeader, unified
                                             Segmented + ZonePanel, H2HPanel, Splits table, ArsenalFacedPanel. Splits
                                             table is one side at a time (gameStore.matchupPerspective 'pitcher'|'batter')
                                            with rows Season / vs L / vs R / RISP / Home / Away; Home and Away
                                            are aggregated locally from fetchCachedGameLog entries grouped by
                                            isHome, since neither is a published split. Arsenal follows
                                            globalScope via buildGameArsenalRows / buildSeasonArsenalRows.
                                            Imported by GameScreen.
    PitcherVsBatter/LogsSubTab.tsx        The Logs tab. Segmented (Pitcher|Batter) bound to
                                            gameStore.matchupPerspective picks which side's season game log
                                           renders. Both logs are fetched directly through
                                           fetchCachedGameLog (pitching / hitting) rather than
                                           usePlayerStats, so the untruncated season is available here
                                           without widening the shared bundle. Rows are reversed
                                           (most recent first) and capped at 7 until the .log-more
                                           button expands to the full season; switching perspective
                                           collapses back to 7. Pitcher columns Date/IP/H/ER/BB/K,
                                           batter columns Date/AB/H/2B/HR/RBI/K.
                                           Imported by GameScreen.
     PitcherVsBatter/ArsenalColorCoding.ts Pure functions: buildGameArsenalRows (filters SavantGamePitch
                                           by current pitcher via allPlays matchup cross-ref, groups by
                                           pitch_type, color-codes velo vs avg_pitch_speed season baseline)
                                           and buildSeasonArsenalRows (maps PitchArsenalItem[] to
                                            ColorCodedArsenalRow[]). Each row carries velo, spin, breakVertical
                                            and breakHorizontal as ArsenalMetric {value, tone, delta}; the season
                                            builder leaves spin and both breaks null because the MLB arsenal
                                            endpoint publishes only usage and average speed. Export types:
                                            HandednessFilter, ArsenalMetric, ColorCodedArsenalRow. Imported by
                                            MatchupSubTab.
     Canvas/HeatMap.tsx                    HeatMap({ zones: HotColdZone[], size = 150 }). Draws a 3x3 hot/cold
                                           grid on canvas, colored via the local TEMP_COLORS map (hot/cold/warm/
                                            lukewarm). Imported by MatchupSubTab.
    Canvas/SprayChart.tsx                 SprayChart({ data: ReadonlyArray<SavantBattedBall>, width = 304, height = 274 }).
                                           Plots batted-ball landing spots from hc_x/hc_y, colored via the local
                                            EVENT_COLORS map. No longer rendered by any section after the
                                           single-scroll redesign; kept for potential re-use.
    Canvas/ZonePlot.tsx                   ZonePlot({ zone?, size?, pitchType?, callCode?, pitches? }). Draws the
                                           strike zone with either a single pitch marker or every pitch in
                                           `pitches`, colored by call outcome (CALL_COLORS) or pitch type
                                           (PITCH_COLORS). Renders an internal legend once `size >=
                                           LEGEND_MIN_SIZE` (172). Imported by LiveAtBat.

  App.css                                 The app-shell layout system: app shell, tab bar, sub-tab nav,
                                           panels, the `.h-*` utility classes, PvB card strip, canvas wrappers,
                                           dense data primitives (stat rows/grids/split tables), live at-bat
                                           layout, game-select layout, focus-visibility rules, and the fixed
                                           Stats Guide trigger, scrim, and responsive drawer. See section 8.
                                           `.game-card`/`.gc-skeleton` gained `width:100%; max-width:400px;
                                           justify-self:center` — the cap lives on the card, not the grid
                                           track's `minmax()` max, because `auto-fill` sizes tracks to the max,
                                           which would otherwise overflow `.game-group` at wide viewports.
                                           `.gc-teams` became a 4-track grid with `.gc-team` set to `display:
                                           contents` so both team rows share logo/name/runs tracks; see
                                           DESIGN.md §6.5.
  index.css                               Global reset, CSS custom-property tokens (palette, height budget,
                                           type scale, spacing), base typography, shared loading/error/empty
                                           state utilities. See section 8.

vercel.json                               Vercel deploy config: framework "vite", buildCommand "tsc -b && vite
                                           build", outputDirectory "dist", SPA rewrite of /(.*) to /index.html.
vite.config.ts                            Vite config: @vitejs/plugin-react, vite-plugin-pwa (autoUpdate,
                                           manifest with standalone display orientation, NetworkFirst runtime
                                           caching for statsapi.mlb.com (5 min TTL) and baseballsavant.mlb.com
                                           (10 min TTL), a StaleWhileRevalidate rule for /watchability.json, a
                                           NetworkOnly rule excluding diffPatch, a StaleWhileRevalidate bucket
                                           for the benchmark cohort queries, and a CacheFirst rule for
                                           mlbstatic.com imagery. See section 10.
index.html                                Root HTML. Sets viewport-fit=cover and maximum-scale=1.0,
                                           user-scalable=no on the viewport meta tag (viewport-fit=cover is
                                           required for env(safe-area-inset-*) to resolve to a non-zero value).

shared/
  scoring.mjs                             Pure watchability scoring math (~290 lines, zero deps, zero imports).
                                          JSDoc-typed plain ESM JavaScript, importable by the frontend
                                          (via src/utils/watchability.ts re-export), the Cloud Functions
                                          (via functions/src/scoring.ts re-export), and the nightly build
                                          script (scripts/build-watchability.mjs). Exports constants
                                          (LEAGUE_ERA, LEAGUE_WOBA, WOBA_SCALE, LEAGUE_R_PER_PA,
                                          PARK_FACTORS, WEIGHTS, HOME_FIELD_ELO) and functions
                                          (computePregameScore, computeExcitementIndex, computeLiveScore,
                                          computeWatchability, tierFor, eloWinProbability). See section 12
                                          for formulas.
  scoring-types.ts                        TypeScript type definitions for scoring.mjs (~130 lines). Exports
                                          all interfaces and type aliases (Baseline, LeagueBaseline,
                                          TeamRating, PitcherRating, GameInputs, PayloadGame,
                                          WatchabilityPayload, WinProbabilityPlay, ScoreBreakdown,
                                          WatchabilityResult, WatchabilityTier, GameProgressState). Imported
                                          by src/utils/watchability.ts and functions/src/scoring.ts to type
                                          the untyped .mjs runtime imports.

functions/
  package.json                            Functions package (firebase-admin ^13, firebase-functions ^6).
                                          Separate from the root package.json — the frontend's "zero new
                                          npm dependencies" constraint applies to src/, not to serverless
                                          functions.
  tsconfig.json                           Functions TS config: ESNext module, bundler resolution, ES2022
                                          target, strict mode, allowJs, outDir lib/. rootDir is ".." and
                                          include covers ../shared so shared/scoring.mjs is compiled into
                                          functions/lib — Firebase only uploads the functions/ directory,
                                          so shared code must be emitted inside it. This nests the output,
                                          hence "main": "lib/functions/src/index.js".
  src/index.ts                            Entry point. Exports notifyMorningDigest, notifyPregame,
                                          notifyLive, and liveScores.
  src/scoring.ts                          Re-export from ../../shared/scoring.mjs with type safety via
                                          ../../shared/scoring-types.ts. Exports computePregameScore,
                                          computeExcitementIndex, computeLiveScore, computeWatchability,
                                          tierFor, eloWinProbability, PARK_FACTORS, WOBA_SCALE,
                                          LEAGUE_R_PER_PA.
  src/telegram.ts                         Telegram message sender + HTML message builder. Exports
                                          sendTelegramNotification(botToken, chatId, payload),
                                          sendTelegramDigest(botToken, chatId, date, entries),
                                          NotificationPayload interface, and DigestEntry interface.
                                          Messages include inline keyboard button deep-linking to the
                                          PWA. NotificationPayload trigger types: pregame, crossing,
                                          jump. Digest sends a single message with all qualifying games.
  src/notify-morning-digest.ts            Scheduled Cloud Function (daily 9 AM ET). Fetches
                                          watchability.json + MLB schedule, computes pregame scores,
                                          filters to ≥ 65, sorts by score descending, sends a single
                                          Telegram message listing all qualifying games with ET start
                                          times. Sets digestNotified flag per game in Firestore
                                          notifications/{date}/games/{gamePk}.
  src/notify-pregame.ts                   Scheduled Cloud Function (every 10 min, America/New_York).
                                          Fetches watchability.json + MLB schedule for start times.
                                          Sends "Starting Soon" Telegram reminders for games scoring
                                          ≥ 65 that start within the next 30 minutes and haven't been
                                          notified yet. Deduplicates via Firestore
                                          notifications/{date}/games/{gamePk}.
  src/notify-live.ts                      Scheduled Cloud Function (every 1 min, America/New_York).
                                          Fetches MLB schedule for both today and yesterday (to catch
                                          late West Coast games that span midnight ET), filters to live
                                          games, runs a 15-second polling loop (max 55s) fetching
                                          winProbability and computing live watchability. Sends crossing
                                          (first score >= 65, re-fires if score drops below 65 and
                                          recovers) and jump (+10 from last notified score) alerts,
                                          deduplicates via Firestore notifications/{scheduleDate}/games/{gamePk}
                                          keyed by the game's original schedule date (not current ET date).

firebase.json                             Firebase config: functions source "functions", runtime nodejs22,
                                          Firestore rules and indexes paths. The predeploy hook invokes tsc
                                          directly instead of "npm run build" — npm crashes with "Cannot
                                          read properties of undefined (reading 'stdin')" when spawned by
                                          the Firebase CLI.
.firebaserc                               Firebase project alias: default -> mlb-companion-pwa.
firestore.rules                           Firestore security rules: notifications/{date}/games/{gamePk} allows
                                          read/write only from Cloud Functions (Admin SDK), no client access.
firestore.indexes.json                    Empty — all queries are direct document lookups by {date}/{gamePk}.

scripts/
  build-watchability.mjs                  Nightly watchability data pipeline (~480 lines, Node ESM, zero deps).
                                           See section 12. Run as `node scripts/build-watchability.mjs
                                           [YYYY-MM-DD]` (defaults to today). Writes public/watchability.json
                                           and public/elo-state.json.

.github/workflows/
  watchability.yml                        Runs the pipeline on a schedule and commits its output. See section
                                           10.
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
                                                                         LogsSubTab, GameSelect)
                                                                             │
                                                                             └─► Canvas renderers (HeatMap,
                                                                                  ZonePlot)
```

- `App.tsx` is the only place that writes `selectedGame`/`gamePk` from a URL (`?gamePk=`) or from `GameSelect`'s picker, and the only place that populates `gameFeedPitches` from `fetchSavantGameFeed`.
- `useLiveFeed` is the only source of live-feed polling; it is invoked exactly once, inside `App`, so the 4s interval is tied to the selected game rather than to which tab happens to be mounted. Switching tabs no longer tears down and refetches the feed.
- `usePlayerStats` is called by `MatchupSubTab` with the same `(batterId, pitcherId)` pair. Module-level promise caches keyed per player mean only the first caller fetches; the rest await the same promise. `App` warms these caches (`preloadPlayerStats`, `fetchCachedGameLog`, `fetchActiveBenchmarkCohorts`) as soon as the live feed yields a matchup, so opening any section is generally instant.
- **Pitcher selection** in the Pitcher vs Batter tab and the `App` preload uses a shared `derivePitcher(currentPlay, liveFeed, selectedGame)` helper (`src/utils/derivePitcher.ts`) with a 4-step fallback: (1) `currentPlay.matchup.pitcher` — the pitcher in the current at-bat, (2) `liveFeed.linescore.defense.pitcher` — the MLB API's linescore defense field, always populated once the feed loads (even in Preview state or between at-bats when `currentPlay` is transiently null), (3) home probable pitcher, (4) away probable pitcher, (5) null. This ensures the PVB tab shows the actual pitcher on the mound — including relievers after a pitching change — rather than defaulting to the scheduled starter. The Live Game tab (At Bat / Pitcher / Batter sub-tabs) already used `currentPlay.matchup.pitcher` directly with no fallback; only the PVB tab had the copy-pasted probable fallback.
- Because the caches are keyed per player rather than per matchup, a pitching change refetches only the pitcher bundle and a new batter refetches only the batter bundle.
- Sabermetric derivations (FIP, ERA+, wRC+, ISO, K%, BB%, HR/9, GB%) happen in the consuming components, not inside the store or the fetchers — raw stat objects are stored/passed as-is and computed on render.
- No data ever flows backward from components into the API layer; all fetchers are one-directional reads.
- **Watchability is a separate, parallel data flow that never touches gameStore.** `scripts/build-watchability.mjs`
  runs nightly (outside the app, via GitHub Actions), computes league baselines and per-game inputs, and writes
  `public/watchability.json`. The pure scoring math lives in `shared/scoring.mjs` (shared between frontend,
  Cloud Functions, and build script). `useLiveScores`, called from `GameSelect`, polls the `liveScores` Cloud
  Function HTTP endpoint every 15s — a single server-side call that fetches winProbability + feed/live for all
  games, computes `computeWatchability` server-side, and returns scores plus current pitcher info. This replaces
  the previous client-side `useWatchability` which polled `fetchWinProbability` per-game at 30s. The nightly
  pipeline emits inputs only; it never computes a score. See section 12 for why that split matters.
- **Live slate polling** is handled by `useLiveSlate`, called from `GameSelect`. It replaces the previous one-shot
  `fetchSchedule` on mount with adaptive `setTimeout` polling: 15s when any game is Live, 30s when all Preview,
  stops when all Final. This feeds fresh game status (Preview→Live→Final transitions), scores, and inning detail
  to `GameSelect`'s grouping logic. Watchability scores and current pitcher info are fetched in parallel by
  `useLiveScores` (15s Cloud Function poll). Pauses when the tab is hidden; resumes with immediate refresh on
  visibilitychange.
- **Telegram notifications** run entirely server-side via Firebase Cloud Functions, separate from the browser.
  `notify-morning-digest` (daily 9 AM ET cron) fetches watchability.json + the MLB schedule, computes pregame
  scores, filters to ≥ 65, sorts by score descending, and sends a single Telegram message listing all qualifying
  games with their ET start times. `notify-pregame` (10-min cron) sends a per-game "Starting Soon" reminder when
  a game scoring ≥ 65 is within 30 minutes of first pitch. `notify-live` (1-min cron with 15s in-function
  polling loop) fetches both today's and yesterday's MLB schedule (to catch late West Coast games that span
  midnight ET), sends crossing alerts (live score crosses 65, re-fires after dropping below 65) and jump alerts
  (+10 from last notified score). `liveScores` (HTTP onRequest) serves the frontend's `useLiveScores` hook with
  per-game watchability scores and current pitcher info. All notification functions deduplicate via Firestore
  `notifications/{scheduleDate}/games/{gamePk}` documents, keyed by the game's original schedule date. No
  notification logic runs in the browser. See `docs/LIVE_NOTIFICATIONS_PLAN.md` for the full design.

## 4. API Endpoints Reference

All MLB Stats API endpoints use `BASE = 'https://statsapi.mlb.com/api'` from `src/api/mlb.ts`.

| Endpoint | Params | Fetcher | Response shape (summary) |
|---|---|---|---|
| `GET /v1/schedule` | `sportId=1&date=<YYYY-MM-DD>&hydrate=probablePitcher,linescore,team` | `fetchSchedule(date)` | `ScheduleResponse.dates[].games[]` (flattened) → `ScheduledGame[]` |
| `GET /v1.1/game/{gamePk}/feed/live` | path param `gamePk` | `fetchLiveFeed(gamePk)` | `LiveFeed` (gameData, liveData.plays, metaData.timeStamp) |
| `GET /v1.1/game/{gamePk}/feed/live/diffPatch` | `startTimecode=<metaData.timeStamp>` | `fetchDiffPatch(gamePk, startTimecode)` | `DiffPatchResponse` = `DiffPatchEntry[]` (`[{ diff: [{op,path,value?,from?}] }]`, RFC 6902) **or** a full `LiveFeed` when nothing changed |
| `GET /v1/people/{personId}` | path param `personId` | `fetchPlayer(personId)` | `{ people: [PlayerInfo] }` (first element returned) |
| `GET /v1/people/{personId}/stats` | `stats=season&group=<hitting\|pitching>&season=<year>` | `fetchSeasonStats(personId, group, season, mode='season')` | `stats[0].splits[0].stat` → `SeasonStat \| PitcherSeasonStat` |
| `GET /v1/people/{personId}/stats` | `stats=pitchArsenal&group=pitching&season=<year>` | `fetchPitchArsenal(personId, season)` | `stats[0].splits[].stat`, with `percentage` multiplied by 100 → `PitchArsenalItem[]` |
| `GET /v1/people/{personId}/stats` | `stats=hotColdZones&group=<hitting\|pitching>&season=<year>` | `fetchHotColdZones(personId, group, season)` | Selects the split named `battingAverage` by name (falls back to `splits[0]`), never by index → `HotColdZone[]` |
| `GET /v1/people/{personId}/stats` | `stats=statSplits&group=<hitting\|pitching>&season=<year>&sitCodes=vl,vr,risp` (default sitCodes) | `fetchStatSplits(personId, group, season, sitCodes?)` | `stats[0].splits` → `StatSplit[]` |
| `GET /v1/people/{personId}/stats` | `stats=gameLog&group=<hitting\|pitching>&season=<year>` (group defaults to `hitting`) | `fetchGameLog(personId, season, group?)` | `stats[0].splits` → `GameLogEntry[]` |
| `GET /v1/people/{batterId}/stats` | `stats=vsPlayer&group=hitting&season=<year>&opposingPlayerId=<pitcherId>` | `fetchVsPlayer(batterId, pitcherId, season, mode='season')` | `stats[0].splits[0].stat`, normalized into `VsPlayerStat` |
| `GET /v1/schedule` | `sportId=1&startDate=<-7d>&endDate=<+7d>` around the target game date | `fetchSeriesSchedule(gameDate, teamId, opponentId)` | Filters to games between the two teams, groups into consecutive-day runs, returns the run containing the target date as `{ gamePk, date }[]` |
| `GET /v1/game/{gamePk}/playByPlay` | path param `gamePk` (note: **v1**, not v1.1) | `fetchPlayByPlay(gamePk)` / `fetchPlayByPlayBatch(gamePks)` | `PlayByPlayResponse`; batch version chunks requests at most 5 concurrent (`chunk(arr, 5)`) |
| `GET /v1/game/{gamePk}/winProbability` | path param `gamePk` | `fetchWinProbability(gamePk)` | `WinProbabilityPlay[]`, one entry per play, carrying `leverageIndex`, `homeTeamWinProbability`, `homeTeamWinProbabilityAdded` (WPA in percentage points, not a fraction), `dramaIndex`, and `about.captivatingIndex`. `dramaIndex` and `captivatingIndex` are undocumented MLB fields, so the response is parsed through runtime guards and degrades to null components rather than throwing. Called by the `liveScores` Cloud Function for all live/final games, feeding `computeExcitementIndex`/`computeLiveScore` in `shared/scoring.mjs` (section 12). This is a separate call rather than reusing `/v1.1/game/{gamePk}/feed/live`, which the app already fetches: that feed carries `about.captivatingIndex` but not `leverageIndex`, win probability, or `dramaIndex`. |

Baseball Savant endpoints use `SAVANT_BASE = 'https://baseballsavant.mlb.com'` from `src/api/savant.ts`.

| Endpoint | Params | Fetcher | Response shape (summary) |
|---|---|---|---|
| `GET /gf` | `game_pk=<gamePk>` | `fetchSavantGameFeed(gamePk)` | JSON `{ home_batters, away_batters }`, each a `Record<string, SavantGamePitch[]>`; flattened and concatenated into `SavantGamePitch[]` |
| `GET /statcast_search/csv` | `all=true&type=details&hfSea=<season>%7C&player_type=<batter\|pitcher>&batters_lookup%5B%5D=<id>` (or `pitchers_lookup%5B%5D`) `&minPA=0`, plus `game_date_gt=<60-days-ago>` when `season` is the current year | `fetchSavantBattedBalls(playerId, season, playerType='batter')` | CSV text, parsed by `parseSavantCSV` into `SavantBattedBall[]` |

Cloud Function endpoints (Firebase, `us-central1-mlb-companion-pwa`):

| Endpoint | Params | Caller | Response shape (summary) |
|---|---|---|---|
| `GET liveScores` (`https://us-central1-mlb-companion-pwa.cloudfunctions.net/liveScores`) | `?date=YYYY-MM-DD` (defaults to today ET) | `useLiveScores` (every 15s) | `{ date, games: { [gamePk]: { score, tier, pregame, live, liveWeight, currentPitcher: { id, fullName, fieldingSide } \| null, currentBatter: { id, fullName, battingSide } \| null } } }`. Server fetches schedule + watchability.json + winProbability per live/final game + feed/live for current pitcher and batter, computes `computeWatchability` server-side. 60s timeout, 512MiB memory. |

## 5. Component Hierarchy

```
main.tsx
  ErrorBoundary
    App.tsx
    (no selectedGame) GameSelect (useLiveSlate → useLiveScores) -> GameCard (currentPitcher, currentBatter) -> ScoreRing
    (selectedGame set)
      GameScreen
        MiniNav (AB | Matchup | Game | Logs -- real tabs, one section mounted at a time)
        .game-page  <- THE scroll owner
          section#ab       -> LiveAtBat -> StatusStrip, MatchupCard,
                                           AtBatPanel -> ZonePlot (pitcher view),
                                           LastPitchStrip, ContactStrip
           section#matchup  -> MatchupSubTab -> MatchupHeader (scope arrows),
                                           H2HPanel,
                                           Segmented (unified Pitcher|Batter),
                                           ZonePanel -> HeatMap,
                                           TablePanel (Splits: Season/vs L/vs R/
                                             RISP/Home/Away for one side),
                                           ArsenalFacedPanel (Segmented All/RHB/LHB
                                             in game scope)
          section#game     -> PitcherGameSubTab -> GameIdentity, Command panel
                              BatterGameSubTab  -> GameIdentity, Plate Discipline,
                                                  At Bats DataTable
          section#logs     -> LogsSubTab -> Segmented (Pitcher|Batter),
                                            TablePanel (game log, 7 rows by default),
                                            .log-more toggle (Show all N / Show less)
      FloatingGamesButton (fixed bottom-left, calls store.reset())
      StatsGuide          (fixed bottom-right FAB)
```

## 6. State Management

`src/store/gameStore.ts` exports a single zustand store, `useGameStore`, typed as `GameState`:

```ts
type ActiveTab = 'ab' | 'matchup' | 'game' | 'logs'
type GlobalScope = 'thisGame' | 'season'
type MatchupPerspective = 'pitcher' | 'batter'

interface GameState {
  selectedGame: ScheduledGame | null
  gamePk: number | null
  liveFeed: LiveFeed | null
  currentPlay: CurrentPlay | null
  lastTimecode: string | null
  isPolling: boolean
  activeTab: ActiveTab
  globalScope: GlobalScope
  matchupPerspective: MatchupPerspective
  recentFormGames: number
  gameFeedPitches: SavantGamePitch[]
  error: string | null
  scoreCache: ReadonlyMap<number, number>
  pitcherCache: ReadonlyMap<number, CurrentPitcher>
  batterCache: ReadonlyMap<number, CurrentBatter>
  // actions listed below
}
```

Defaults: `activeTab: 'ab'`, `globalScope: 'thisGame'`, `matchupPerspective: 'pitcher'`, `recentFormGames: 7`, `scoreCache`/`pitcherCache`/`batterCache` empty `Map`s, everything else `null`/`false`/`[]`.

Actions and when each is dispatched:

- `selectGame(game)` — called from `GameSelect`'s card `onClick` and from `App.tsx`'s `?gamePk=` deep-link handler (via `scheduledGameFromLiveFeed`). Sets `selectedGame`, `gamePk`, and resets `liveFeed`, `currentPlay`, `lastTimecode`, `gameFeedPitches`, `error` to their empty state.
- `setLiveFeed(feed)` — called by `useLiveFeed` after the initial `fetchLiveFeed` and after every `fetchDiffPatch` that produces a non-empty diff. Also derives `currentPlay` from `feed.liveData.plays.currentPlay` and `lastTimecode` from `feed.metaData.timeStamp` in the same update.
- `setCurrentPlay(play)` — declared for direct overrides; not currently dispatched outside `setLiveFeed`'s derivation.
- `setTimecode(tc)` — called by `useLiveFeed`'s poll loop with the `metaData.timeStamp` of the folded diffPatch result.
- `setPolling(polling)` — called by `useLiveFeed` around its live-feed initialization (`true` at start, `false` in the `finally` block).
- `setActiveTab(tab)` — called by the `MiniNav` buttons in `GameScreen`. This is a mount switch: exactly one section (`ab`, `matchup`, `game`, or `logs`) is rendered at a time; the others are unmounted.
- `setGlobalScope(scope)` — the single This Game / Season switch that drives the scoped sections. In `MatchupSubTab` it is written only by the `MatchupHeader` face-card arrows, which step through `SCOPE_CYCLE` (`['thisGame', 'season']`) and wrap at both ends; the scope rewrites both face-card statlines as well as the H2H panel.
- `setMatchupPerspective(perspective)` — shared by the Matchup tab (zone grid + splits table) and the Logs tab: it swaps whether all three show the pitcher's or the batter's data. In Matchup it controls which HotCold array feeds ZonePanel/HeatMap and which side's rows appear in the Splits table (Season / vs L / vs R / RISP / Home / Away). In Logs it controls which side's season game log renders.
- `setRecentFormGames(games)` — declared but currently unused; the Recent Form panel was removed in the single-scroll redesign. Kept in the store for potential re-introduction.
- `setGameFeedPitches(pitches)` — called by `App.tsx`'s Savant game-feed effect on every `gamePk` change (success sets the rows, failure sets `[]`).
- `setError(err)` — called by `App.tsx`'s deep-link handler and by `useLiveFeed` on any fetch/poll failure.
- `setLiveScoresCache(scores, pitchers, batters)` — called by `useLiveScores` after each successful Cloud Function poll. Persists the three `ReadonlyMap`s so that returning to `GameSelect` from a game detail screen shows cached scores instantly instead of dashes.
- `reset()` — called from `FloatingGamesButton` (fixed bottom-left, rendered by `App.tsx`). Clears `selectedGame`, `gamePk`, `liveFeed`, `currentPlay`, `lastTimecode`, `isPolling`, `gameFeedPitches`, `error`, and returns `activeTab`, `globalScope`, `matchupPerspective` to their defaults, returning the app to `GameSelect`. Does **not** clear `scoreCache`/`pitcherCache`/`batterCache` so the slate repopulates instantly.

Watchability scores are cached in `gameStore` via `scoreCache`/`pitcherCache`/`batterCache`. `useLiveScores` initializes its local state from these maps on mount and writes back to the store after each successful poll, so navigating between `GameSelect` and a game detail screen preserves scores without a re-fetch dash. `useLiveSlate` similarly owns its own `games`/`loading`/`refresh` state local to `GameSelect`, independent of the store — the store holds `selectedGame` (a snapshot of one game), not the full slate array, so slate refreshes do not clobber the selected game.

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

**Exactly one vertical scroll owner per screen.** On the Live Game tabs that is `.game-page`; on the GameSelect screen — which has no sub-tab nav — it is `.game-select`. Everything above them is `overflow: hidden`. Every remaining `overflow: hidden` in the codebase is a text-truncation or clipping wrapper, not a layout container.

Breakpoints are literal `min-width` px values — there is no `--bp-*` custom property, and no `max-width` query exists anywhere:

| Breakpoint | What changes |
|---|---|
| `480px` | Stat grids go 3-up (`.stat-grid`, `.tendencies-grid`, `.season-lines`), `.stat-grid-3` goes 4-up; `.matchup__grid`/`.atbat__grid` gaps and linescore type scale up |
| `768px` | Content capped at **720px** and centered via `padding-inline: max(var(--sp-4), calc((100% - 720px) / 2))` on `.game-page`, `.game-select`; canvas wrappers gain block padding |
| `1024px` | Same mechanism capped at **960px** on `.game-page`, `.game-select` |

Centering uses `padding-inline`, not `max-width`, so the scroll owner keeps its full-bleed scrollbar gutter while its content stays within the cap.

**Known divergence from DESIGN.md §6.4.** The spec calls for a three-up game grid at `--bp-lg`. It is deliberately not implemented: three tracks of the §6.5 320px card floor plus two gaps need 976px, exceeding the 960px content cap by 16px. `repeat(3, ...)` was tried and produced 314.7px cards that ellipsis-truncated venue and pitcher names. The grid stays two-up — see the comment in `App.css` and DESIGN.md's change protocol before revisiting.

Surviving hardcoded heights. This is the complete list; additions need justification:

- `--tab-bar-h: 48px` (`src/index.css`), applied by `.ui-tab-bar`. Fixed chrome is the only thing permitted to declare `height`, and it lives in `ui.css`.
- `.a11y-only { width: 1px; height: 1px }` and the 1px `.matchup-head__vs` hairline pseudo-elements.
- `Skeleton height="44px" / "32px"` placeholders in `GameSelect.tsx`, and `SprayChart`'s `height = 274` default (no caller passes a size, so the chart owns its own aspect).

Canvas sizing. The three remaining canvases (`HeatMap`, `SprayChart`, `ZonePlot`) size their own backing store in JS from `window.devicePixelRatio` and set matching CSS pixel dimensions inline. There is no `ResizeObserver` in the codebase — a canvas keeps its intrinsic size inside a `width: 100%` centered slot rather than reacting to it. Call sites: `ZonePlot size={172}` in LiveAtBat (`LEGEND_MIN_SIZE = 172` gates whether the legend draws), `HeatMap size={150}` in `PvbPanels` (rendered by MatchupSubTab). `SprayChart` is no longer rendered by any section but remains in the codebase.

Theme tokens. `src/index.css` declares a white-first system: `--c-bg`, `--c-surface-*`, `--c-border*`, `--c-ink*`, `--c-brand-*`, semantic `--c-live`/`--c-positive`/`--c-negative`/`--c-warn`/`--c-neutral-badge`, chart `--c-heat-*`/`--c-chart-*`, 14 `--c-pitch-*` identity colors and 4 `--c-call-*` markers, plus `--sp-1..8`, `--radius-sm|base|lg|pill`, and `--font-ui`/`--font-num`. Note the spacing scale is `--sp-*`, not `--space-*`. The old dark-green `--mlb-primary`/`--mlb-bg`/`--mlb-accent`/`--mlb-text`/`--mlb-muted` tokens no longer exist.

Three files must move together, and the `theme-lockstep` guard enforces it: `--c-brand-900` (`#041e42`) must equal `index.html`'s `<meta name="theme-color">` and `vite.config.ts`'s manifest `theme_color`; `--c-bg` (`#ffffff`) must equal the manifest `background_color`.

Design guard: `npm run check:design` (`scripts/design-checks.mjs`) runs four checks and exits non-zero on any failure.

| Check | What it actually enforces |
|---|---|
| `no-canvas-hex` | No hex literal may appear in the three `src/components/Canvas/*.tsx` files or `src/utils/pitchConstants.ts`. Canvas colors must be read from tokens. |
| `theme-lockstep` | The token ↔ `theme-color` ↔ manifest agreement above. Fails on a missing value as well as a mismatch. |
| `no-fixed-budgets` | Scans every `.ts`/`.tsx`/`.css` under `src` for the deleted names `h-190 h-172 h-160 h-120 h-55 h-44 h-40 h-22 h-18` and `--pvb-content-h`. The pattern does **not** cover `h-186`, `h-150`, or `h-95`. |
| `tabular-nums` | Asserts only that the literal string `tabular-nums` appears in `src/index.css`; it does not verify that every numeric readout uses it. |

The guard is deliberately **not** wired into `npm run build`: Vercel runs `tsc -b && vite build` directly via `vercel.json`'s `buildCommand` and would bypass an npm-script gate, making the enforcement illusory. Run it manually alongside `tsc -b` and `lint`.

## 9. Maintenance Guide

**Updating league constants annually.** Edit `src/utils/leagueConstants.ts` before each new season: `LEAGUE_ERA`, `LEAGUE_WOBA`, `WOBA_SCALE`, `LEAGUE_R_PER_PA` (sourced from FanGraphs league stats) and the 30 `PARK_FACTORS` entries (sourced from ESPN park factors, full-season values — the sabermetrics functions halve them internally, do not pre-halve them here).

**Adding a new stat.** 1) Add the field to the relevant interface in `src/api/types.ts` if the API response includes it but the type doesn't yet declare it. 2) If it needs a fetcher, add it to `src/api/mlb.ts` or `src/api/savant.ts` following the existing `fetch...` pattern (throw on `!res.ok`, return the parsed/narrowed shape). 3) If it needs computation, add a pure function to `src/utils/sabermetrics.ts` following the `isValidStat`/`roundStat` null-safety pattern used by the existing `compute*` functions. 4) Wire it into the consuming component's stat-cell array (e.g. the `StatGrid` in `PitcherGameSubTab.tsx`, or the `Stat` cells in `LiveAtBat.tsx`).

**Adding a new canvas component.** Follow the pattern in `src/components/Canvas/*.tsx`: a `useRef<HTMLCanvasElement>` plus a `useEffect` that gets the 2D context, scales for `window.devicePixelRatio`, and draws. Accept a `size`/`width`/`height` prop with a default. If the component does not set an explicit CSS height on its `<canvas>` (as `ArsenalBars` does not), add a descendant clamp in `App.css` following the `.arsenal-canvas > canvas { max-height: 186px }` pattern, or the canvas will render at its raw pixel height. Read colors from the chart theme, never as hex literals — the `no-canvas-hex` guard scans `src/components/Canvas/*.tsx`.

**Adding a new tab.** Add the id to the `ActiveTab` union type in `gameStore.ts`, add a descriptor to the `NAV_ITEMS` array in `GameScreen.tsx`, add a conditional `<section>` branch inside the `.game-page` container, and add a new component file under `src/components/`. Do not give the new component a height — `.game-page` is the scroll owner and content sizes to content (see section 8). Run `npm run check:design` afterwards.

## 10. Build & Deploy

Scripts (`package.json`):

- `npm run dev` — `vite` dev server.
- `npm run build` — `tsc -b && vite build`. Type-checks via project references (`tsconfig.json` → `tsconfig.app.json`, `tsconfig.node.json`), then builds with Vite.
- `npm run lint` — `oxlint`.
- `npm run check:design` — `node scripts/design-checks.mjs`, the four layout/theme guards described in section 8. Not wired into `build` on purpose (see section 8).
- `npm run preview` — `vite preview`, serves the built `dist/`.

There is no test framework in this project and none may be added; verification is `npx tsc -b` (judge by empty stdout — it can misleadingly report exit 0 when piped through another command), `npm run build`, `npm run lint`, `npm run check:design`, and manual Playwright QA at the 390x844 viewport. Zero new npm dependencies is a hard project constraint.

**Finding a gamePk for QA.** Run `npm run qa:gamepk` to print today's slate grouped by Live / Preview / Final status with gamePks and team names. Pass a date argument (`npm run qa:gamepk -- 2025-08-21`) for a different day. Pick a Live gamePk for anything that touches `useLiveFeed`; pick a Preview gamePk to test pre-game rendering; fall back to `?gamePk=746352` (below) only for layout work when no games are live.

**Live-update behavior must be verified against production, not localhost.** Test at `https://mlb-companion.vercel.app/?gamePk=<a game that is currently Live>`, leave the tab focused and in the foreground for several minutes, and confirm in DevTools → Network that `diffPatch?startTimecode=…` requests fire every ~4s with a *different* `startTimecode` each time. A repeating `startTimecode`, or no diffPatch requests at all, means the timestamp cursor is not advancing. Two properties make localhost a poor proxy: the production service worker's Workbox rules (including the `NetworkOnly` diffPatch exclusion) only exist in a built bundle, and polling is gated on `document.hidden`, so a background or unfocused tab legitimately shows no traffic.

Layout-only QA entry point: `?gamePk=746352` — a completed 2024 Astros/Royals game (Josh Hader vs. MJ Melendez) whose Savant `gf` feed is still served, useful for rendering and layout work when no live game exists. Because the game is Final, `abstractGameState !== 'Live'` and the 4s poll loop never starts, so **this game can never validate live updating** — it always shows the same frozen pitcher/batter matchup. Do not use this gamePk as a default for general testing; use `npm run qa:gamepk` to find a live or preview game instead.

Deployment is Vercel, configured entirely by `vercel.json`: `framework: "vite"`, `buildCommand: "tsc -b && vite build"`, `outputDirectory: "dist"`, and a catch-all SPA rewrite of `/(.*)` to `/index.html` (required since there is no client-side router — the app is a single route with `?gamePk=` as its only query-string input).

PWA behavior is configured in `vite.config.ts` via `vite-plugin-pwa`: `registerType: 'autoUpdate'`, manifest with `display: 'standalone'`, `id: '/'`, `scope: '/'`, `categories: ['sports']`, and a `shortcuts` entry ("Most watchable games" → `/?sort=watchability`); `orientation: 'portrait'` was removed because the app now has desktop layouts. Workbox gained `navigateFallback: 'index.html'` and `cleanupOutdatedCaches: true`, and a new **first** runtime-caching rule gives `/watchability.json` a `StaleWhileRevalidate` strategy (cacheName `mlb-watchability`, 4 entries, 86400s TTL) so ratings render instantly and survive offline. The two pre-existing `NetworkFirst` rules for `statsapi.mlb.com` (50 entries, 300s TTL) and `baseballsavant.mlb.com` (20 entries, 600s TTL) both gained `networkTimeoutSeconds: 4`, so they fall back to cache instead of hanging on dead-air mobile connections.

Three further runtime rules exist, and rule order matters — Workbox takes the first match:

1. `**/diffPatch` on `statsapi.mlb.com` is `NetworkOnly`. Every diff URL embeds a fresh `startTimecode`, so at a 4s poll they would add ~15 unique entries a minute and evict the entire 50-entry `mlb-statsapi` LRU every few minutes — taking the schedule, feed, and player stats with it. They are also worthless once consumed. This rule must precede the general `statsapi.mlb.com` rule.
2. `/api/v1/stats?...limit=2000` (the league-wide benchmark cohorts) gets its own `StaleWhileRevalidate` bucket, `mlb-cohorts` (6 entries, 86400s). These responses are multi-megabyte and shared by every game, so they should not compete for slots with per-game requests.
3. `*.mlbstatic.com` (team logos, player headshots) is `CacheFirst`, `mlb-images` (200 entries, 7d, `cacheableResponse.statuses: [0, 200]` to permit opaque cross-origin responses). Previously uncached, so every logo fell back to its placeholder the moment signal dropped.

**Watchability data pipeline.** `.github/workflows/watchability.yml` runs `scripts/build-watchability.mjs` on ubuntu-latest with Node 24, on two crons — `0 11 * * *` (07:00 ET, picks up the finished slate and updated Elo) and `0 16 * * *` (12:00 ET, picks up late-announced probable pitchers) — plus `workflow_dispatch` for manual runs. `permissions: contents: write`; `concurrency: { group: watchability, cancel-in-progress: false }` so overlapping runs queue instead of racing. It commits `public/watchability.json` and `public/elo-state.json` as `chore(data): refresh watchability ratings`, skipping the commit when nothing changed. Because the app-side formula lives entirely in `src/utils/watchability.ts`, retuning weights is a normal `git push` deploy — it never requires re-running this pipeline.

## 11. Known Limitations

0. **The live-feed cursor is `metaData.timeStamp`; there is no `metaData.timecode`.** The `diffPatch` query parameter is named `startTimecode`, which invites the assumption that the response field is `timecode` too. It is not. Reading the nonexistent field left `lastTimecodeRef` permanently `undefined`, so `poll()` returned at its first guard and the app never issued a single diffPatch request — it appeared to load fine and then silently never updated. Related: `diffPatch` returns an **array** of RFC 6902 patch sets (`[{ diff: [{ op, path, value?, from? }] }]`) that must each be folded in order, using the `op` field; and when nothing has changed since `startTimecode` it returns a **full `LiveFeed` object** rather than an empty array, which must be detected and stored wholesale.
1. **Savant CSV has a UTF-8 BOM and every header is quoted.** `parseSavantCSV` strips `\uFEFF` first, then parses the header with the quote-aware `parseCSVLine`. A naive `.split(',')` would yield keys like `"pitch_type"` and silently garble every field.
2. **`fetchSavantBattedBalls` uses `batters_lookup[]` / `pitchers_lookup[]`, never `player_id`.** Savant ignores `player_id` on `statcast_search` and returns the entire league (~25,000 rows) instead of one player.
3. **The `statcast_search` CSV lags roughly a day** and returns zero rows for today's game. In-game bat speed therefore comes from the Savant **game feed** (`GET /gf?game_pk=N`, camelCase `batSpeed`), stored in `gameStore.gameFeedPitches`, never from the CSV endpoint.
4. **Savant-to-live-feed join key is `play_id` alone** (`savantRow.play_id === playEvent.playId`, read defensively via `playIdOf` since `PlayEvent` doesn't declare `playId`). Joining on `at_bat_number` additionally would mismatch every row by one at-bat, because the live feed's `about.atBatIndex` is 0-based while Savant's `ab_number` is 1-based.
5. **`swing_path_tilt` is absent from the game feed** (it's CSV-only and day-lagged), so the Live tab renders `—` for it by design — not a bug.
6. **Balls in play are neither `isStrike` nor `isBall`.** Pitch classification lives in `GameSubTabShared.outcomeOf`, shared by both live sub-tabs: it tests `details.isInPlay` **first** and returns `'inplay'` before any ball/strike check, and `splitPitches` then counts every non-`ball` outcome as a strike, balls in play included. Omitting the in-play case undercounts strike rate substantially (measured at ~46% vs. a true ~63% on gamePk 746352 before this was centralized). Two related deliberate choices in the same module: fouls are classified **by elimination** — anything that is not in play, a ball, a called strike, or a member of the `MISS_CALLS` set — so no Gameday call code has to be guessed; and `inStrikeZone` returns `null` when `pitchData.zone` is absent, so those pitches are excluded from the zone/chase denominators entirely rather than counted as out-of-zone.
7. **`fetchHotColdZones` splits arrive in a fixed but undocumented order, and `value` is a string.** The fetcher selects by `stat?.name === 'battingAverage'` (falling back to `splits[0]`), never by index.
8. **`fetchPitchArsenal` percentages are multiplied by 100** inside the fetcher (raw API values are fractional), so `ArsenalBars` consumes a 0-100 scale. Do not confuse this with `PitcherGameModel.buildArsenal`, which is unrelated: it derives an *in-game* pitch mix from live `PlayEvent`s grouped by `details.type.code` and emits its own `share` rate.
9. **MLB API field casing is inconsistent.** Pitchers return `strikeOuts` (capital O) and `avg` (which for pitchers is opponent batting average) — there is no `strikeouts` or `oppAvg` field.
10. **wRC+ is structurally uncomputable** and renders `—` by design: the batting endpoint publishes no wOBA and the Savant CSV only carries wOBA on batted balls.
11. **`babip_denom` is not present in the Savant CSV.** BABIP comes from the MLB Stats API's `SeasonStat.babip` field, parsed with `parseStat()`.
12. **The play-by-play endpoint is `/v1/game/{gamePk}/playByPlay` — v1, not v1.1.** `fetchPlayByPlayBatch` caps concurrency at 5 requests via `chunk(gamePks, 5)`.
13. **ERA+/wRC+ park factor uses the current game's home park** (`PARK_FACTORS[selectedGame.teams.home.team.abbreviation] ?? 1.00`) as an approximation of the player's own home park; it is not looked up per-player.
14. **`env(safe-area-inset-*)` resolves to 0 in headless Chrome**, so QA there renders a marginally taller `.app` than a real iPhone does. Because the layout is flex-based with no fixed budgets (section 8), this only changes how much of the panel is visible before scrolling begins — it is a headless-browser artifact, not a layout violation.
15. **Module-level promise caches have no TTL and are never cleared.** `usePlayerStats`, `playerStatsCache`, and `benchmarks` all dedupe via `Map`s that live for the lifetime of the page. This is what makes tab and sub-tab switching free, but it also means a starter's season line fetched at first pitch never updates for the rest of the broadcast, and nothing evicts entries on `reset()`. Failed/empty results *are* evicted so they can be retried; successful ones are frozen. `currentYear` is likewise computed once at module load, so an installed PWA left resident across a season boundary would query the wrong season.
16. **The `recentFormGames` store field is vestigial.** The Recent Form panel was removed in the single-scroll redesign. The field and `setRecentFormGames` action remain in the store but are not dispatched by any component.
17. **No test framework, no client-side router, and no backend exist in this project**, by design; do not introduce any of the three without updating this document and `vercel.json`'s SPA rewrite assumption.
18. **Manifest `screenshots` are still missing.** The repo-root `memo-desktop.png` (1280x4044) and `memo-mobile.png` (397x5288) are full-page captures whose aspect ratios exceed Chrome's 2.3 limit for install-prompt screenshots; properly-sized viewport captures are still needed to unlock the rich install prompt.
19. **`registerType: 'autoUpdate'` still reloads silently mid-session.** An update toast, so the user knows a reload just happened, would be an improvement.
20. **FanGraphs cannot be used as a watchability data source.** Their terms prohibit scraping and automated export, so SIERA, official wRC+, and Depth Charts projections are unavailable to the pipeline; every watchability input is derived from the MLB Stats API or computed locally in `scripts/build-watchability.mjs`.
21. **The watchability formula is calibrated by construction, not yet validated against realised outcomes.** Weights were chosen deliberately, not fit to data. Backtesting pregame scores against actual Excitement Index for completed games is the natural next step, and has not been done.
22. **The Elo constants in `build-watchability.mjs` are not a reproduction of FiveThirtyEight's MLB Elo.** FiveThirtyEight's MLB Elo is archived and its methodology page now redirects away; the constants here are informed by their published CSV columns but are this project's own choices.
23. **Pitcher selection previously defaulted to the scheduled probable starter.** Before the `derivePitcher` refactor, all PVB consumers (App, MatchupSubTab, LogsSubTab) used the same copy-pasted fallback `currentPlay?.matchup.pitcher ?? selectedGame.teams.home.probablePitcher ?? selectedGame.teams.away.probablePitcher ?? null`. When `currentPlay` was null — in Preview state, briefly after `selectGame` cleared it before the feed resolved, or for Final games whose feed omitted `currentPlay` — the sections showed the probable starter instead of the actual pitcher. The `derivePitcher` helper now inserts `liveFeed.linescore.defense.pitcher` as a second-priority fallback (after `currentPlay.matchup.pitcher` but before probables), which is populated as soon as the feed loads regardless of game state. The home-first probable ordering (`home ?? away`) is retained because the home pitcher is on the mound first (top of the 1st).

## 12. Watchability Score

Every game card on `GameSelect` shows a 0-100 watchability score in a `ScoreRing` (DESIGN.md §5.14) at the right of the card. It answers one question: is this game worth watching? Before first pitch the score is predictive, built from team and pitcher quality; once the game starts it crossfades into a measure of actual, in-progress excitement. Users can sort the slate by Time or Watchability.

**Architecture rule.** The nightly pipeline (`scripts/build-watchability.mjs`) emits inputs only — team ratings, pitcher ratings, Elo, stakes context. All scoring math lives in `shared/scoring.mjs`, shared between the frontend and Cloud Functions. For live and final games, the `liveScores` Cloud Function computes scores server-side (fetching winProbability + feed/live per game) and returns them to the frontend via `useLiveScores` every 15s. For preview games, the Cloud Function uses the pregame inputs from `watchability.json` with `plays=null`, returning the pure pregame score. This split means the formula can be retuned in a normal deploy; it never requires re-running the pipeline. Every league baseline (means and standard deviations for wRC+, FIP, ISO, and the rest) is computed nightly across all 30 teams — never hardcoded from outside literature — so the score is always calibrated against the current season, not a fixed historical bar.

### 12.1 Pregame score

`computePregameScore()` combines six components into a composite, then squashes it to 0-100 with `100 * sigmoid(1.15 * composite)`. Weights sum to 1.00:

| Component | Weight | What it measures |
|---|---|---|
| Pitching | 0.27 | Starter quality, blended with recent form |
| Offense | 0.20 | Team hitting production, park-adjusted |
| Competitiveness | 0.18 | How close the game is expected to be |
| Team quality | 0.14 | Overall team strength |
| Stakes | 0.12 | Playoff race and rivalry context |
| Bullpen | 0.09 | Relief pitching, weighted by blowout risk |

- **Pitching (0.27).** Each starter is scored as `zInverted(FIP) * 0.6 + z(K%) * 0.4`, blended with recent form (last-5-starts Game Score v2, see section 12.3) at `formWeight = 0.35 * clamp01(startsSampled / 5)`. The two starters combine as `0.6 * max + 0.4 * min` — one ace is reason enough to watch, so the better arm counts for more than half. Falls back to team rotation FIP when no probable pitcher has been announced yet.
- **Offense (0.20).** Mean of both teams' `z(wRC+) * 0.45 + z(ISO) * 0.30 + z(HR/G) * 0.25`, plus a park adjustment of `(parkFactor - 1) * 3`.
- **Competitiveness (0.18).** `1 - 2 * |eloWinProbability - 0.5|`, z-scored. This peaks at a coin-flip matchup, because close games are what generate high-leverage innings.
- **Team quality (0.14).** `z(elo) * 0.6 + z(winPct) * 0.4` per team, combined as `0.65 * mean + 0.35 * min` so one weak opponent still drags the score down, plus a nudge from each team's 10-game Elo trend.
- **Stakes (0.12).** `raceLeverage = clamp01(1 - min(divisionGamesBack, wildCardGamesBack) / 8)`. The composite is `race * 0.35 + bye * 0.20 + byeDuel * 0.15 + rivalryRace * 0.20 + sameDivision * 0.10`, where `bye` captures both teams' contention for a top-two seed (a first-round bye). The whole component is gated by `urgency = seasonProgress^1.5`, so a September series matters far more than the same matchup in April.
- **Bullpen (0.09).** `zInverted(bullpenFIP) * 0.65 + zInverted(blownSaveRate) * 0.35`, scaled by `blowoutRisk = 1 - sigmoid(competitivenessZ)`. A shaky bullpen costs the most when a blowout is likely and the least when the game is already close.

### 12.2 Live score and the crossfade

Once a game starts, `computeLiveScore()` takes over, weighted as `LIVE_WEIGHTS`: excitement index 0.40, leverage 0.30, closeness 0.20, drama 0.10.

`computeExcitementIndex()` implements the Baseball-Reference Excitement Index: `sum(|WPA|) / plays * 1000`. Win probability added arrives from the API in percentage points, so it's divided by 100 before summing. Component z-scores use `EGI_MEAN 33` / `EGI_SD 15` (excitement), `LI_MEAN 1.0` / `LI_SD 0.8` (leverage), and `DRAMA_MEAN 70` / `DRAMA_SD 45` (drama). A `lateness = clamp(inning / 9, 0.2, 1.3)` multiplier makes late-game leverage count for more and keeps climbing into extra innings. `dramaZ` is averaged over the last 8 plays rather than the single most recent one, so a quiet groundout doesn't collapse the score mid-rally.

The pregame and live scores never switch abruptly — they crossfade via `GameProgressState`: `preview` uses pure pregame (`liveWeight = 0`), `final` uses pure live (`liveWeight = 1`), and everything in between uses `liveWeight = clamp01(playCount / 45)`, reaching full weight around the sixth inning. The result is one number that stays meaningful throughout the game, without a noisy swing after the first few innings.

### 12.3 Tiers

`tierFor()` buckets the final score into a `WatchabilityTier`: `elite` (≥80), `great` (65-79), `good` (50-64), `average` (35-49), `skip` (<35). These drive both the `ScoreRing` stroke color and its accessible label (DESIGN.md §5.14).

"Game Score v2" (Tango's version, used for recent starter form) is `40 + 2*outs + K - 2*BB - 2*H - 3*R - 6*HR`, computed over a pitcher's last 5 starts with linear recency weighting — the newest start counts 5x the oldest.

### 12.4 Where the numbers come from

`scripts/build-watchability.mjs` runs nightly (section 10) against the MLB Stats API (`https://statsapi.mlb.com/api/v1`):

- `/teams?sportId=1` for the 30-team roster.
- `/teams/stats?stats=season&group=hitting|pitching&sportId=1&season={yr}` — all 30 teams' hitting and pitching lines in one call each.
- `/teams/stats?stats=statSplits&sitCodes=rp,sp&group=pitching&sportId=1&season={yr}` for the bullpen-vs-rotation FIP split. This bulk endpoint truncates near 50 rows, so the pipeline falls back to the per-team `/teams/{id}/stats?...` form for any team missing an `sp` or `rp` row.
- `/standings?leagueId=103,104&season={yr}&standingsTypes=regularSeason` for games-back and stakes context.
- The full `gameType=R` season schedule, replayed game-by-game to build Elo.
- `/schedule?...&hydrate=probablePitcher,team` for the day's slate.
- `/people/{id}/stats?stats=gameLog&group=pitching` per probable starter, for recent-form Game Score.

All of it runs through a bounded-concurrency `mapLimit` helper (5 concurrent requests) with 3 retries and backoff. A verified run against a real slate produced `30 teams, 1911 completed games, 9 on slate`, with these league baselines: wRC+ mean 100.0 / sd 6.01, ISO .157 / .012, rotation FIP 4.264 / .448, bullpen FIP 4.215 / .388, blown-save rate .360 / .085, starter Game Score 50.82 / 6.00, Elo 1500 / 30.25, win% .4999 / .061.

**Elo.** `ELO_START 1500`, `ELO_K 4`, `ELO_HFA 24`, `ELO_CARRYOVER 0.75` (teams regress 25% toward the mean at season rollover). K is small on purpose: a single MLB game is weak evidence — 4 Elo points is roughly a .0058 win-percentage shift, about 0.93 wins over a 162-game season. The margin-of-victory multiplier, `log(|margin| + 1) * (2.2 / (winnerEdge * 0.001 + 2.2))`, follows FiveThirtyEight's published approach to correct for favorite autocorrelation. There is deliberately **no pitcher-adjusted Elo**: starter quality is already its own weighted component above, so folding it into Elo would double-count it.

**wRC+** is derived as `100 * (1 + (wOBA - lgWOBA) / (WOBA_SCALE * LEAGUE_R_PER_PA))`, algebraically identical to the canonical FanGraphs formula at a park factor of 1. Park factor is deliberately excluded here — the pregame scoring formula (12.1) applies its own park term, so folding one into wRC+ as well would apply it twice. wOBA itself uses linear weights uBB .69, HBP .72, 1B .89, 2B 1.27, 3B 1.62, HR 2.10, scaled by `WOBA_SCALE 1.24` against `LEAGUE_R_PER_PA 0.12`.

**Live plays** come from `GET /v1/game/{gamePk}/winProbability` (section 4), fetched by the `liveScores` Cloud Function for all live and final games. The Cloud Function polls every 15s when called by `useLiveScores`, replacing the previous client-side `useWatchability` which polled every 30s per game.

### 12.5 Regenerating the data

Run `node scripts/build-watchability.mjs [YYYY-MM-DD]` (date defaults to today) to write `public/watchability.json` and `public/elo-state.json` locally. In production this happens automatically via `.github/workflows/watchability.yml` (section 10); there is normally no need to run it by hand except for local QA of a specific date's slate.

**This score has not been validated against realised outcomes.** The weights above are a calibrated-by-construction starting point, not a fit to historical Excitement Index data. See Known Limitations, items 21-22.
