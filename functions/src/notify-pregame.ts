/**
 * notify-pregame — scheduled Cloud Function (every 10 minutes).
 *
 * Checks pre-game watchability scores for today's slate. Sends a Telegram
 * notification for any game scoring >= 65 that hasn't been notified yet.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { initializeApp } from 'firebase-admin/app'

import { computePregameScore, PARK_FACTORS } from './scoring.js'
import { sendTelegramNotification, type NotificationPayload } from './telegram.js'

import type { WatchabilityPayload, PayloadGame } from '../../shared/scoring-types.js'

initializeApp()

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

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

    const res = await fetch(payloadUrl, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`watchability.json fetch failed: ${res.status}`)
    const payload = (await res.json()) as WatchabilityPayload

    if (payload.date !== today) {
      console.log(`[notify-pregame] Payload date ${payload.date} ≠ today ${today}, skipping`)
      return
    }

    const db = getFirestore()

    for (const game of payload.games) {
      const inputs = {
        ...game,
        parkFactor: PARK_FACTORS[game.home.abbreviation] ?? 1,
      }

      const { score } = computePregameScore(inputs, payload.baseline)

      if (score < 65) continue

      const docRef = db.collection('notifications').doc(today).collection('games').doc(String(game.gamePk))
      const docSnap = await docRef.get()

      if (docSnap.exists && docSnap.data()?.pregameNotified) continue

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
      }

      await sendTelegramNotification(botToken, chatId, notification)
      console.log(`[notify-pregame] Sent pregame alert for ${game.gamePk}: score ${score}`)

      await docRef.set(
        {
          pregameNotified: true,
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
  },
)
