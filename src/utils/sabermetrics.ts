function isValidStat(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && !Number.isNaN(value)
}

function roundStat(value: number, decimalPlaces: number): number {
  return Number(value.toFixed(decimalPlaces))
}

export function computeFIP(
  hr: number | null,
  bb: number | null,
  hbp: number | null,
  k: number | null,
  ip: number | null,
): number | null {
  if (
    !isValidStat(hr)
    || !isValidStat(bb)
    || !isValidStat(hbp)
    || !isValidStat(k)
    || !isValidStat(ip)
    || ip === 0
  ) {
    return null
  }

  return roundStat((13 * hr + 3 * (bb + hbp) - 2 * k) / ip + 3.15, 2)
}

export function computeERAplus(
  era: number | null,
  leagueERA: number | null,
  parkFactor: number | null,
): number | null {
  if (
    !isValidStat(era)
    || !isValidStat(leagueERA)
    || !isValidStat(parkFactor)
    || era === 0
  ) {
    return null
  }

  const effectiveParkFactor = (1 + parkFactor) / 2
  return roundStat(100 * leagueERA / (era / effectiveParkFactor), 0)
}

export function computeWRCplus(
  woba: number | null,
  leagueWOBA: number | null,
  wobaScale: number | null,
  leagueRPerPA: number | null,
  parkFactor: number | null,
): number | null {
  if (
    !isValidStat(woba)
    || !isValidStat(leagueWOBA)
    || !isValidStat(wobaScale)
    || !isValidStat(leagueRPerPA)
    || !isValidStat(parkFactor)
  ) {
    return null
  }

  const effectiveParkFactor = (1 + parkFactor) / 2
  const parkAdjustedLeagueRuns = effectiveParkFactor * leagueRPerPA
  if (wobaScale === 0 || parkAdjustedLeagueRuns === 0) return null

  return roundStat(
    ((((woba - leagueWOBA) / wobaScale) + leagueRPerPA) / parkAdjustedLeagueRuns) * 100,
    0,
  )
}

export function computeISO(avg: number | null, slg: number | null): number | null {
  if (!isValidStat(avg) || !isValidStat(slg)) return null

  return roundStat(slg - avg, 3)
}

export function computeKpct(k: number | null, pa: number | null): number | null {
  if (!isValidStat(k) || !isValidStat(pa) || pa === 0) return null

  return roundStat((k / pa) * 100, 1)
}

export function computeBBpct(bb: number | null, pa: number | null): number | null {
  if (!isValidStat(bb) || !isValidStat(pa) || pa === 0) return null

  return roundStat((bb / pa) * 100, 1)
}

export function computeHR9(hr: number | null, ip: number | null): number | null {
  if (!isValidStat(hr) || !isValidStat(ip) || ip === 0) return null

  return roundStat((hr / ip) * 9, 2)
}

export function computeGBpct(
  groundBalls: number | null,
  totalBattedBalls: number | null,
): number | null {
  if (
    !isValidStat(groundBalls)
    || !isValidStat(totalBattedBalls)
    || totalBattedBalls === 0
  ) {
    return null
  }

  return roundStat((groundBalls / totalBattedBalls) * 100, 1)
}

export function parseStat(stat: string | number): number | null {
  if (
    stat === null
    || stat === undefined
    || stat === ''
    || stat === '---'
    || stat === '-.--'
  ) {
    return null
  }

  const parsedStat = typeof stat === 'number' ? stat : Number(stat)
  return Number.isNaN(parsedStat) ? null : parsedStat
}

export function ipToDecimal(ip: string): number {
  const [innings = '0', outs = '0'] = ip.split('.')
  return roundStat(Number(innings) + Number(outs) / 3, 2)
}
