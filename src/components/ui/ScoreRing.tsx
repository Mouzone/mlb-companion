import { useEffect, useRef, useState } from 'react'
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
 *
 * When no score is available (null), the ring renders 0 with an empty arc
 * instead of a dash. On first render the value snaps to the target (so cached
 * scores appear instantly). On subsequent score changes the numeral counts
 * up/down with an ease-out curve over ~600ms, in sync with the CSS
 * stroke-dashoffset transition on the arc.
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

const ANIM_DURATION = 600

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
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
  const target = hasScore ? Math.max(0, Math.min(100, score)) : 0
  const tier = hasScore ? tierFor(target) : 'skip'

  const [displayed, setDisplayed] = useState(target)
  const mountedRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      setDisplayed(target)
      return
    }

    if (target === displayed) return

    if (prefersReducedMotion()) {
      setDisplayed(target)
      return
    }

    const from = displayed
    const to = target
    const start = performance.now()

    function tick(now: number): void {
      const elapsed = now - start
      const progress = Math.min(1, elapsed / ANIM_DURATION)
      const eased = easeOutCubic(progress)
      setDisplayed(Math.round(from + (to - from) * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
      }
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  const label = hasScore
    ? `Watchability ${target} out of 100, ${TIER_LABEL[tier]}`
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
        <circle
          className="ui-ring__fill"
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - displayed / 100)}
        />
      </svg>
      <span className="ui-ring__value" aria-hidden="true">
        {displayed}
      </span>
    </span>
  )
}

export default ScoreRing
