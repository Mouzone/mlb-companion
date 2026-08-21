# Discord Notifications Plan

Discord webhook notifications when a game's watchability score reaches 65+
(Great or Elite tier). Two delivery paths: a 10-minute cron for when the app
is closed, and an HTTP function for ~30s real-time when the app is open.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ EXISTING (unchanged)                                             │
│                                                                  │
│  GitHub Actions ──cron 07:00/12:00 ET──▶ build-watchability.mjs │
│         │                                       │                │
│         │ git commit                            ▼                │
│         └────────────▶ public/watchability.json ◀── served by    │
│                         public/elo-state.json     Vercel (static) │
│                                                  │               │
│  Browser ──fetch /watchability.json──────────────┘               │
│         ──poll winProbability (30s)──▶ statsapi.mlb.com          │
│         ──computeWatchability() in browser                       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ NEW                                                              │
│                                                                  │
│  Firebase Cloud Functions (free tier)                            │
│  ├── notify-pregame  ──cron 10min──▶ fetch /watchability.json   │
│  │                                    compute pregame scores     │
│  │                                    query Firestore for dedup  │
│  │                                    POST Discord webhook       │
│  │                                                               │
│  ├── notify-live     ──cron 10min──▶ for each Live game:        │
│  │                                    fetch winProbability       │
│  │                                    fetch /watchability.json   │
│  │                                    computeWatchability()      │
│  │                                    query Firestore for dedup  │
│  │                                    POST Discord webhook       │
│  │                                                               │
│  └── notify          ──HTTP POST───◀ browser (app open)         │
│                                    { gamePk, score, tier, ... } │
│                                    query Firestore for dedup    │
│                                    POST Discord webhook         │
│                                                                  │
│  Firestore: notifications/{date}/{gamePk}                        │
│    crossingNotified: boolean                                     │
│    lastNotifiedScore: number                                     │
│    pregameNotified: boolean                                      │
└──────────────────────────────────────────────────────────────────┘
```

### Why Firebase Cloud Functions

| Factor | Vercel Hobby | Firebase Free Tier |
|---|---|---|
| Cron < 1 day | Only daily cron free; $20/mo Pro for 10-min | Scheduled functions at any frequency |
| Serverless functions | Included (limited) | Included (2M invocations/mo) |
| Document store | Would need Firestore anyway | Firestore 50K reads / 20K writes per day |
| Cold starts | Yes | Yes, but 10-min cadence keeps warm |

GitHub Actions stays for the nightly build — git commit is native, batch job
is purpose-built for CI, and the free tier has no issue with the 60+ API calls
the build makes.

### Why not just GitHub Actions cron for notifications too?

GitHub Actions free tier: 2,000 minutes/month. A 10-minute cron running
~12 hours/day = 6 runs/hour × 12 = 72 runs/day × ~30 days = ~2,160 runs/month.
Each run takes ~30s = ~1,080 minutes. That eats half the free tier on
notifications alone. Firebase free tier handles this with no minute budget.

## Part 1 — Extract Shared Scoring Module

The pure scoring math in `src/utils/watchability.ts` has zero imports. The
Cloud Functions need the same math. Rather than duplicate it, extract to a
shared `.mjs` module.

### New: `shared/scoring.mjs`

JSDoc-typed plain JS (no TypeScript compilation needed — importable by both
`.mjs` functions and `.ts` frontend via a hand-written `.d.ts`).

Moves from `watchability.ts`:
- All pure helpers: `clamp`, `clamp01`, `sigmoid`, `z`, `zInverted`,
  `weightedMean`, `squash`
- All pregame sub-term functions: `starterQuality`, `pitchingTerm`,
  `offenseTerm`, `competitivenessRaw`, `teamQualityTerm`, `bullpenTerm`,
  `stakesTerm`
- `computePregameScore`, `computeExcitementIndex`, `computeLiveScore`,
  `computeWatchability`, `tierFor`, `eloWinProbability`
- All constants: `WEIGHTS`, `LIVE_WEIGHTS`, `EGI_MEAN`, `EGI_SD`, `LI_MEAN`,
  `LI_SD`, `DRAMA_MEAN`, `DRAMA_SD`, `LIVE_SATURATION_PLAYS`, `SQUASH_K`,
  `HOME_FIELD_ELO`

### New: `shared/scoring.d.ts`

TypeScript declarations so `watchability.ts` can import from the `.mjs` with
full type safety. Mirrors the exact interfaces currently in `watchability.ts`:
`Baseline`, `LeagueBaseline`, `TeamRating`, `PitcherRating`, `GameInputs`,
`PayloadGame`, `WatchabilityPayload`, `WinProbabilityPlay`, `ScoreBreakdown`,
`WatchabilityResult`, `WatchabilityTier`, `GameProgressState`.

### Modify: `src/utils/watchability.ts`

Becomes a thin re-export layer:
```ts
export {
  computePregameScore, computeExcitementIndex, computeLiveScore,
  computeWatchability, tierFor, eloWinProbability, WEIGHTS, HOME_FIELD_ELO,
} from '../../shared/scoring.mjs'

export type {
  Baseline, LeagueBaseline, TeamRating, PitcherRating, GameInputs,
  PayloadGame, WatchabilityPayload, WinProbabilityPlay, ScoreBreakdown,
  WatchabilityResult, WatchabilityTier, GameProgressState,
} from '../../shared/scoring.d.ts'
```

All existing imports from `useWatchability.ts`, `ScoreRing.tsx`, etc. remain
unchanged — they import from `utils/watchability` and that file still exports
everything.

### Modify: `src/utils/leagueConstants.ts`

No changes needed. Park factors stay client-side only. The Cloud Functions
will import `PARK_FACTORS` from `shared/scoring.mjs` via a re-export, or more
simply, the functions will inline the park factor lookup since they already
have the payload game's `home.abbreviation`.

**Decision:** Move `PARK_FACTORS` and the four league constants into
`shared/scoring.mjs` as well, then re-export from `leagueConstants.ts`. This
eliminates the drift risk with `build-watchability.mjs`'s hardcoded
`WOBA_SCALE` and `LEAGUE_R_PER_PA`.

### Modify: `scripts/build-watchability.mjs`

Replace the hardcoded `WOBA_SCALE = 1.24` and `LEAGUE_R_PER_PA = 0.12` (lines
48-49) with imports from `../shared/scoring.mjs`. This closes the drift risk.
The `FIP_CONSTANT = 3.15` duplication with `sabermetrics.ts` is left as-is for
now (different calling conventions — see analysis in conversation).

### Vite Config

Vite needs to know that `shared/` is outside `src/` but should be bundled:
```ts
// vite.config.ts — server.fs.allow already includes project root by default
// No change needed for dev. For build, Vite resolves relative imports fine.
```

The import path `../../shared/scoring.mjs` from `src/utils/watchability.ts`
resolves to `<root>/shared/scoring.mjs`. Vite handles this natively.

## Part 2 — Firebase Project Setup

### One-time manual steps

```bash
# Install Firebase CLI (if not already)
brew install firebase-tools

# Login
firebase login

# Create a new project (or use an existing one)
firebase projects:create mlb-companion

# Initialize in the repo root — select Functions + Firestore
firebase init
# - Select: Functions, Firestore
# - Project: mlb-companion
# - Language: TypeScript
# - Functions source: functions/
# - Firestore rules: firestore.rules
# - Firestore indexes: firestore.indexes.json
```

### `firebase.json`

```json
{
  "functions": {
    "source": "functions",
    "runtime": "nodejs22",
    "predeploy": ["npm --prefix functions run build"]
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

### Secrets (via Firebase CLI)

```bash
firebase functions:secrets:set DISCORD_WEBHOOK_URL
# Paste the Discord webhook URL

firebase functions:secrets:set WATCHABILITY_JSON_URL
# Paste the Vercel URL: https://mlb-companion.vercel.app/watchability.json
```

## Part 3 — Cloud Functions

All in `functions/src/`. Each function is a single file. The entry point
`index.ts` exports them.

### `functions/src/discord.ts`

Discord webhook sender. Builds rich embeds with tier-based colors.

```ts
const TIER_COLORS: Record<string, number> = {
  elite: 0xe74c3c, // red
  great: 0xe67e22, // orange
  good:  0xf1c40f, // yellow
}

interface NotificationPayload {
  gamePk: number
  date: string
  awayTeam: string
  homeTeam: string
  awayAbbr: string
  homeAbbr: string
  score: number
  tier: string
  pregame: number
  live: number | null
  liveWeight: number
  state: 'preview' | 'live' | 'final'
  trigger: 'pregame' | 'crossing' | 'jump'
  previousScore?: number
  inning?: number | null
}

export async function sendDiscordNotification(
  webhookUrl: string,
  payload: NotificationPayload,
): Promise<void>
```

Embed shape:
- **Title:** `{awayAbbr} @ {homeAbbr}` — with score if live/final
- **Color:** tier color (red/orange/yellow)
- **Description:** trigger-specific message (see below)
- **Fields:** Watchability score, Pregame projection, Live score (if applicable)
- **Footer:** `MLB Companion · {date}`

### Trigger messages

| Trigger | Message |
|---|---|
| `pregame` | `Pre-game watchability: {score} ({tier}). {awayTeam} @ {homeTeam}` |
| `crossing` | `Watchability crossed 65! {score} ({tier}) — {awayAbbr} @ {homeAbbr}, Inning {inning}` |
| `jump` | `Watchability jumped +{delta} to {score} ({tier}) — {awayAbbr} @ {homeAbbr}, Inning {inning}` |

### `functions/src/notify-pregame.ts`

Scheduled function, runs every 10 minutes. Checks pre-game scores for today's
slate.

```ts
import { onSchedule } from 'firebase-functions/v2/scheduler'

export const notifyPregame = onSchedule(
  {
    schedule: 'every 10 minutes',
    timeZone: 'America/New_York',
    secrets: ['DISCORD_WEBHOOK_URL', 'WATCHABILITY_JSON_URL'],
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (event) => { ... }
)
```

Logic:
1. Fetch `watchability.json` from Vercel (the `WATCHABILITY_JSON_URL` secret)
2. For each game in `payload.games`:
   - Compute pregame score using `shared/scoring.mjs` (need park factor —
     inline `PARK_FACTORS` from the shared module)
   - If score >= 65 and `pregameNotified` is false in Firestore:
     - Send Discord notification (trigger: `pregame`)
     - Set `pregameNotified: true`, `lastNotifiedScore: score` in Firestore
3. Skip games whose status is already Live or Final (check MLB schedule API
   for current status — or simply skip if the game's start time has passed)

**Why not just check all games?** The nightly build runs at 07:00 and 12:00 ET.
A game at 1:05 PM ET won't be in the payload until the 12:00 build. The
10-minute cron catches anything that was added late and sends the pre-game
notification before first pitch.

### `functions/src/notify-live.ts`

Scheduled function, runs every 10 minutes. Checks live scores for games in
progress.

```ts
export const notifyLive = onSchedule(
  {
    schedule: 'every 10 minutes',
    timeZone: 'America/New_York',
    secrets: ['DISCORD_WEBHOOK_URL', 'WATCHABILITY_JSON_URL'],
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (event) => { ... }
)
```

Logic:
1. Fetch today's schedule from `statsapi.mlb.com/api/v1/schedule?sportId=1&date={today}`
2. Filter to games with `abstractGameState === 'Live'`
3. Fetch `watchability.json` for inputs
4. For each live game:
   - Fetch `winProbability` from `statsapi.mlb.com/api/v1/game/{gamePk}/winProbability`
   - Compute `computeWatchability(inputs, baseline, plays, 'live')`
   - Check Firestore document `notifications/{today}/{gamePk}`:
     - **Crossing trigger:** score >= 65 and `crossingNotified` is false
       → send notification, set `crossingNotified: true`
     - **Jump trigger:** score >= 65 and `lastNotifiedScore` exists and
       `score - lastNotifiedScore >= 10` and `lastNotifiedScore >= 65`
       → send notification (trigger: `jump`, `previousScore`)
     - Update `lastNotifiedScore: score` on every run

### `functions/src/notify.ts`

HTTP function, callable from the browser. The fast path — ~30s latency when
the app is open, vs 10 minutes for the cron.

```ts
import { onRequest } from 'firebase-functions/v2/https'

export const notify = onRequest(
  {
    secrets: ['DISCORD_WEBHOOK_URL'],
    memory: '128MiB',
    timeoutSeconds: 10,
    cors: true,  // allows browser to call directly
  },
  async (req, res) => { ... }
)
```

Logic:
1. Parse POST body: `{ gamePk, score, tier, awayTeam, homeTeam, awayAbbr,
   homeAbbr, state, inning, pregame, live, liveWeight, date }`
2. Check Firestore for dedup (same logic as `notify-live`)
3. If a notification should be sent, POST to Discord webhook
4. Return `{ sent: boolean, reason: string }`

**Why does the browser send the computed score?** Because `useWatchability`
already computes it every 30 seconds for all live games. The function doesn't
need to re-fetch anything — it just does dedup + Discord POST. This keeps the
HTTP function fast (sub-second cold start path) and avoids double-fetching
the MLB API.

### `functions/src/index.ts`

```ts
export { notifyPregame } from './notify-pregame'
export { notifyLive } from './notify-live'
export { notify } from './notify'
```

### `functions/package.json`

```json
{
  "name": "mlb-companion-functions",
  "type": "module",
  "main": "lib/index.js",
  "scripts": {
    "build": "tsc",
    "serve": "firebase emulators:start --only functions,firestore",
    "deploy": "firebase deploy --only functions,firestore:rules"
  },
  "dependencies": {
    "firebase-admin": "^13",
    "firebase-functions": "^6"
  },
  "devDependencies": {
    "typescript": "^6"
  }
}
```

This is a separate package.json inside `functions/` — the frontend's "zero new
npm dependencies" constraint applies to `src/`, not to the serverless
functions which need Firebase SDKs.

### `functions/tsconfig.json`

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "lib",
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

## Part 4 — Frontend Threshold Detection

### New: `src/hooks/useNotifications.ts`

A hook that watches the `scores` Map from `useWatchability` and calls the
Firebase HTTP function when a game crosses 65 or jumps +10.

```ts
interface UseNotificationsOptions {
  scores: ReadonlyMap<number, WatchabilityResult>
  games: readonly ScheduledGame[]
  enabled: boolean  // gated by a user toggle or env var
}

export function useNotifications(options: UseNotificationsOptions): void
```

Logic:
1. Maintains a `useRef` Map of `lastNotifiedScore` per gamePk (in-memory
   dedup, separate from Firestore — the HTTP function does the authoritative
   Firestore check)
2. On each `scores` change, for each game:
   - If score >= 65 and `lastNotifiedScore` was < 65 (or undefined):
     → POST to Firebase HTTP function (crossing trigger)
   - If score >= 65 and `lastNotifiedScore` >= 65 and
     `score - lastNotifiedScore >= 10`:
     → POST to Firebase HTTP function (jump trigger)
   - Update `lastNotifiedScore` ref
3. Swallows errors silently (notifications are best-effort; never block UI)

**Why in-memory dedup AND Firestore dedup?** The browser may be backgrounded
and miss score changes. When it resumes, it could see a score that's already
65+ but was already notified by the cron. The Firestore check in the HTTP
function is the authoritative dedup — the in-memory check just prevents
redundant HTTP calls within a session.

### Integration in `GameSelect.tsx`

```tsx
const { scores } = useWatchability(games)
useNotifications({ scores, games, enabled: import.meta.env.VITE_NOTIFICATIONS_ENABLED === 'true' })
```

The `VITE_NOTIFICATIONS_ENABLED` env var lets the feature be toggled without
code changes. Set it in Vercel project settings.

### Notification function URL

The Firebase HTTP function URL will be:
`https://us-central1-mlb-companion.cloudfunctions.net/notify`

This is passed to the frontend via `VITE_NOTIFY_FUNCTION_URL` env var.

## Part 5 — Firestore Schema

### Collection: `notifications`

Document path: `notifications/{date}/{gamePk}`

```ts
interface NotificationDoc {
  // Date string YYYY-MM-DD (the game's date, not when the notification fired)
  // Used as the document ID at the collection-group level

  // Pre-game notification (fired once when pregame score >= 65)
  pregameNotified: boolean
  pregameScore: number | null

  // Crossing notification (fired once when live score first crosses 65)
  crossingNotified: boolean

  // Jump tracking (updated every cron run while game is live)
  lastNotifiedScore: number
  lastNotifiedAt: Timestamp

  // Metadata
  gamePk: number
  awayAbbr: string
  homeAbbr: string
  createdAt: Timestamp
}
```

### `firestore.rules`

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /notifications/{date}/{gamePk} {
      // Only Cloud Functions can read/write (using Admin SDK)
      // No client access — the browser never touches Firestore directly
      allow read, write: if false;
    }
  }
}
```

### `firestore.indexes.json`

No composite indexes needed — all queries are direct document lookups by
`{date}/{gamePk}` path.

### TTL / Cleanup

Notifications accumulate over the season. Options:
- **Manual:** Delete old date collections at season end
- **Automatic:** A weekly cron function deletes documents older than 7 days

**Decision:** Start with manual cleanup. The documents are tiny (~200 bytes
each, ~15 games/day = ~3KB/day, ~100KB/season). Not worth a cleanup function
until the volume matters.

## Part 6 — Environment Setup

### Firebase Secrets

```bash
firebase functions:secrets:set DISCORD_WEBHOOK_URL
firebase functions:secrets:set WATCHABILITY_JSON_URL
# Value: https://mlb-companion.vercel.app/watchability.json
```

### Vercel Environment Variables

| Variable | Value | Where |
|---|---|---|
| `VITE_NOTIFICATIONS_ENABLED` | `true` | Vercel Project Settings → Environment Variables |
| `VITE_NOTIFY_FUNCTION_URL` | `https://us-central1-mlb-companion.cloudfunctions.net/notify` | Same |

### Discord Webhook

Create in Discord: Server Settings → Integrations → Webhooks → New Webhook
- Name: `MLB Companion`
- Channel: wherever you want notifications
- Copy URL → set as `DISCORD_WEBHOOK_URL` Firebase secret

## Part 7 — File Manifest

### New files (16)

| Path | Purpose |
|---|---|
| `shared/scoring.mjs` | Pure scoring math, extracted from `watchability.ts` |
| `shared/scoring.d.ts` | TypeScript types for the shared module |
| `functions/package.json` | Functions package (firebase-admin, firebase-functions) |
| `functions/tsconfig.json` | Functions TS config |
| `functions/src/index.ts` | Entry point, exports all functions |
| `functions/src/discord.ts` | Discord webhook sender + embed builder |
| `functions/src/notify-pregame.ts` | Scheduled: pre-game score check (10-min) |
| `functions/src/notify-live.ts` | Scheduled: live score check (10-min) |
| `functions/src/notify.ts` | HTTP: real-time from browser |
| `functions/src/scoring.ts` | Re-export from `../../shared/scoring.mjs` (type-safe wrapper) |
| `firebase.json` | Firebase config (functions + firestore) |
| `firestore.rules` | Firestore security rules |
| `firestore.indexes.json` | Firestore indexes (empty, no composite needed) |
| `src/hooks/useNotifications.ts` | Frontend threshold detection hook |
| `.gitignore` additions | `functions/lib/`, `functions/node_modules/`, `.firebase/` |
| `docs/NOTIFICATIONS_PLAN.md` | This document |

### Modified files (4)

| Path | Changes |
|---|---|
| `src/utils/watchability.ts` | Re-export from `shared/scoring.mjs` instead of defining inline |
| `src/utils/leagueConstants.ts` | Re-export `PARK_FACTORS` + 4 constants from `shared/scoring.mjs` |
| `scripts/build-watchability.mjs` | Import `WOBA_SCALE`, `LEAGUE_R_PER_PA` from `shared/scoring.mjs` |
| `src/components/GameSelect/GameSelect.tsx` | Add `useNotifications` hook call |

### Unchanged (key files)

| Path | Why unchanged |
|---|---|
| `vite.config.ts` | Relative imports from `shared/` resolve natively |
| `vercel.json` | Still pure static SPA — Firebase handles the backend |
| `.github/workflows/watchability.yml` | Nightly build unchanged |
| `package.json` (root) | No new frontend deps |
| `src/hooks/useWatchability.ts` | Already polls all live games; scores Map feeds notifications |
| `src/api/mlb.ts` | `fetchWinProbability` already exists, used by functions too (via direct fetch) |

## Part 8 — Implementation Order

1. **Extract shared scoring module**
   - Create `shared/scoring.mjs` with all pure math + constants from
     `watchability.ts` and `leagueConstants.ts`
   - Create `shared/scoring.d.ts` with all type declarations
   - Rewrite `watchability.ts` as re-export layer
   - Rewrite `leagueConstants.ts` as re-export layer
   - Update `build-watchability.mjs` imports
   - Verify: `npx tsc -b`, `npm run lint`, `npm run build`,
     `npm run check:design` — all must pass
   - Manually verify scores in browser match before/after

2. **Create Firebase project**
   - `firebase init` in repo root
   - Select Functions (TypeScript) + Firestore
   - Set secrets via CLI

3. **Implement `functions/src/discord.ts`**
   - Embed builder with tier colors
   - Webhook POST sender
   - Test with a hardcoded payload locally

4. **Implement `functions/src/notify.ts`** (HTTP function)
   - Parse request body
   - Firestore dedup check
   - Call `discord.sendDiscordNotification`
   - Deploy: `firebase deploy --only functions:notify`
   - Test with curl

5. **Implement `functions/src/notify-pregame.ts`**
   - Fetch `watchability.json`
   - Compute pregame scores (using shared scoring module)
   - Firestore dedup
   - Deploy and test

6. **Implement `functions/src/notify-live.ts`**
   - Fetch schedule, filter live games
   - Fetch winProbability for each
   - Compute live watchability
   - Crossing + jump triggers
   - Firestore dedup
   - Deploy and test

7. **Implement `src/hooks/useNotifications.ts`**
   - In-memory dedup ref
   - POST to Firebase HTTP function
   - Silent error handling

8. **Integrate in `GameSelect.tsx`**
   - Add `useNotifications` call
   - Set `VITE_NOTIFICATIONS_ENABLED` and `VITE_NOTIFY_FUNCTION_URL` in
     `.env.local` for dev testing

9. **Deploy Firestore rules**
   - `firebase deploy --only firestore:rules`

10. **End-to-end test**
    - Set Discord webhook
    - Trigger `notify-pregame` via `firebase functions:shell`
    - Open app, verify crossing notification fires
    - Wait for a live game, verify cron fires

## Part 9 — Verification

### Build checks (run after each step that touches frontend code)

```bash
npx tsc -b          # TypeScript compilation
npm run lint        # oxlint
npm run build       # tsc -b && vite build
npm run check:design  # design-checks.mjs (4 checks)
```

### Functions checks

```bash
cd functions && npx tsc --noEmit  # Functions type-check
```

### Manual QA

1. **Scoring module extraction:** Open app, verify watchability scores on
   game cards are identical to before the refactor
2. **HTTP function:** `curl -X POST <function-url> -H 'Content-Type: application/json' -d '{...}'`
   → verify Discord message appears
3. **Pre-game cron:** `firebase functions:shell` → call `notifyPregame()` →
   verify Discord message for games >= 65
4. **Live cron:** Same, call `notifyLive()` during a live game
5. **Frontend hook:** Open app during a live game that crosses 65 → verify
   Discord message within ~30s
6. **Dedup:** Run the same cron twice → verify no duplicate notification
7. **Jump trigger:** During a live game already above 65, wait for a +10
   swing → verify jump notification fires

### iOS PWA limitation

iOS Safari kills JS when a PWA is backgrounded. The frontend `useNotifications`
hook only fires while the app is in the foreground. The 10-minute cron is the
safety net for when the app is closed. This is an acceptable tradeoff — the
cron catches everything within 10 minutes, and the frontend path provides
near-real-time when the user is actively watching.

## Cost Analysis

### Firebase Free Tier

| Resource | Free quota | Expected usage |
|---|---|---|
| Function invocations | 2M/month | ~6K/month (10-min cron × 12hr × 30 days × 2 + browser calls) |
| Function compute time | 400K GB-sec/month | ~3K GB-sec (256MiB × 30s × 360 runs) |
| Firestore reads | 50K/day | ~30/day (15 games × 2 cron runs) |
| Firestore writes | 20K/day | ~15/day |
| Firestore storage | 1 GiB | ~100KB/season |

All well within free tier. No cost expected.

### GitHub Actions

The nightly build workflow is unchanged. 2 runs/day × ~60s = ~60 minutes/month.
Well within the 2,000 free minutes.

## Future Considerations

- **Backtesting:** The README notes the formula is "calibrated by
  construction, not yet validated against realised outcomes." Notification
  thresholds could be tuned after backtesting.
- **User preferences:** Currently all-or-nothing. Could add per-tier
  thresholds (e.g., only Elite) via a settings UI.
- **Multi-channel:** Discord webhook is the first target. The `discord.ts`
  module could be abstracted to support Slack, Telegram, etc.
- **Live play context:** The `notify` HTTP function could accept additional
  context (e.g., "Mason Miller entering 9th") from the browser, which has the
  full live feed. The browser knows the current play; the cron doesn't.
