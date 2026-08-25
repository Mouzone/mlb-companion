import type { ReactElement } from 'react'
import type { PlayEvent } from '../../api/types'
import { EmptyPanel, SectionTitle, Stat, StatGrid } from '../ui'
import type { StatTone } from '../ui'
import { fixed, humanizeEnum } from './liveAtBatFormat'

/**
 * ContactStrip — four batted-ball readings coloured against league contact.
 *
 * Tone is from the BATTER's point of view: harder and farther is positive.
 * Launch angle is the exception — it is good in a band, not on a slope, so a
 * 45° pop-up and a 2° grounder are both negative while the barrel window
 * between them is positive.
 */

/** League-average batted-ball reference points (2024 Statcast). */
const LEAGUE_EXIT_VELO = 89.0
const HARD_HIT_THRESHOLD = 95.0
const WEAK_CONTACT = 80.0
const BARREL_ANGLE_LOW = 8
const BARREL_ANGLE_HIGH = 32

type HitData = NonNullable<PlayEvent['hitData']>

export interface ContactStripProps {
  readonly hitData: HitData | undefined
}

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function exitVeloTone(mph: number | null): StatTone {
  if (mph === null) return 'default'
  if (mph >= HARD_HIT_THRESHOLD) return 'positive'
  if (mph < WEAK_CONTACT) return 'negative'
  return 'default'
}

function launchAngleTone(degrees: number | null): StatTone {
  if (degrees === null) return 'default'
  if (degrees >= BARREL_ANGLE_LOW && degrees <= BARREL_ANGLE_HIGH) return 'positive'
  return 'negative'
}

function distanceTone(feet: number | null, exitVelo: number | null): StatTone {
  if (feet === null) return 'default'
  // Distance alone is ambiguous — a 340ft fly out and a 340ft double read the
  // same — so it only earns a tone when the contact behind it was hard.
  if (feet >= 350 && (exitVelo === null || exitVelo >= LEAGUE_EXIT_VELO)) return 'positive'
  if (feet < 150) return 'negative'
  return 'default'
}

function hardnessTone(hardness: string | undefined): StatTone {
  if (hardness === 'hard') return 'positive'
  if (hardness === 'soft') return 'negative'
  return 'default'
}

export function ContactStrip({ hitData }: ContactStripProps): ReactElement {
  const exitVelo = finite(hitData?.launchSpeed)
  const launchAngle = finite(hitData?.launchAngle)
  const distance = finite(hitData?.totalDistance)

  return (
    <section className="panel-row" aria-label="Contact">
      <SectionTitle meta={humanizeEnum(hitData?.trajectory)}>Contact</SectionTitle>
      {hitData === undefined ? (
        <EmptyPanel
          message="No ball in play"
          hint="Exit velocity, launch angle and distance appear on contact."
        />
      ) : (
        <StatGrid minColumnWidth={84}>
          <Stat
            label="Exit Velo"
            value={fixed(exitVelo, 1, ' mph')}
            tone={exitVeloTone(exitVelo)}
          />
          <Stat
            label="Launch °"
            value={fixed(launchAngle, 0, '°')}
            tone={launchAngleTone(launchAngle)}
          />
          <Stat
            label="Distance"
            value={fixed(distance, 0, ' ft')}
            tone={distanceTone(distance, exitVelo)}
          />
          <Stat
            label="Hardness"
            value={humanizeEnum(hitData.hardness)}
            tone={hardnessTone(hitData.hardness)}
          />
        </StatGrid>
      )}
    </section>
  )
}

export default ContactStrip
