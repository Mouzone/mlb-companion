/**
 * buildWatchability — scheduled pipeline that replaces the GitHub Actions job.
 *
 * Runs three times each morning ET. The later runs are near no-ops that just
 * overwrite with fresher probable-pitcher data; the redundancy exists so the
 * slate is never missing when the morning digest fires at 9 AM. Cloud Scheduler
 * retries on failure, which the old `schedule:` trigger on GitHub did not.
 *
 * watchabilityPayload — public HTTP read of the same data, for the browser.
 * The frontend used to fetch a static `/watchability.json` off Vercel; that file
 * only changed when a bot committed to main, which is exactly the coupling this
 * removes.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onRequest } from 'firebase-functions/v2/https'

import { buildAndStore, ensureFresh, todayET } from './watchability-store.js'

export const buildWatchability = onSchedule(
  {
    // 6/9/12 ET: before the digest, before late scratches, before first pitch.
    schedule: '0 6,9,12 * * *',
    timeZone: 'America/New_York',
    memory: '512MiB' as const,
    timeoutSeconds: 540,
    retryCount: 3,
  },
  async () => {
    const date = todayET()
    const payload = await buildAndStore(date)
    console.log(`[build-watchability] Stored ${payload.games.length} games for ${date}`)
  },
)

export const watchabilityPayload = onRequest(
  {
    memory: '256MiB' as const,
    timeoutSeconds: 60,
    cors: true,
  },
  async (req, res) => {
    const date = (req.query.date as string) || todayET()

    try {
      const payload = await ensureFresh(date)
      // Short TTL: the payload is stable within a slate but must not outlive the
      // day, and the client already refetches on visibility change.
      res.set('Cache-Control', 'public, max-age=300')
      res.status(200).json(payload)
    } catch (error) {
      console.error('[watchability-payload] Failed:', error)
      res.status(500).json({ error: 'Failed to load watchability payload' })
    }
  },
)
