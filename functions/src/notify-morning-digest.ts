/**
 * notify-morning-digest — scheduled Cloud Function (daily at 9 AM ET).
 *
 * Loads today's watchability payload + MLB schedule, computes pregame scores
 * for every game, filters to score ≥ 65, sorts by score descending, and
 * sends a single Telegram message listing all qualifying games with their
 * ET start times.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { initializeApp } from 'firebase-admin/app'

import { computePregameScore, PARK_FACTORS, tierFor } from './scoring.js'
import { sendTelegramDigest, type DigestEntry } from './telegram.js'
import { ensureFresh } from './watchability-store.js'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

initializeApp()

interface ScheduleGame {
  gamePk: number
  gameDate: string
}

async function fetchSchedule(date: string): Promise<Map<number, string>> {
  const res = await fetch(
    `${MLB_API}/schedule?sportId=1&date=${date}`,
  )
  if (!res.ok) throw new Error(`Schedule fetch failed: ${res.status}`)
  const data = await res.json() as { dates: { games: any[] }[] }

  const map = new Map<number, string>()
  for (const game of data.dates?.flatMap((d) => d.games ?? []) ?? []) {
    map.set(game.gamePk, game.gameDate as string)
  }
  return map
}

function formatTimeET(gameDate: string): string {
  const dt = new Date(gameDate)
  return dt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  })
}

export const notifyMorningDigest = onSchedule(
  {
    schedule: 'every day 09:00',
    timeZone: 'America/New_York',
    secrets: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
    // Building the payload on demand is far heavier than the digest itself.
    memory: '512MiB' as const,
    timeoutSeconds: 540,
  },
  async () => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID

    if (!botToken || !chatId) {
      console.warn('[notify-morning-digest] Missing secrets, skipping')
      return
    }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

    // The 6 AM build should have landed by now; build inline if it did not.
    const payload = await ensureFresh(today)

    const schedule = await fetchSchedule(today)
    const db = getFirestore()

    const entries: DigestEntry[] = []

    for (const game of payload.games) {
      const inputs = {
        ...game,
        parkFactor: PARK_FACTORS[game.home.abbreviation] ?? 1,
      }

      const { score } = computePregameScore(inputs, payload.baseline)
      if (score < 65) continue

      const gameDate = schedule.get(game.gamePk)
      const startTimeET = gameDate ? formatTimeET(gameDate) : null

      entries.push({
        awayAbbr: game.away.abbreviation,
        homeAbbr: game.home.abbreviation,
        score,
        tier: tierFor(score),
        startTimeET,
      })

      const docRef = db.collection('notifications').doc(today).collection('games').doc(String(game.gamePk))
      const docSnap = await docRef.get()
      await docRef.set(
        {
          digestNotified: true,
          pregameReminderSent: false,
          pregameScore: score,
          gamePk: game.gamePk,
          awayAbbr: game.away.abbreviation,
          homeAbbr: game.home.abbreviation,
          createdAt: docSnap.exists ? docSnap.data()?.createdAt : new Date(),
        },
        { merge: true },
      )
    }

    if (entries.length === 0) {
      console.log('[notify-morning-digest] No games ≥ 65 today, skipping')
      return
    }

    entries.sort((a, b) => b.score - a.score)

    await sendTelegramDigest(botToken, chatId, today, entries)
    console.log(`[notify-morning-digest] Sent digest with ${entries.length} games`)
  },
)
