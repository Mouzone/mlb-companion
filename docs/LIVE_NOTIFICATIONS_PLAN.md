# Live Game Experience Plan

> **Status: Deployed** — All parts (1–7) are complete and live in production.
>
> - Firebase project: `mlb-companion-pwa` (Blaze plan)
> - Functions: `notifyMorningDigest` (daily 9 AM ET), `notifyPregame`
>   (every 10 min), `notifyLive` (every 1 min), `buildWatchability`
>   (06:00/09:00/12:00 ET), `watchabilityPayload` (HTTP), and `liveScores`
>   (HTTP), all Node.js 22 gen-2 in `us-central1`
> - Secrets in Secret Manager: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
> - Telegram delivers to a private DM chat (not a channel), so no bot admin
>   setup is required
> - Firestore rules deployed: `notifications/{date}/games/{gamePk}` and
>   `watchability/{document}` are Admin-SDK-only (`allow read, write: if false`)
>
> **2026-08-27 pipeline migration:** the watchability payload is no longer
> built by GitHub Actions and committed as `public/watchability.json`. GitHub's
> `schedule` trigger is best-effort — it silently dropped a run with no retry
> and no alert, and every consumer failed closed on a stale payload date, so
> one missed cron produced zero scores and zero notifications. The pipeline now
> runs inside the `buildWatchability` Cloud Function and writes Firestore
> `watchability/{YYYY-MM-DD}` plus `watchability/elo-state`. `ensureFresh`
> builds on demand when a date's document is missing, so a missed run repairs
> itself on the next consumer call.
>
> **Build note:** `functions/tsconfig.json` sets `rootDir: ".."` and includes
> `../shared` so the shared scoring module is emitted into `functions/lib`.
> Firebase only uploads the `functions/` directory, so the shared code must be
> compiled inside it. This shifts the entry point, hence
> `"main": "lib/functions/src/index.js"`.
>
> **Deploy note:** the `predeploy` hook invokes `tsc` directly rather than
> `npm run build`; npm crashes with `Cannot read properties of undefined
> (reading 'stdin')` when spawned by the Firebase CLI.
>
> **Bug-fix (2026-08-25):** The pregame idempotency field was renamed from
> `pregameNotified` to `pregameReminderSent`. An earlier revision without the
> 30-min window check fired a pregame alert 12h before first pitch and set
> `pregameNotified: true`, which then permanently suppressed the corrected
> 30-min-window reminder. The rename ensures stale docs from old semantics
> cannot block the new logic. The morning digest now initializes
> `pregameReminderSent: false` when it writes the Firestore doc. Per-run
> summary logging was also added to `notify-pregame.ts` so every skip reason
> is visible in Firebase logs.

Two related improvements bundled as one refactor:

1. **Telegram Bot notifications** — push alerts to your phone when a game's
   watchability score reaches 65+ (Great or Elite tier). Three serverless
   functions handle everything — no frontend notification code needed. A
   daily 9 AM ET cron sends a morning digest summarizing the day's top
   games with start times in a single message. A 10-minute cron sends
   per-game "Starting Soon" reminders ~30 min before first pitch. A
   1-minute cron with a 15-second in-function polling loop covers live
   games with near-real-time updates.

2. **Live slate polling** — GameSelect currently fetches the schedule once
   on mount and never refreshes. Scores, game status (Preview→Live→Final),
   and inning detail are frozen for the session. A new `useLiveSlate` hook
   adds adaptive polling (15s when games are live, 30s during preview, off
   when all final) so the slate view reflects real-time game state. This
   also feeds fresh game status to `useWatchability`, which automatically
   starts/stops win-probability polling as games transition.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ DATA PIPELINE (Cloud Functions)                                  │
│                                                                  │
│  Cloud Scheduler ──cron 06/09/12 ET──▶ buildWatchability         │
│                                          │ shared/build-         │
│                                          │ watchability.mjs      │
│                                          ▼ (statsapi.mlb.com)    │
│                        Firestore watchability/{YYYY-MM-DD}       │
│                                  watchability/elo-state          │
│                                          │                       │
│  Browser ──GET watchabilityPayload───────┘ (ensureFresh: builds  │
│         ──computeWatchability() in browser  on demand if absent) │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ NEW — Backend (Firebase Cloud Functions, free tier)              │
│                                                                  │
│  ├── notify-morning-digest ──cron 9AM ET──▶ ensureFresh(today)   │
│  │    + MLB schedule (for start times)     (Firestore)            │
│  │    compute pregame scores, filter ≥ 65      │                  │
│  │    sort by score desc, single Telegram msg  ▼                  │
│  │    set digestNotified per game in Firestore                    │
│  │                                                               │
│  ├── notify-pregame  ──cron 10min──▶ ensureFresh(today)         │
│  │  │  + MLB schedule (for start times)     compute pregame      │
│  │  │  scores, filter ≥ 65, check if game    scores              │
│  │  │  starts within 30 min → send            │                  │
│  │  │  "Starting Soon" reminder, set          ▼                  │
│  │  │  pregameReminderSent in Firestore query Firestore for dedup│
│  │  │                                    POST Telegram sendMessage│
│  │                                                               │
│  ├── notify-live     ──cron 1min───▶ fetch MLB schedule         │
│  │                                    if no live games → exit    │
│  │                                    poll loop (every 15s):     │
│  │                                      fetch winProbability     │
│  │                                      ensureFresh(today)      │
│  │                                      computeWatchability()    │
│  │                                      query Firestore dedup    │
│  │                                      POST Telegram sendMessage│
│  │                                    exit before next cron      │
│  │                                                               │
│  Firestore: notifications/{date}/games/{gamePk}                  │
│    digestNotified: boolean                                       │
│    crossingNotified: boolean                                     │
│    lastNotifiedScore: number                                     │
│    pregameReminderSent: boolean                                 │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ NEW — Frontend (Browser)                                         │
│                                                                  │
│  useLiveSlate(date)                                              │
│  ├── fetchSchedule(date) on mount + date change                 │
│  ├── adaptive setTimeout (not setInterval):                     │
│  │     any Live game  → 15s until next fetch                    │
│  │     all Preview     → 30s until next fetch                   │
│  │     all Final       → stop polling                           │
│  ├── pause when document.hidden                                  │
│  ├── resume + immediate refresh on visibilitychange             │
│  └── exposes { games, loading, refresh }                        │
│                                                                  │
│  GameSelect.tsx                                                  │
│  ├── const { games, loading } = useLiveSlate(gameDateStr())     │
│  ├── useWatchability(games) ← receives fresh games array        │
│  │     automatically starts/stops winProbability polling        │
│  │     as games transition Preview→Live→Final                   │
│  └── GameCard receives fresh scores, status, linescore          │
│                                                                  │
│  Polling: fetchSchedule ──▶ statsapi.mlb.com (15s/30s/off)      │
│           fetchWinProbability ─▶ statsapi.mlb.com (15s for live)│
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

GitHub Actions is no longer used for the data pipeline (see the 2026-08-27
migration note at the top). The pipeline runs in `buildWatchability` alongside
the notification functions, so there is exactly one scheduler and one storage
layer to reason about.

### Why not GitHub Actions cron at all?

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
display only. No notification logic runs in the browser. The frontend does
gain a new `useLiveSlate` hook (see Part 5 below) for live score/status
polling — but that is UI-only and separate from the notification pipeline.

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

### Modify: `shared/build-watchability.mjs`

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
  startTimeET?: string | null
}

interface DigestEntry {
  awayAbbr: string
  homeAbbr: string
  score: number
  tier: string
  startTimeET: string | null
}

export async function sendTelegramNotification(
  botToken: string,
  chatId: string,
  payload: NotificationPayload,
): Promise<void>

export async function sendTelegramDigest(
  botToken: string,
  chatId: string,
  date: string,
  entries: DigestEntry[],
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

**Pregame "Starting Soon":**
```
⚾ <b>Starting Soon</b> ⚡

<b>NYY @ BOS</b> — 7:05 PM ET
Watchability: <b>72</b> (Great)

MLB Companion · 2024-08-22
```

**Pregame "Starting Soon" reminder:**
```
⚾ Starting Soon ⚡

LAD @ SF — 9:40 PM ET
Watchability: 72 (Great)

MLB Companion · 2024-08-22
```

**Morning digest:**
```
⚾ Today's Top Games · Tue Aug 22

🔥 LAD @ SF — 9:40 PM ET
   Watchability: 82 (Elite)
⚡ NYY @ BOS — 7:10 PM ET
   Watchability: 71 (Great)

MLB Companion
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

> **Note:** The half-inning label (`Top`/`Bot`/`Mid`/`End`) is derived from
> the MLB Stats API `linescore.inningState` field. Previously this was
> hardcoded to `Bot` for all live alerts — now it reflects the actual
> half-inning.

**Live jump:**
```
⚾ <b>Live Alert</b> ⚡

<b>LAD @ SF</b> — Bot 8th
Watchability jumped +12 → <b>83</b> (Elite) 🔥

Live: 83 | Pregame: 61
LAD 4 - SF 4

MLB Companion · 2024-08-22
```

### `functions/src/notify-morning-digest.ts`

Scheduled function, runs daily at 9:00 AM ET. Sends a single Telegram message
listing the day's top games sorted by watchability score.

```ts
import { onSchedule } from 'firebase-functions/v2/scheduler'

export const notifyMorningDigest = onSchedule(
  {
    schedule: 'every day 09:00',
    timeZone: 'America/New_York',
    secrets: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async () => { ... }
)
```

Logic:
1. Load the payload via `ensureFresh(today)` from Firestore
2. Fetch MLB schedule for today (`statsapi.mlb.com/api/v1/schedule?sportId=1&date={today}`)
   to get each game's `gameDate` (ISO timestamp for start time)
3. For each game in `payload.games`:
   - Compute pregame score using `shared/scoring.mjs` (park factor from
     the shared `PARK_FACTORS` record)
   - If score >= 65: add to digest entries with ET-formatted start time
4. Sort entries by score descending
5. If entries is non-empty: send a single Telegram message via
   `sendTelegramDigest()` (one message, no per-game inline keyboard — a
   single button links to the PWA root)
6. Set `digestNotified: true` per qualifying game in Firestore
   `notifications/{date}/games/{gamePk}`

### `functions/src/notify-pregame.ts`

Scheduled function, runs every 10 minutes. Sends "Starting Soon" reminders for
games that start within the next 30 minutes.

```ts
import { onSchedule } from 'firebase-functions/v2/scheduler'

export const notifyPregame = onSchedule(
  {
    schedule: 'every 10 minutes',
    timeZone: 'America/New_York',
    secrets: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async () => { ... }
)
```

Logic:
1. Load the payload via `ensureFresh(today)` from Firestore
2. Fetch MLB schedule for today to get each game's `gameDate` (start time)
3. For each game in `payload.games`:
   - Compute pregame score using `shared/scoring.mjs` (park factor from
     the shared `PARK_FACTORS` record)
   - If score >= 65 and `pregameReminderSent` is false in Firestore:
     - Calculate lead time: `firstPitchMs - nowMs`
     - If lead is between 0 and 30 minutes (0 < lead ≤ 30 min):
       - Send Telegram notification (trigger: `pregame`, includes ET start time)
        - Set `pregameReminderSent: true`, `crossingNotified: true`,
         `lastNotifiedScore: score` in Firestore
         (`crossingNotified: true` suppresses the first live crossing alert
         since pregame already notified the user)
4. Skip games that have already started or are beyond the 30-min window

**Why the 30-min window?** The morning digest at 9 AM gives the day's overview.
The 10-minute cron with a 30-minute lead window ensures the reminder fires
close enough to first pitch to be actionable (e.g. "LAD @ SF starting in ~20
min") rather than hours ahead. Games starting before 9 AM ET won't get a
digest entry but will still get a pregame reminder if the 10-min cron catches
them within the 30-min window.

### `functions/src/notify-live.ts`

Scheduled function, runs every 1 minute. Checks live scores for games in
progress using a 15-second in-function polling loop.

```ts
export const notifyLive = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'America/New_York',
    secrets: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (event) => { ... }
)
```

Logic:
1. Fetch both today's and yesterday's schedule from
   `statsapi.mlb.com/api/v1/schedule?sportId=1&date={today}` and
   `?date={yesterday}` (yesterday catches late West Coast games still
   in progress after midnight ET)
2. Filter to games with `abstractGameState === 'Live'`
3. If no live games → exit immediately (sub-second, negligible cost)
4. Load the payload via `ensureFresh(today)` for inputs (once, not per poll iteration)
5. **Polling loop** (every 15s for 55s, ~3-4 iterations per invocation):
   - For each live game:
     - Fetch `winProbability` from
       `statsapi.mlb.com/api/v1/game/{gamePk}/winProbability`
     - Compute `computeWatchability(inputs, baseline, plays, 'live')`
     - Check Firestore document `notifications/{scheduleDate}/{gamePk}`
       (keyed by the game's original schedule date, not current ET date):
       - **Crossing trigger:** score >= 65 and `crossingNotified` is false
         → send notification, set `crossingNotified: true`,
         `lastNotifiedScore: score`
       - **Jump trigger:** score >= 65 and `lastNotifiedScore` exists and
         `score - lastNotifiedScore >= 10` and `lastNotifiedScore >= 65`
         → send notification (trigger: `jump`, `previousScore`),
         set `lastNotifiedScore: score`
       - **Re-crossing reset:** score < 65 and `crossingNotified` is true
         → set `crossingNotified: false` (allows a new crossing alert when
         the score re-enters the 65+ zone)
   - Sleep 15s (using `await new Promise(r => setTimeout(r, 15000))`)
   - Exit before 60s elapsed (before next cron fires)

**No overlapping invocations:** The function exits within 60 seconds. The
next 1-minute cron fires after the previous one exits. Firebase guarantees
no concurrent executions of the same scheduled function.

**`lastNotifiedScore` is only updated when a notification fires** (crossing
or jump), not on every poll. This ensures the +10 jump delta is measured
against the last *notified* score, not the last *seen* score.

**Crossing trigger and pregame:** When pregame fires, it sets
`crossingNotified: true`, which suppresses the first live crossing alert
(avoiding a double-notify). If the live score later drops below 65, the
re-crossing reset clears `crossingNotified`, and a new crossing alert fires
when the score re-enters 65+.

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
export { notifyMorningDigest } from './notify-morning-digest'
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

## Part 5 — Live Slate Polling (Frontend)

### Current Problem

`GameSelect.tsx` calls `fetchSchedule(gameDateStr())` exactly once on mount
(`useEffect([], [])`). The returned `ScheduledGame[]` — including
`abstractGameState`, `teams.*.score`, and the undeclared `linescore` field
(currentInning, inningState, outs) — is frozen for the component's lifetime.
This means:

- **Scores are static** — if a team scores while you're viewing the slate,
  the card still shows the old score
- **Game status is static** — Preview→Live and Live→Final transitions
  don't happen until you reload the page
- **Inning/outs detail is static** — the "LIVE · BOT 7 · 2 OUT" chip never
  updates
- **`useWatchability` can't adapt** — it derives its live-poll set from the
  `games` prop, so if a game goes Live after the initial fetch,
  win-probability polling never starts for that game

The only live-updating element on the slate is the watchability `ScoreRing`,
which receives fresh scores from `useWatchability`'s 30s winProbability poll
— but only for games that were already Live at mount time.

### New: `src/hooks/useLiveSlate.ts`

```ts
interface UseLiveSlateResult {
  games: ScheduledGame[]
  loading: boolean
  refresh: () => void
}

export function useLiveSlate(date: string): UseLiveSlateResult
```

**Logic:**

1. Call `fetchSchedule(date)` on mount and whenever `date` changes
2. After each fetch, determine the next polling cadence from the results:
   - Any game with `abstractGameState === 'Live'` → **15s**
   - All games `abstractGameState === 'Preview'` → **30s**
   - All games `abstractGameState === 'Final'` → **stop polling**
3. Use recursive `setTimeout` (not `setInterval`) so cadence adapts after
   each fetch — a game going Live mid-session speeds up the next poll
4. On fetch error: keep existing `games` (don't clobber with empty array),
   schedule next retry at the same cadence
5. Pause polling when `document.hidden`; on `visibilitychange` → immediate
   refresh + resume adaptive polling
6. Clear pending timeout on unmount or `date` change

**Why `setTimeout` instead of `setInterval`?** `setInterval` fires at a fixed
cadence regardless of fetch latency. If a fetch takes 3s, a 15s `setInterval`
would fire 12s after the response, not 15s. Recursive `setTimeout` schedules
the next poll 15s _after_ the previous fetch completes, giving even spacing
and allowing the cadence to change between polls.

### Modify: `src/components/GameSelect/GameSelect.tsx`

Replace the one-shot fetch pattern:

```tsx
// BEFORE
const [games, setGames] = useState<ScheduledGame[]>([])
useEffect(() => {
  fetchSchedule(gameDateStr()).then(setGames).catch(() => {})
}, [])

// AFTER
const { games, loading } = useLiveSlate(gameDateStr())
```

Remove the `useEffect(() => { fetchSchedule... }, [])` block entirely.
Everything else stays unchanged:

- Grouping into Live / Upcoming / Final buckets (now reflects real-time
  status transitions)
- Sorting by time or watchability
- `useWatchability(games)` — receives fresh `games`, automatically
  starts/stops win-probability polling as games go Live/Final
- `<GameCard>` rendering — already renders scores, linescore, status chip;
  just receives fresh data now

### What stays unchanged

| File | Why unchanged |
|---|---|
| `GameCard.tsx` | Already renders scores, linescore, status chip from props — just receives fresh data now |
| `useWatchability.ts` | Receives fresher `games` prop; polling adapts automatically. No code change needed. |
| `useLiveFeed.ts` | Single-game 4s diff-patch feed for detail view, unaffected |
| `gameStore.ts` | `selectedGame` snapshot not clobbered by slate refreshes — store holds `gamePk`, not the slate array |
| `mlb.ts` | No new API endpoints — `fetchSchedule` already returns scores, status, and linescore |

### Browser polling: two independent loops

After this change, the browser runs two independent polling loops:

| Hook | Endpoint | Cadence | Purpose |
|---|---|---|---|
| `useLiveSlate` | `fetchSchedule(date)` | 15s live / 30s preview / off final | Scores, status, inning detail for the slate |
| `useWatchability` | `fetchWinProbability(gamePk)` | 15s for live games | Excitement score for ScoreRing |

Both pause when `document.hidden` and resume on `visibilitychange`. They do
not coordinate — `useLiveSlate` feeds fresh `games` to `useWatchability`,
which independently polls win-probability for games it sees as Live.

Total API calls during a live slate (e.g. 9 live games):
- `fetchSchedule`: 1 call / 15s = 4 calls/min
- `fetchWinProbability`: 9 calls / 15s = 36 calls/min
- Total: ~40 calls/min = ~2,400/hr = ~29K/day (12hr of live games)

The MLB Stats API has no published rate limit. These are lightweight GET
requests (schedule ~5KB, winProbability ~2KB per game). Well within
reasonable usage.

## Part 6 — Firestore Schema

### Collection: `notifications`

Document path: `notifications/{scheduleDate}/games/{gamePk}`

```ts
interface NotificationDoc {
  // scheduleDate: YYYY-MM-DD from the MLB schedule API (the game's original
  // date, not when the notification fired). Used as the Firestore doc ID at
  // the collection-group level. This keeps notification state stable across
  // midnight ET rollover for late West Coast games.

  // Morning digest (fired once at 9 AM ET for games ≥ 65)
  digestNotified: boolean

  // Pre-game "Starting Soon" reminder (fired once ~30 min before first pitch
  // when pregame score >= 65)
  pregameReminderSent: boolean
  pregameScore: number | null

  // Crossing notification (fired when live score crosses 65)
  // Reset to false when score drops below 65, allowing re-crossing alerts
  crossingNotified: boolean

  // Jump tracking (only updated when a notification fires)
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
    match /notifications/{date}/games/{gamePk} {
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

## Part 7 — File Manifest

### New files (15)

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
| `src/hooks/useLiveSlate.ts` | Adaptive schedule polling hook (15s live / 30s preview / off final) |
| `.gitignore` additions | `functions/lib/`, `functions/node_modules/`, `.firebase/` |
| `docs/LIVE_NOTIFICATIONS_PLAN.md` | This document |

### Modified files (4)

| Path | Changes |
|---|---|
| `src/utils/watchability.ts` | Re-export from `shared/scoring.mjs` instead of defining inline |
| `src/utils/leagueConstants.ts` | Re-export `PARK_FACTORS` + league constants from `shared/scoring.mjs` |
| `shared/build-watchability.mjs` | Import `WOBA_SCALE`, `LEAGUE_R_PER_PA` from `./scoring.mjs`; exports `buildWatchability(date, priorState)` |
| `src/components/GameSelect/GameSelect.tsx` | Replace one-shot `fetchSchedule` with `useLiveSlate` hook for adaptive polling |

### Unchanged (key files)

| Path | Why unchanged |
|---|---|
| `vite.config.ts` | Relative imports from `shared/` resolve natively |
| `vercel.json` | Still pure static SPA — Firebase handles the backend |
| `functions/src/build-watchability.ts` | `buildWatchability` (onSchedule) + `watchabilityPayload` (onRequest) |
| `package.json` (root) | No new frontend deps |
| `src/hooks/useWatchability.ts` | Scores for UI display; receives fresher `games` prop automatically |
| `src/components/GameSelect/GameCard.tsx` | Already renders scores/status/linescore from props — receives fresh data |
| `src/hooks/useLiveFeed.ts` | Single-game 4s feed for detail view, unaffected |
| `src/store/gameStore.ts` | `selectedGame` snapshot not clobbered by slate refreshes |
| `src/api/mlb.ts` | No new endpoints — `fetchSchedule` already returns scores, status, linescore |

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
   - Set secrets via CLI (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
     )

3. **Implement `functions/src/telegram.ts`**
   - HTML message builder for pregame / crossing / jump triggers
   - Inline keyboard with "Open Game" deep-link button
   - sendMessage POST sender
   - Test with a hardcoded payload locally

4. **Implement `functions/src/notify-pregame.ts`**
   - Load the payload via `ensureFresh`
   - Compute pregame scores (using shared scoring module)
   - Firestore dedup (atomic via `runTransaction`)
   - Deploy and test

5. **Implement `functions/src/notify-live.ts`**
   - Fetch schedule, filter live games (exclude `Warmup`/`Pre-Game` detailedState)
   - 15-second polling loop (fetch winProbability, compute live watchability)
    - Crossing + jump triggers with atomic dedup via `runTransaction`
    - Re-crossing reset when score drops below 65
    - Capture `inningState` from linescore for accurate half-inning labels
   - Deploy and test

6. **Implement `src/hooks/useLiveSlate.ts`**
   - Adaptive `setTimeout` polling (15s live / 30s preview / off final)
   - Pause on `document.hidden`, resume on `visibilitychange`
   - Error handling (keep existing games on fetch failure)
   - Verify: `npx tsc -b`, `npm run lint`, `npm run build`,
     `npm run check:design` — all must pass

7. **Integrate `useLiveSlate` in `GameSelect.tsx`**
   - Replace one-shot `fetchSchedule` + `useState` with `useLiveSlate`
   - Remove the `useEffect(() => { fetchSchedule... }, [])` block
   - Verify grouping, sorting, and `useWatchability` all receive fresh data
   - Manually test: open app during live games, verify scores/status update
     every ~15s without page reload

8. **Deploy Firestore rules**
   - `firebase deploy --only firestore:rules`

9. **End-to-end test**
   - Set Telegram bot token + chat ID
   - Trigger `notify-pregame` via `firebase functions:shell`
   - Wait for a live game, verify 1-min cron + 15s polling fires
   - Verify crossing notification fires within ~15s of threshold crossing
   - Verify jump notification fires on +10 swing
   - Verify dedup: run same function twice → no duplicate notification
   - Verify inline button opens PWA with correct gamePk
   - Verify GameSelect scores/status refresh every ~15s during live games

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
8. **Live slate polling:** Open app during a live game → verify scores on
   game cards update every ~15s without page reload
9. **Status transitions:** Leave app open as a game goes from Preview→Live
   → verify the game card moves to the Live section and starts showing
   inning/outs detail automatically
10. **Adaptive cadence:** With all games in Preview → verify polling is
    ~30s; when a game goes Live → verify polling speeds up to ~15s
11. **Tab visibility:** Background the app during a live game → resume →
    verify immediate refresh of scores and status

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

### buildWatchability

3 runs/day at ~30-60s each, 512MiB. Roughly 90 GB-seconds/month against the
400,000 GB-second free tier. On-demand `ensureFresh` builds add at most a
handful more per day.

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
- **Score-change animation:** Brief CSS flash highlight on GameCard when a
  team's score increments — no new deps, pure CSS keyframe.
- **Date rollover:** If the app stays open across the 6 AM boundary,
  `useLiveSlate` could re-evaluate `gameDateStr()` to auto-advance to the
  new day's slate.

## Changelog

### 2025-08-27 — False inning notification fix

**Problem:** A "Bot 1st" live alert fired for LAD vs ATL before the game
had started. The pregame notification arrived immediately after.

**Root causes fixed:**

1. **Warmup/Pre-Game guard** (`notify-live.ts`): MLB Stats API maps
   `detailedState: "Warmup"` to `abstractGameState: "Live"`. Added a filter
   to exclude `Warmup` and `Pre-Game` from the live games list so
   pre-first-pitch games never enter the live notification loop.

2. **Real half-inning labels** (`telegram.ts`, `notify-live.ts`): The
   `inningLabel` function hardcoded `Bot` for all live alerts. Now captures
   `linescore.inningState` (`Top`/`Bottom`/`Middle`/`End`) from the
   schedule API and passes it through `NotificationPayload.inningState` to
   render the correct half-inning label.

3. **Atomic dedup writes** (`notify-live.ts`, `notify-pregame.ts`): The
   read-then-write dedup pattern was non-transactional, allowing overlapping
   cron invocations to both observe `crossingNotified === false` and both
   send. Wrapped all dedup read-modify-write cycles in `db.runTransaction()`.
