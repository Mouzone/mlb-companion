/**
 * Telegram message sender + HTML message builder.
 *
 * Sends push alerts to a Telegram channel when a game's watchability score
 * reaches 65+ (Great or Elite tier). Messages include an inline keyboard
 * button that deep-links to the PWA.
 */

export interface NotificationPayload {
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

const PWA_URL = 'https://mlb-companion.vercel.app'

function tierEmoji(tier: string): string {
  switch (tier) {
    case 'elite':
      return '🔥'
    case 'great':
      return '⚡'
    case 'good':
      return '👍'
    default:
      return '⚾'
  }
}

function inningLabel(payload: NotificationPayload): string {
  if (payload.inning === null || payload.inning === undefined) return ''
  const half = payload.state === 'live' ? 'Bot' : ''
  return `${half} ${payload.inning}${ordinalSuffix(payload.inning)}`
}

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] ?? s[v] ?? s[0]
}

function buildMessage(payload: NotificationPayload): string {
  const emoji = tierEmoji(payload.tier)
  const matchup = `<b>${payload.awayAbbr} @ ${payload.homeAbbr}</b>`

  if (payload.trigger === 'pregame') {
    return [
      `⚾ <b>Pregame Alert</b> ${emoji}`,
      '',
      `${matchup}`,
      `Watchability: <b>${payload.score}</b> (${capitalize(payload.tier)})`,
      '',
      `MLB Companion · ${payload.date}`,
    ].join('\n')
  }

  const inning = inningLabel(payload)
  const scoreLine =
    payload.awayScore !== null && payload.awayScore !== undefined &&
    payload.homeScore !== null && payload.homeScore !== undefined
      ? `${payload.awayAbbr} ${payload.awayScore} - ${payload.homeAbbr} ${payload.homeScore}`
      : ''

  if (payload.trigger === 'crossing') {
    return [
      `⚾ <b>Live Alert</b> 🔥`,
      '',
      `${matchup} — ${inning}`,
      `Watchability crossed 65 → now <b>${payload.score}</b> (${capitalize(payload.tier)})`,
      '',
      `Live: ${payload.live} | Pregame: ${payload.pregame}`,
      scoreLine,
      '',
      `MLB Companion · ${payload.date}`,
    ]
      .filter(Boolean)
      .join('\n')
  }

  // jump
  const delta = payload.score - (payload.previousScore ?? 0)
  return [
    `⚾ <b>Live Alert</b> ${emoji}`,
    '',
    `${matchup} — ${inning}`,
    `Watchability jumped +${delta} → <b>${payload.score}</b> (${capitalize(payload.tier)}) 🔥`,
    '',
    `Live: ${payload.live} | Pregame: ${payload.pregame}`,
    scoreLine,
    '',
    `MLB Companion · ${payload.date}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function buildInlineKeyboard(gamePk: number) {
  return {
    inline_keyboard: [
      [
        {
          text: '⚾ Open Game',
          url: `${PWA_URL}/?gamePk=${gamePk}`,
        },
      ],
    ],
  }
}

export async function sendTelegramNotification(
  botToken: string,
  chatId: string,
  payload: NotificationPayload,
): Promise<void> {
  const text = buildMessage(payload)
  const replyMarkup = buildInlineKeyboard(payload.gamePk)

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`)
  }
}
