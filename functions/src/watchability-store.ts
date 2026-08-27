/**
 * Firestore-backed store for the watchability payload.
 *
 * Replaces the old `public/watchability.json` static file that GitHub Actions
 * committed twice a day. That pipeline had no delivery guarantee — GitHub's
 * `schedule` trigger is best-effort and silently dropped runs, and every
 * consumer here fails closed on a stale `date`, so one missed cron produced a
 * day of zero scores and zero notifications.
 *
 * `ensureFresh` is the self-heal: any caller that needs today's payload will
 * regenerate it on the spot if the scheduled build has not landed. Since
 * notify-pregame runs every 10 minutes, a missed build repairs itself long
 * before it can be noticed.
 */

import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

import { buildWatchability } from '../../shared/build-watchability.mjs'

import type { WatchabilityPayload } from '../../shared/scoring-types.js'

/** Collection holding one document per slate date plus a single Elo state doc. */
const COLLECTION = 'watchability'
const ELO_STATE_DOC = 'elo-state'

interface EloState {
  season: number
  updatedAt: string
  ratings: Record<string, number>
}

/**
 * The notify-* modules each call a bare `initializeApp()` at module scope, so
 * by the time anything here runs the default app usually exists already.
 * Guarding keeps this module safe to import from a function that doesn't.
 */
function db() {
  if (getApps().length === 0) initializeApp()
  return getFirestore()
}

/** Today's date in ET, matching the slate boundary the rest of the app uses. */
export function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

/** Reads a stored payload. Returns null when that date has never been built. */
export async function getPayload(date: string): Promise<WatchabilityPayload | null> {
  const snap = await db().collection(COLLECTION).doc(date).get()
  if (!snap.exists) return null
  return snap.data() as WatchabilityPayload
}

/**
 * Runs the pipeline for `date` and persists both the payload and the carried
 * Elo ratings. Safe to call repeatedly: a later run simply overwrites with
 * fresher probable-pitcher data.
 */
export async function buildAndStore(date: string): Promise<WatchabilityPayload> {
  const firestore = db()

  const priorSnap = await firestore.collection(COLLECTION).doc(ELO_STATE_DOC).get()
  const priorState = priorSnap.exists ? (priorSnap.data() as EloState) : null

  const { payload, eloState } = await buildWatchability(date, priorState)

  await firestore.collection(COLLECTION).doc(date).set(payload as Record<string, unknown>)
  await firestore.collection(COLLECTION).doc(ELO_STATE_DOC).set(eloState)

  return payload as WatchabilityPayload
}

/**
 * Returns the payload for `date`, building it first if it is missing. This is
 * what every consumer should call instead of reading a file that may or may not
 * have been refreshed by an external system.
 */
export async function ensureFresh(date: string): Promise<WatchabilityPayload> {
  const existing = await getPayload(date)
  if (existing) return existing

  console.log(`[watchability-store] No payload for ${date}, building on demand`)
  return buildAndStore(date)
}
