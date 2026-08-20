export interface Team {
  id: number
  name: string
  teamName: string
  abbreviation: string
}

export interface ScheduledGame {
  gamePk: number
  gameDate: string
  status: {
    abstractGameState: 'Preview' | 'Live' | 'Final'
    detailedState: string
    statusCode: string
  }
  teams: {
    away: {
      team: Team
      record?: string
      score?: number
      probablePitcher?: { id: number; fullName: string }
    }
    home: {
      team: Team
      record?: string
      score?: number
      probablePitcher?: { id: number; fullName: string }
    }
  }
  venue?: { name: string }
  probablePitcher?: {
    away?: { id: number; fullName: string }
    home?: { id: number; fullName: string }
  }
}

export interface ScheduleResponse {
  dates: {
    date: string
    games: ScheduledGame[]
  }[]
}

export interface PlayerInfo {
  id: number
  fullName: string
  firstName: string
  lastName: string
  primaryNumber: string
  batSide: { code: 'L' | 'R' | 'S'; description: string }
  pitchHand: { code: 'L' | 'R'; description: string }
  primaryPosition: { code: string; name: string }
}

export interface PitchArsenalItem {
  type: { code: string; description: string }
  percentage: number
  count: number
  totalPitches: number
  averageSpeed: number
}

export interface HotColdZone {
  zone: string
  temp: 'hot' | 'cold' | 'warm' | 'lukewarm'
  value: number
  onBasePercentage?: number
  sluggingPercentage?: number
}

export interface StatSplit {
  split: string
  stat: {
    avg: string
    obp: string
    slg: string
    ops: string
    strikeOuts: number
    baseOnBalls: number
    atBats: number
    plateAppearances: number
    hits: number
    homeRuns: number
    rbi: number
  }
}

export interface GameLogEntry {
  date: string
  opponent: { id: number; name: string }
  summary?: string
  stat: {
    hits: number
    doubles: number
    homeRuns: number
    rbi: number
    strikeOuts: number
    plateAppearances: number
    avg: string
    obp: string
    slg: string
    ops: string
    era?: string
    inningsPitched?: string
    earnedRuns?: number
    baseOnBalls?: number
  }
  isHome: boolean
  isWin: boolean
}

export interface VsPlayerStat {
  gamesPlayed: number
  plateAppearances: number
  hits: number
  homeRuns: number
  avg: string
  obp: string
  slg: string
  ops: string
  strikeOuts: number
  baseOnBalls: number
}

export interface SeasonStat {
  avg: string
  obp: string
  slg: string
  ops: string
  homeRuns: number
  rbi: number
  strikeOuts: number
  baseOnBalls: number
  atBats: number
  plateAppearances: number
  hits: number
  wrcPlus?: number
  iso?: number
  kPct?: number
  bbPct?: number
  babip?: string
  woba?: number
}

export interface PitcherSeasonStat {
  era: string
  whip: string
  strikeOuts: number
  baseOnBalls: number
  inningsPitched: string
  hits: number
  earnedRuns: number
  avg: string
  gamesPlayed: number
  gamesStarted?: number
  gamesPitched?: number
  homeRuns: number
  hitBatsmen?: number
  battersFaced?: number
  groundBalls?: number
  totalBattedBalls?: number
  fip?: number
  eraPlus?: number
  kPct?: number
  bbPct?: number
  hr9?: number
  gbPct?: number
}

export interface PlayEvent {
  isPitch: boolean
  type: string
  pitchData?: {
    startSpeed: number
    endSpeed: number
    spinRate: number
    zone: number
    strikeZoneTop: number
    strikeZoneBottom: number
    coordinates: {
      aX: number
      aY: number
      aZ: number
      pfxX: number
      pfxZ: number
      pX: number
      pZ: number
      x: number
      y: number
    }
    breaks: {
      breakAngle: number
      breakLength: number
      breakVertical: number
      breakHorizontal: number
      spinRate: number
      spinDirection: number
    }
    extension: number
    plateTime: number
  }
  details: {
    call?: { code: string; description: string }
    type?: { code: string; description: string }
    isInPlay: boolean
    isStrike: boolean
    isBall: boolean
    isOut: boolean
    ballColor?: string
  }
  count?: {
    balls: number
    strikes: number
    outs: number
  }
  hitData?: {
    launchSpeed: number
    launchAngle: number
    totalDistance: number
    trajectory: string
    hardness: string
    location: number
    coordinates: { coordX: number; coordY: number }
  }
}

export interface CurrentPlay {
  result: {
    event: string
    eventType: string
    description: string
    rbi: number
    awayScore: number
    homeScore: number
    isOut: boolean
  }
  about: {
    atBatIndex: number
    halfInning: 'top' | 'bottom'
    inning: number
    startTime: string
    endTime: string
    isComplete: boolean
    isScoringPlay: boolean
  }
  count: { balls: number; strikes: number; outs: number }
  matchup: {
    batter: { id: number; fullName: string }
    batSide: { code: 'L' | 'R' | 'S'; description: string }
    pitcher: { id: number; fullName: string }
    pitchHand: { code: 'L' | 'R'; description: string }
    splits: {
      batter: string
      pitcher: string
      menOnBase: string
    }
  }
  playEvents: PlayEvent[]
}

export interface LiveFeed {
  gameData: {
    teams: {
      away: { id: number; name: string; abbreviation: string }
      home: { id: number; name: string; abbreviation: string }
    }
    players: Record<string, PlayerInfo>
    datetime: { dateTime: string }
    status: {
      abstractGameState: 'Preview' | 'Live' | 'Final'
      detailedState: string
    }
  }
  liveData: {
    plays: {
      allPlays: CurrentPlay[]
      currentPlay: CurrentPlay
      scoringPlays: number[]
    }
    linescore: {
      innings: { inning: number; home: { runs: number }; away: { runs: number } }[]
      teams: {
        home: { runs: number; hits: number; errors: number }
        away: { runs: number; hits: number; errors: number }
      }
      currentInning?: number
      inningState?: string
      isTopInning?: boolean
      offense?: {
        first?: { id: number; fullName: string }
        second?: { id: number; fullName: string }
        third?: { id: number; fullName: string }
      }
    }
  }
  metaData: {
    timecode: string
  }
}

export interface DiffPatchResponse {
  diff: {
    type: string
    path: string
    value: unknown
  }[]
  metaData: {
    timecode: string
  }
}

export interface SavantBattedBall {
  pitch_type: string
  release_speed: string
  release_spin_rate: string
  launch_speed: string
  launch_angle: string
  hit_distance_sc: string
  hc_x: string
  hc_y: string
  bb_type: string
  events: string
  description: string
  stand: string
  p_throws: string
  game_date: string
  game_pk: string
  at_bat_number: string
  pitch_number: string
  inning: string
  balls: string
  strikes: string
  outs_when_up: string
  woba_value?: string
  estimated_woba_using_speedangle?: string
  estimated_ba_using_speedangle?: string
  launch_speed_angle?: string
  swing_path_tilt?: string
  babip_value?: string
  woba_denom?: string
  iso_value?: string
  delta_run_exp?: string
  bat_speed?: string
}

export interface SavantGamePitch {
  play_id: string
  ab_number: number
  pitch_number: number
  /**
   * Savant signals "no bat tracking on this pitch" by omitting the key entirely
   * rather than sending null, and it does so on well over half of all pitches.
   * Optional-and-nullable keeps the compiler honest at every read site.
   */
  batSpeed?: number | null
  game_pk?: string
  batter?: number
  pitch_type?: string
  start_speed?: number | null
  balls?: number
  strikes?: number
  outs?: number
  inning?: number
  description?: string
  zone?: number | null
  extension?: number | null
  spin_rate?: number | null
  breaks?: {
    breakAngle?: number | null
    breakLength?: number | null
    breakVertical?: number | null
    breakHorizontal?: number | null
  } | null
  avg_pitch_speed?: {
    pitch_type?: string
    pitch_type_literal?: string
    avg_pitch_speed?: string
    min_pitch_speed?: string
    max_pitch_speed?: string
    count?: number
  }[]
}

export interface CareerPitcherStat {
  era: string
  whip: string
  strikeOuts: number
  baseOnBalls: number
  inningsPitched: string
  hits: number
  earnedRuns: number
  homeRuns: number
  hitBatsmen: number
  gamesPlayed: number
  gamesStarted?: number
  gamesPitched?: number
  avg: string
  battersFaced?: number
  fip?: number
  kPct?: number
  bbPct?: number
  hr9?: number
}

export interface CareerBatterStat {
  avg: string
  obp: string
  slg: string
  ops: string
  homeRuns: number
  rbi: number
  strikeOuts: number
  baseOnBalls: number
  atBats: number
  plateAppearances: number
  hits: number
  iso?: number
  kPct?: number
  bbPct?: number
}

export interface InGameH2HAtBat {
  inning: number
  result: string
  event: string
  count: { balls: number; strikes: number }
  pitches: PlayEvent[]
}

export interface SeriesH2HGame {
  gamePk: number
  date: string
  atBats: InGameH2HAtBat[]
}

export interface H2HAggregate {
  pa: number
  avg: number
  ops: number
  hr: number
  k: number
  bb: number
}

export interface PlayByPlayResponse {
  allPlays: CurrentPlay[]
  currentPlay?: CurrentPlay
}
