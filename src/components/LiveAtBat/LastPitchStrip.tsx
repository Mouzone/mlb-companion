import type { ReactElement } from 'react'
import type { PlayEvent } from '../../api/types'
import { EmptyPanel, SectionTitle, Stat, StatGrid } from '../ui'
import type { StatTone } from '../ui'
import { PITCH_TYPE_NAMES, callName, fixed } from './liveAtBatFormat'
import { deltaLabel, toneFor } from './lastPitchBaseline'
import type { MetricBaseline, MetricKey, PitchBaselines } from './lastPitchBaseline'

/**
 * LastPitchStrip — four readings that answer "did he get that one".
 *
 * The old ten-cell grid listed every telemetry field the feed carries, which
 * made the pitch that just happened take a full screen and told you nothing
 * about whether it was good. This keeps the four metrics that change pitch to
 * pitch and colours each against the pitcher's own baseline for that pitch
 * type, so the strip reads as a verdict rather than a dump.
 */

export interface LastPitchStripProps {
  readonly lastPitch: PlayEvent | undefined
  readonly baselines: PitchBaselines
}

interface Reading {
  readonly label: string
  readonly metric: MetricKey
  readonly actual: number | null | undefined
  readonly baseline: MetricBaseline
  readonly digits: number
  readonly unit: string
}

function ReadingStat({ label, metric, actual, baseline, digits, unit }: Reading): ReactElement {
  const tone: StatTone = toneFor(metric, actual, baseline.baseline)
  const delta = deltaLabel(actual, baseline, digits)
  const value = fixed(actual, digits, unit)
  return (
    <Stat
      label={label}
      value={
        delta === null ? (
          value
        ) : (
          <>
            {value}
            <span className="last-pitch__delta">{delta}</span>
          </>
        )
      }
      tone={tone}
    />
  )
}

export function LastPitchStrip({ lastPitch, baselines }: LastPitchStripProps): ReactElement {
  const pitchData = lastPitch?.pitchData
  const typeCode = lastPitch?.details.type?.code
  const typeName = typeCode === undefined ? '' : PITCH_TYPE_NAMES[typeCode] ?? typeCode
  const call = callName(lastPitch?.details.call?.code)
  const meta = typeName === '' ? call : `${typeName} · ${call}`

  const readings: readonly Reading[] = [
    {
      label: 'Velo',
      metric: 'velo',
      actual: pitchData?.startSpeed,
      baseline: baselines.velo,
      digits: 1,
      unit: ' mph',
    },
    {
      label: 'Spin',
      metric: 'spin',
      // The feed declares pitchData.spinRate but only ever populates breaks.spinRate.
      actual: pitchData?.spinRate ?? pitchData?.breaks.spinRate,
      baseline: baselines.spin,
      digits: 0,
      unit: ' rpm',
    },
    {
      label: 'Brk Vert',
      metric: 'breakVertical',
      actual: pitchData?.breaks.breakVertical,
      baseline: baselines.breakVertical,
      digits: 1,
      unit: '',
    },
    {
      label: 'Extension',
      metric: 'extension',
      actual: pitchData?.extension,
      baseline: baselines.extension,
      digits: 1,
      unit: ' ft',
    },
  ]

  return (
    <section className="panel-row" aria-label="Last pitch">
      <SectionTitle meta={meta}>Last Pitch</SectionTitle>
      {lastPitch === undefined ? (
        <EmptyPanel
          message="No pitch thrown yet"
          hint="Velocity, spin and break appear the moment the pitcher delivers."
        />
      ) : (
        <StatGrid className="last-pitch__grid" minColumnWidth={84}>
          {readings.map((reading) => (
            <ReadingStat key={reading.label} {...reading} />
          ))}
        </StatGrid>
      )}
    </section>
  )
}

export default LastPitchStrip
