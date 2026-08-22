# AGENTS.md — mlb-companion

## Stack

- React 19 + TypeScript (strict) + Vite 8
- zustand for state management
- PWA (service worker, manifest)
- Deploy: Vercel
- No test framework (hard constraint — do not add one)
- Zero new dependencies (hard constraint — do not add packages)

## Reference Documentation

The following docs are the source of truth and MUST be updated in the same commit as any code change that affects them:

| Doc | Sections to keep current |
|-----|--------------------------|
| `README.md` §2 | Architecture Map — every `src/` module (api, hooks, utils, store, components) must have an entry with exports, key types, and importers |
| `README.md` §4 | API Endpoints Reference — every exported fetch function in `api/*.ts` must be listed |
| `README.md` §6 | State Management — `gameStore.ts` shape, actions, and defaults |
| `README.md` §5 | Component Hierarchy — parent-child wiring for all components |
| `README.md` §3 | Data Flow — preload chain, polling, caching strategy |
| `README.md` §7 | Sabermetric Computations — formulas for every function in `sabermetrics.ts` |
| `README.md` §12 | Watchability Score — formula for every function in `watchability.ts` |
| `DESIGN.md` §2 | Color system — all hex values in `chartTheme.ts` must match |
| `DESIGN.md` §5 | Percentile bands — heat ramp values must match `chartTheme.ts` `HEAT_RAMP` |
| `DESIGN.md` §9 | Change protocol — update when the lint-guard or design-check workflow changes |
| `docs/` | Any plan docs (e.g. `LIVE_NOTIFICATIONS_PLAN.md`) must reflect current implementation status |

## Lint & Type Checks

- `npx tsc -b` — TypeScript type check (run after code changes)
- `npm run check:design` — design-system lint guard (run after chart/theme/CSS changes)
- No test suite exists; verify changes manually or via type checking

## Architecture Notes

- `src/api/` — API clients (mlb.ts, savant.ts, benchmarks.ts, playerStatsCache.ts, types.ts)
- `src/hooks/` — React hooks (useLiveFeed, usePlayerStats, useCareerMatchupStats, useWatchability, useStatBenchmarks)
- `src/utils/` — Pure utilities (sabermetrics, watchability, derivePitcher, chartTheme, gameDay, mlbAssets, percentile, pitchConstants, leagueConstants)
- `src/store/` — Single zustand store (gameStore.ts)
- `src/components/` — UI components organized by feature (GameSelect, LiveAtBat, LiveGame, PitcherVsBatter, Canvas, ui)
- `scripts/design-checks.mjs` — Enforces no raw hex literals in Canvas components; all colors must come from `chartTheme.ts`

## Git Policy

Follow the global `~/.config/opencode/AGENTS.md` auto-commit and push policy:
- Atomic commits (one per logical change)
- Update documentation in the same commit as the code change
- Push after committing
