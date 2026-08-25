/**
 * notify-pregame — scheduled Cloud Function (every 10 minutes).
 *
 * Checks pre-game watchability scores for today's slate. Sends a Telegram
 * "Starting Soon" reminder for any game scoring ≥ 65 that hasn't been
 * notified yet and starts within the next 30 minutes.
 *
 * The morning digest (notify-morning-digest) runs at 9 AM ET to summarize
 * the day's top games. This function handles the per-game reminder close
 * to first pitch.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { initializeApp } from 'firebase-admin/app'

import { computePregameScore, PARK_FACTORS } from './scoring.js'
import { sendTelegramNotification, type NotificationPayload } from './telegram.js'

import type { WatchabilityPayload } from '../../shared/scoring-types.js'

const MLB_API = 'https://statsapi.mlb.com/api/v1'
const REMINDER_WINDOW_MS = 30 * 60 * 1000

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

export const notifyPregame = onSchedule(
  {
    schedule: 'every 10 minutes',
    timeZone: 'America/New_York',
    secrets: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'WATCHABILITY_JSON_URL'],
    memory: '256MiB' as const,
    timeoutSeconds: 30,
  },
  async () => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    const payloadUrl = process.env.WATCHABILITY_JSON_URL

    if (!botToken || !chatId || !payloadUrl) {
      console.warn('[notify-pregame] Missing secrets, skipping')
      return
    }

    const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const today = nowET.toLocaleDateString('en-CA')

    const res = await fetch(payloadUrl, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`watchability.json fetch failed: ${res.status}`)
    const payload = (await res.json()) as WatchabilityPayload

    if (payload.date !== today) {
      console.log(`[notify-pregame] Payload date ${payload.date} ≠ today ${today}, skipping`)
      return
    }

    const schedule = await fetchSchedule(today)

    const nowMs = Date.now()
    const db = getFirestore()

    let belowThreshold = 0
    let alreadySent = 0
    let noGameDate = 0
    let outsideWindow = 0
    let sent = 0

    for (const game of payload.games) {
      const inputs = {
        ...game,
        parkFactor: PARK_FACTORS[game.home.abbreviation] ?? 1,
      }

      const { score } = computePregameScore(inputs, payload.baseline)

      if (score < 65) {
        belowThreshold++
        continue
      }

      const docRef = db.collection('notifications').doc(today).collection('games').doc(String(game.gamePk))
      const docSnap = await docRef.get()

      if (docSnap.exists && docSnap.data()?.pregameReminderSent) {
        alreadySent++
        continue
      }

      const gameDate = schedule.get(game.gamePk)
      if (!gameDate) {
        noGameDate++
        continue
      }

      const firstPitchMs = new Date(gameDate).getTime()
      const leadMs = firstPitchMs - nowMs

      if (leadMs < 0 || leadMs > REMINDER_WINDOW_MS) {
        outsideWindow++
        continue
      }

      const startTimeET = formatTimeET(gameDate)
      const tierStr = score >= 80 ? 'elite' : 'great'

      const notification: NotificationPayload = {
        gamePk: game.gamePk,
        date: today,
        awayTeam: game.away.abbreviation,
        homeTeam: game.home.abbreviation,
        awayAbbr: game.away.abbreviation,
        homeAbbr: game.home.abbreviation,
        score,
        tier: tierStr,
        pregame: score,
        live: null,
        liveWeight: 0,
        state: 'preview',
        trigger: 'pregame',
        startTimeET,
      }

      await sendTelegramNotification(botToken, chatId, notification)
      console.log(`[notify-pregame] Sent pregame reminder for ${game.gamePk}: score ${score}, starts in ${Math.round(leadMs / 60000)} min`)
      sent++

      await docRef.set(
        {
          pregameReminderSent: true,
          pregameScore: score,
          crossingNotified: true,
          lastNotifiedScore: score,
          lastNotifiedAt: new Date(),
          gamePk: game.gamePk,
          awayAbbr: game.away.abbreviation,
          homeAbbr: game.home.abbreviation,
          createdAt: docSnap.exists ? docSnap.data()?.createdAt : new Date(),
        },
        { merge: true },
      )
    }

    console.log(
      `[notify-pregame] Run complete: ${payload.games.length} games, ${sent} sent, ${belowThreshold} below 65, ${alreadySent} already sent, ${noGameDate} no gameDate, ${outsideWindow} outside window`,
    )
  },
)
