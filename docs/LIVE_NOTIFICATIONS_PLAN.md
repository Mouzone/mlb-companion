# Live Notifications Plan

Telegram Bot notifications when a game's watchability score reaches 65+
(Great or Elite tier). Two serverless functions handle everything — no
frontend notification code needed. A 10-minute cron covers pregame alerts,
and a 1-minute cron with a 15-second in-function polling loop covers live
games with near-real-time updates.

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
│         ──poll winProbability (15s for live)──▶ statsapi.mlb.com │
│         ──computeWatchability() in browser (UI display only)     │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ NEW                                                              │
│                                                                  │
│  Firebase Cloud Functions (free tier)                            │
│  ├── notify-pregame  ──cron 10min──▶ fetch /watchability.json   │
│  │                                    compute pregame scores     │
│  │                                    query Firestore for dedup  │
│  │                                    POST Telegram sendMessage  │
│  │                                                               │
│  ├── notify-live     ──cron 1min───▶ fetch MLB schedule         │
│  │                                    if no live games → exit    │
│  │                                    poll loop (every 15s):     │
│  │                                      fetch winProbability     │
│  │                                      fetch /watchability.json │
│  │                                      computeWatchability()    │
│  │                                      query Firestore dedup    │
│  │                                      POST Telegram sendMessage│
│  │                                    exit before next cron      │
│  │                                                               │
│  Firestore: notifications/{date}/{gamePk}                        │
│    crossingNotified: boolean                                     │
│    lastNotifiedScore: number                                     │
│    pregameNotified: boolean                                      │
└──────────────────────────────────────────────────────────────────┘
```

### Why Telegram

| Factor | Telegram Bot | Discord Webhook | Pushover | Twilio SMS |
|---|---|---|---|---|
| Cost | Free | Free | $5 one-time | ~$5/mo + per-msg |
| iOS push reliability | Very good | Can lag | Best (emergency priority) | Native |
| Setup complexity | Low (BotFather) | Low | Low | High (10DLC registration) |
| API docs | Excellent | Minimal | Good | Good |
| Rate limits | 30 msg/sec | 50 req/sec (webhook) | 10K msg/mo (free tier) | Per-carrier |
| Inline buttons | Yes (URL deep-link) | Yes (but limited on mobile) | No | N/A |
| Message formatting | HTML | Markdown embeds | Plain text | Plain text |

Telegram was chosen for its combination of free tier, excellent
documentation, reliable iOS push delivery, and inline keyboard buttons
that deep-link to the PWA.

### Why Firebase Cloud Functions

| Factor | Vercel Hobby | Firebase Free Tier |
|---|---|---|
| Cron < 1 day | Only daily cron free; $20/mo Pro for sub-daily | Scheduled functions at any frequency |
| Serverless functions | Included (limited) | Included (2M invocations/mo) |
| Document store | Would need Firestore anyway | Firestore 50K reads / 20K writes per day |
| Cold starts | Yes | Yes, but 1-min cadence keeps warm during games |

GitHub Actions stays for the nightly build — git commit is native, batch job
is purpose-built for CI, and the free tier has no issue with the 60+ API calls
the build makes.

### Why not just GitHub Actions cron for notifications too?

GitHub Actions free tier: 2,000 minutes/month. A 1-minute cron running
~12 hours/day = 720 runs/day × ~30 days = ~21,600 runs/month. Each run
takes ~1-60s (depending on live games) = ~5,000+ minutes. That blows past
the free tier on notifications alone. Firebase free tier handles this with
no minute budget.

### Why no frontend notification path?

The original plan included an HTTP function callable from the browser for
~30s real-time alerts. With the 1-minute cron + 15s polling loop, the cron
path alone achieves ~15s latency — fast enough that a separate HTTP path
is redundant. Dropping it removes:

- `functions/src/notify.ts` (HTTP function)
- `src/hooks/useNotifications.ts` (frontend hook)
- `GameSelect.tsx` integration
- `VITE_NOTIFY_FUNCTION_URL` + `VITE_NOTIFICATIONS_ENABLED` env vars
- Duplicate in-memory + Firestore dedup logic

The frontend's `useWatchability` hook continues to compute scores for UI
display only. No notification logic runs in the browser.

### Why 15-second polling inside the function?

MLB's `winProbability` endpoint updates per play (~20-60s between updates
in real games). Polling faster than 15s is pointless — the data doesn't
change between plays. Polling slower than 15s risks missing a score
crossing for up to a full minute. 15s balances latency with API courtesy.

The 1-minute cron ensures the function is always running during live games.
The in-function loop polls every 15s for 55s, then exits before the next
cron invocation fires. No overlapping invocations occur because the function
exits within the 60-second cron window.

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

Moves from `leagueConstants.ts`:
- `PARK_FACTORS` record
- `WOBA_SCALE`, `LEAGUE_R_PER_PA` and any other league constants used by
  the scoring math

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

Re-export `PARK_FACTORS` and league constants from `shared/scoring.mjs`. This
eliminates the drift risk with `build-watchability.mjs`'s hardcoded
`WOBA_SCALE` and `LEAGUE_R_PER_PA`.

### Modify: `scripts/build-watchability.mjs`

Replace the hardcoded `WOBA_SCALE = 1.24` and `LEAGUE_R_PER_PA = 0.12`
(lines 48-49) with imports from `../shared/scoring.mjs`. This closes the
drift risk. The `FIP_CONSTANT = 3.15` duplication with `sabermetrics.ts` is
left as-is for now (different calling conventions).

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
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
# Paste the bot token from @BotFather

firebase functions:secrets:set TELEGRAM_CHAT_ID
# Paste the channel chat_id (negative number, e.g. -1001234567890)

firebase functions:secrets:set WATCHABILITY_JSON_URL
# Paste the Vercel URL: https://mlb-companion.vercel.app/watchability.json
```

## Part 3 — Telegram Bot Setup

### One-time manual steps

1. **Create the bot:** Message `@BotFather` on Telegram → `/newbot` →
   follow prompts → receive bot token
2. **Create a dedicated channel:** "MLB Companion Alerts" (or similar)
3. **Add bot as channel admin:** Channel Settings → Administrators → Add
   the bot → grant "Post Messages" permission
4. **Get the channel chat_id:** Send any message in the channel, then call
   `https://api.telegram.org/bot{token}/getUpdates` → find the `chat.id`
   in the response (negative number starting with `-100`)

### Telegram API Reference

- **sendMessage:** `POST https://api.telegram.org/bot{token}/sendMessage`
  with `{chat_id, text, parse_mode: "HTML", reply_markup: {inline_keyboard}}`
- **HTML formatting:** `<b>`, `<i>`, `<a>`, `<code>`, `<s>`, `<u>` tags
- **Inline keyboard:** `reply_markup: {inline_keyboard: [[{text, url}]]}`
  — URL can deep-link to the PWA
- **Rate limits:** 30 msgs/sec overall, 1/sec per chat. We send ~1-2 per
  15s polling cycle. Well within limits.
- **Message max:** 4096 chars. Our messages are ~200 chars.

## Part 4 — Cloud Functions

All in `functions/src/`. Each function is a single file. The entry point
`index.ts` exports them.

### `functions/src/telegram.ts`

Telegram message sender + HTML message builder.

```ts
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
  awayScore?: number | null
  homeScore?: number | null
}

export async function sendTelegramNotification(
  botToken: string,
  chatId: string,
  payload: NotificationPayload,
): Promise<void>
```

### Message Format (HTML parse_mode)

All messages include an inline keyboard button:

```json
{
  "inline_keyboard": [[{
    "text": "⚾ Open Game",
    "url": "https://mlb-companion.vercel.app/?gamePk={gamePk}"
  }]]
}
```

**Pregame:**
```
⚾ <b>Pregame Alert</b> ⚡

<b>NYY @ BOS</b> — 7:05 PM ET
Watchability: <b>72</b> (Great)

MLB Companion · 2024-08-22
```

**Live crossing:**
```
⚾ <b>Live Alert</b> 🔥

<b>LAD @ SF</b> — Bot 7th
Watchability crossed 65 → now <b>78</b> (Great)

Live: 78 | Pregame: 61
LAD 3 - SF 2

MLB Companion · 2024-08-22
```

**Live jump:**
```
⚾ <b>Live Alert</b> ⚡

<b>LAD @ SF</b> — Bot 8th
Watchability jumped +12 → <b>83</b> (Elite) 🔥

Live: 83 | Pregame: 61
LAD 4 - SF 4

MLB Companion · 2024-08-22
```

### `functions/src/notify-pregame.ts`

Scheduled function, runs every 10 minutes. Checks pre-game scores for today's
slate.

```ts
import { onSchedule } from 'firebase-functions/v2/scheduler'

export const notifyPregame = onSchedule(
  {
    schedule: 'every 10 minutes',
    timeZone: 'America/New_York',
    secrets: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'WATCHABILITY_JSON_URL'],
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (event) => { ... }
)
```

Logic:
1. Fetch `watchability.json` from Vercel (the `WATCHABILITY_JSON_URL` secret)
2. For each game in `payload.games`:
   - Compute pregame score using `shared/scoring.mjs` (park factor from
     the shared `PARK_FACTORS` record)
   - If score >= 65 and `pregameNotified` is false in Firestore:
     - Send Telegram notification (trigger: `pregame`)
     - Set `pregameNotified: true`, `lastNotifiedScore: score` in Firestore
3. Skip games whose status is already Live or Final (check MLB schedule API
   for current status — or simply skip if the game's start time has passed)

**Why not just check all games?** The nightly build runs at 07:00 and 12:00 ET.
A game at 1:05 PM ET won't be in the payload until the 12:00 build. The
10-minute cron catches anything that was added late and sends the pre-game
notification before first pitch.

### `functions/src/notify-live.ts`

Scheduled function, runs every 1 minute. Checks live scores for games in
progress using a 15-second in-function polling loop.

```ts
export const notifyLive = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'America/New_York',
    secrets: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'WATCHABILITY_JSON_URL'],
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (event) => { ... }
)
```

Logic:
1. Fetch today's schedule from
   `statsapi.mlb.com/api/v1/schedule?sportId=1&date={today}`
2. Filter to games with `abstractGameState === 'Live'`
3. If no live games → exit immediately (sub-second, negligible cost)
4. Fetch `watchability.json` for inputs (once, not per poll iteration)
5. **Polling loop** (every 15s for 55s, ~3-4 iterations per invocation):
   - For each live game:
     - Fetch `winProbability` from
       `statsapi.mlb.com/api/v1/game/{gamePk}/winProbability`
     - Compute `computeWatchability(inputs, baseline, plays, 'live')`
     - Check Firestore document `notifications/{today}/{gamePk}`:
       - **Crossing trigger:** score >= 65 and `crossingNotified` is false
         and `pregameNotified` is false
         → send notification, set `crossingNotified: true`
         (skip crossing if pregame was already notified — avoids double-notify)
       - **Jump trigger:** score >= 65 and `lastNotifiedScore` exists and
         `score - lastNotifiedScore >= 10` and `lastNotifiedScore >= 65`
         → send notification (trigger: `jump`, `previousScore`)
       - Update `lastNotifiedScore: score` on every poll iteration
   - Sleep 15s (using `await new Promise(r => setTimeout(r, 15000))`)
   - Exit before 60s elapsed (before next cron fires)

**No overlapping invocations:** The function exits within 60 seconds. The
next 1-minute cron fires after the previous one exits. Firebase guarantees
no concurrent executions of the same scheduled function.

**Crossing trigger refinement:** If a game's pregame score was already >= 65
and `pregameNotified` is true, the crossing trigger is suppressed. This
prevents an immediate second alert when the live score kicks in above 65.
The jump trigger still fires for these games if the score climbs +10 further.

### `functions/src/scoring.ts`

Re-export from `../../shared/scoring.mjs` with type safety for the functions
TypeScript context.

```ts
export {
  computePregameScore, computeExcitementIndex, computeLiveScore,
  computeWatchability, tierFor, eloWinProbability,
  PARK_FACTORS, WOBA_SCALE, LEAGUE_R_PER_PA,
} from '../../shared/scoring.mjs'
```

### `functions/src/index.ts`

```ts
export { notifyPregame } from './notify-pregame'
export { notifyLive } from './notify-live'
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
  // Only fires if pregameNotified is false
  crossingNotified: boolean

  // Jump tracking (updated every poll iteration while game is live)
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

## Part 6 — File Manifest

### New files (14)

| Path | Purpose |
|---|---|
| `shared/scoring.mjs` | Pure scoring math, extracted from `watchability.ts` + `leagueConstants.ts` |
| `shared/scoring.d.ts` | TypeScript types for the shared module |
| `functions/package.json` | Functions package (firebase-admin, firebase-functions) |
| `functions/tsconfig.json` | Functions TS config |
| `functions/src/index.ts` | Entry point, exports all functions |
| `functions/src/telegram.ts` | Telegram sendMessage + HTML message builder + inline keyboard |
| `functions/src/notify-pregame.ts` | Scheduled: pre-game score check (10-min cron) |
| `functions/src/notify-live.ts` | Scheduled: live score check (1-min cron + 15s polling loop) |
| `functions/src/scoring.ts` | Re-export from `../../shared/scoring.mjs` (type-safe wrapper) |
| `firebase.json` | Firebase config (functions + firestore) |
| `firestore.rules` | Firestore security rules |
| `firestore.indexes.json` | Firestore indexes (empty, no composite needed) |
| `.gitignore` additions | `functions/lib/`, `functions/node_modules/`, `.firebase/` |
| `docs/LIVE_NOTIFICATIONS_PLAN.md` | This document |

### Modified files (3)

| Path | Changes |
|---|---|
| `src/utils/watchability.ts` | Re-export from `shared/scoring.mjs` instead of defining inline |
| `src/utils/leagueConstants.ts` | Re-export `PARK_FACTORS` + league constants from `shared/scoring.mjs` |
| `scripts/build-watchability.mjs` | Import `WOBA_SCALE`, `LEAGUE_R_PER_PA` from `shared/scoring.mjs` |

### Unchanged (key files)

| Path | Why unchanged |
|---|---|
| `vite.config.ts` | Relative imports from `shared/` resolve natively |
| `vercel.json` | Still pure static SPA — Firebase handles the backend |
| `.github/workflows/watchability.yml` | Nightly build unchanged |
| `package.json` (root) | No new frontend deps |
| `src/hooks/useWatchability.ts` | Scores for UI display only; no notification sending |
| `src/components/GameSelect/GameSelect.tsx` | No notification hook integration needed |
| `src/api/mlb.ts` | Functions use direct `fetch`, not the frontend API client |

## Part 7 — Implementation Order

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
   - Set secrets via CLI (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
     `WATCHABILITY_JSON_URL`)

3. **Implement `functions/src/telegram.ts`**
   - HTML message builder for pregame / crossing / jump triggers
   - Inline keyboard with "Open Game" deep-link button
   - sendMessage POST sender
   - Test with a hardcoded payload locally

4. **Implement `functions/src/notify-pregame.ts`**
   - Fetch `watchability.json`
   - Compute pregame scores (using shared scoring module)
   - Firestore dedup
   - Deploy and test

5. **Implement `functions/src/notify-live.ts`**
   - Fetch schedule, filter live games
   - 15-second polling loop (fetch winProbability, compute live watchability)
   - Crossing + jump triggers with dedup
   - Crossing suppression when pregameNotified is true
   - Deploy and test

6. **Deploy Firestore rules**
   - `firebase deploy --only firestore:rules`

7. **End-to-end test**
   - Set Telegram bot token + chat ID
   - Trigger `notify-pregame` via `firebase functions:shell`
   - Wait for a live game, verify 1-min cron + 15s polling fires
   - Verify crossing notification fires within ~15s of threshold crossing
   - Verify jump notification fires on +10 swing
   - Verify dedup: run same function twice → no duplicate notification
   - Verify inline button opens PWA with correct gamePk

## Part 8 — Verification

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
2. **Pregame cron:** `firebase functions:shell` → call `notifyPregame()` →
   verify Telegram message for games >= 65
3. **Live cron:** Same, call `notifyLive()` during a live game → verify
   crossing notification within ~15s
4. **Dedup:** Run the same cron twice → verify no duplicate notification
5. **Jump trigger:** During a live game already above 65, wait for a +10
   swing → verify jump notification fires
6. **Crossing suppression:** For a game with pregame >= 65, verify no
   crossing notification fires when live score starts >= 65 (only jump
   notifications should fire)
7. **Inline button:** Tap "⚾ Open Game" in Telegram → verify PWA opens
   with the correct game loaded

## Cost Analysis

### Firebase Free Tier (1-min cron + 15s polling)

| Resource | Free quota | Expected usage |
|---|---|---|
| Function invocations | 2M/month | ~32K/month (1-min cron × 12hr × 30 days live + 10-min pregame) |
| Function compute (GB-sec) | 400K/month | ~200K GB-sec (256MiB × ~60s × ~360 live runs + ~720 pregame × 10s) |
| Firestore reads | 50K/day | ~29K/day (~360 live runs × ~9 live games + ~144 pregame runs × ~15 games) |
| Firestore writes | 20K/day | ~30/day (notifications + score updates) |
| Firestore storage | 1 GiB | ~100KB/season |
| MLB API calls | Free (no published limit) | ~17K/day (~360 runs × ~9 games + pregame fetches) |

All within free tier. Function compute is the tightest at ~50% of the free
quota, but only on days with many live games. Most days will be far less.

**Note:** The `notify-live` function exits immediately (sub-second) when no
games are live, so the 1-min cron is nearly free during off-hours. The
15s polling loop only runs during live games (~3-4 hours/day typically).

### GitHub Actions

The nightly build workflow is unchanged. 2 runs/day × ~60s = ~60 minutes/month.
Well within the 2,000 free minutes.

### Telegram

Free. No published per-message cost for bots. Rate limit: 30 msgs/sec
overall, 1/sec per chat. We send ~1-2 messages per 15s polling cycle —
well within limits.

## Future Considerations

- **Backtesting:** The README notes the formula is "calibrated by
  construction, not yet validated against realised outcomes." Notification
  thresholds could be tuned after backtesting.
- **User preferences:** Currently all-or-nothing. Could add per-tier
  thresholds (e.g., only Elite) via a settings UI.
- **Multi-channel:** The `telegram.ts` module could be abstracted to support
  Discord, Slack, etc. as alternative delivery channels.
- **Live play context:** The `notify-live` function could enrich messages
  with play context (e.g., "Mason Miller entering 9th") by fetching the
  live feed endpoint alongside winProbability.
- **Cleanup function:** A weekly cron to delete Firestore notification docs
  older than 7 days, if manual cleanup becomes tedious.
