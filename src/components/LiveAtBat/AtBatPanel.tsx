import type { ReactElement } from 'react'
import type { PlayEvent } from '../../api/types'
import { ZonePlot } from '../Canvas/ZonePlot'
import { SectionTitle, Stat } from '../ui'
import type { BaseState, SequencePitch } from './liveAtBatData'
import { NO_VALUE, ordinal, surname } from './liveAtBatFormat'

/**
 * The at-bat region. Three columns at every width: situation · strike zone ·
 * pitch sequence.
 *
 * The old layout centred a 150px canvas in a 390px viewport and left the outer
 * thirds blank. Both side columns now carry live data that was already in the
 * feed, so the canvas keeps its intrinsic size while the row carries three
 * times the information.
 */

/** ZonePlot draws its legend inside the square, and 172 is its legend threshold. */
const ZONE_PLOT_SIZE = 172

export interface AtBatPanelProps {
  readonly pitches: PlayEvent[]
  readonly sequence: readonly SequencePitch[]
  readonly balls: number
  readonly strikes: number
  readonly outs: number
  readonly timeThroughOrder: number
  readonly situation: string
  readonly bases: readonly BaseState[]
  readonly onDeck: string | null
  readonly inHole: string | null
}

function zoneSummary(sequence: readonly SequencePitch[]): string {
  if (sequence.length === 0) return 'Strike zone plot. No pitches thrown in this at-bat yet.'
  const detail = sequence
    .map((pitch) => `${pitch.number}: ${pitch.code} ${pitch.velocity} mph, ${pitch.call}`)
    .join('; ')
  return `Strike zone plot of ${sequence.length} pitches this at-bat. ${detail}.`
}

function BasesList({ bases }: { readonly bases: readonly BaseState[] }): ReactElement {
  return (
    <div className="atbat__bases">
      <span className="atbat__col-title">On Base</span>
      {bases.map((base) => (
        <span
          key={base.label}
          className={base.runner === null ? 'atbat__base' : 'atbat__base atbat__base--on'}
        >
          <span className="atbat__base-tag">{base.label}</span>
          <span className="atbat__base-name">
            {base.runner === null ? NO_VALUE : surname(base.runner)}
          </span>
        </span>
      ))}
    </div>
  )
}

function Sequence({ sequence }: { readonly sequence: readonly SequencePitch[] }): ReactElement {
  return (
    <div className="atbat__col atbat__col--sequence">
      <span className="atbat__col-title">Sequence</span>
      {sequence.length === 0 ? (
        <span className="atbat__seq-empty">No pitches yet</span>
      ) : (
        <ol className="atbat__seq">
          {sequence.map((pitch) => (
            <li key={pitch.key} className="atbat__seq-row">
              <span
                className={`atbat__seq-dot atbat__seq-dot--${pitch.tone}`}
                aria-hidden="true"
              />
              <span className="atbat__seq-no">{pitch.number}</span>
              <span className="atbat__seq-code">{pitch.code}</span>
              <span className="atbat__seq-velo">{pitch.velocity}</span>
              <span className="a11y-only">{pitch.call}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function AtBatPanel({
  pitches,
  sequence,
  balls,
  strikes,
  outs,
  timeThroughOrder,
  situation,
  bases,
  onDeck,
  inHole,
}: AtBatPanelProps): ReactElement {
  const hasDeck = onDeck !== null || inHole !== null

  return (
    <section className="panel-row atbat" aria-label="At bat">
      <SectionTitle meta={`${sequence.length} ${sequence.length === 1 ? 'pitch' : 'pitches'}`}>
        At Bat
      </SectionTitle>

      <div className="atbat__grid">
        <div className="atbat__col atbat__col--situation">
          <Stat label="Count" value={`${balls}-${strikes}`} />
          <Stat label="Outs" value={String(outs)} />
          <Stat label="Thru Ord" value={ordinal(timeThroughOrder)} />
          <Stat label="Runners" value={situation} />
          <BasesList bases={bases} />
        </div>

        <div className="atbat__col atbat__col--zone">
          <p className="a11y-only">{zoneSummary(sequence)}</p>
          <div
            className="zone-canvas"
            role="img"
            aria-label={`Strike zone plot, ${sequence.length} pitches this at-bat`}
          >
            <ZonePlot pitches={pitches} size={ZONE_PLOT_SIZE} />
          </div>
        </div>

        <Sequence sequence={sequence} />
      </div>

      {hasDeck ? (
        <div className="atbat__deck">
          <span className="atbat__deck-item">
            <span className="atbat__deck-label">On deck</span>
            <span className="atbat__deck-name">{onDeck ?? NO_VALUE}</span>
          </span>
          <span className="atbat__deck-item">
            <span className="atbat__deck-label">In hole</span>
            <span className="atbat__deck-name">{inHole ?? NO_VALUE}</span>
          </span>
        </div>
      ) : null}
    </section>
  )
}
