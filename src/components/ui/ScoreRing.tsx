import type { ReactElement } from 'react'
import { tierFor, type WatchabilityTier } from '../../utils/watchability'

/**
 * ScoreRing — watchability score in a ring (DESIGN.md §5.14).
 *
 * Renders as phrasing content only. GameCard's root is a <button>, which by
 * the HTML content model admits no <div>, so every element here is a <span>
 * or <svg>.
 *
 * The numeral stays --c-ink rather than taking the tier hue: at --fs-data on a
 * 40px target, tier colours in the warm band fall under 3:1 on white. Colour
 * rides the stroke, where it is decorative, and the number carries the value.
 */

// lg is sized to the two-row team block it sits beside: 2 × 44px logo rows plus
// one --sp-3 gap = 96px, so the ring squares off that band instead of leaving
// dead space next to the second row.
const GEOMETRY = {
  sm: { box: 32, radius: 13, stroke: 2.5 },
  md: { box: 40, radius: 17, stroke: 3 },
  lg: { box: 96, radius: 42, stroke: 6 },
} as const

export type ScoreRingSize = keyof typeof GEOMETRY

const TIER_LABEL: Record<WatchabilityTier, string> = {
  elite: 'must watch',
  great: 'great',
  good: 'good',
  average: 'average',
  skip: 'skippable',
}

export interface ScoreRingProps {
  readonly score: number | null
  readonly size?: ScoreRingSize
  readonly live?: boolean
}

export function ScoreRing({
  score,
  size = 'md',
  live = false,
}: ScoreRingProps): ReactElement {
  const { box, radius, stroke } = GEOMETRY[size]
  const circumference = 2 * Math.PI * radius
  const hasScore = score !== null && Number.isFinite(score)
  const clamped = hasScore ? Math.max(0, Math.min(100, score)) : 0
  const tier = hasScore ? tierFor(clamped) : 'skip'

  const label = hasScore
    ? `Watchability ${clamped} out of 100, ${TIER_LABEL[tier]}`
    : 'Watchability unavailable'

  return (
    <span
      className={`ui-ring ui-ring--${size} ui-ring--${tier}${live ? ' ui-ring--live' : ''}`}
      role="img"
      aria-label={label}
    >
      <svg
        className="ui-ring__svg"
        viewBox={`0 0 ${box} ${box}`}
        width={box}
        height={box}
        aria-hidden="true"
        focusable="false"
      >
        <circle
          className="ui-ring__track"
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        {hasScore ? (
          <circle
            className="ui-ring__fill"
            cx={box / 2}
            cy={box / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamped / 100)}
          />
        ) : null}
      </svg>
      <span className="ui-ring__value" aria-hidden="true">
        {hasScore ? clamped : '—'}
      </span>
    </span>
  )
}

export default ScoreRing
