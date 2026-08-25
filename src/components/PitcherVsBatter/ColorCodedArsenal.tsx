import type { ReactElement } from 'react'
import type { StatTone } from '../ui'
import { EmptyPanel, Segmented } from '../ui'
import { Panel, SkeletonRows } from './PvbPanels'
import { fixed, percent } from './PvbShared'
import type { ColorCodedArsenalRow, HandednessFilter } from './ArsenalColorCoding'

const HANDEDNESS_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'RHB', label: 'RHB' },
  { id: 'LHB', label: 'LHB' },
]

function toneClass(tone: StatTone): string {
  return tone === 'default' ? '' : `arsenal-cc__metric--${tone}`
}

export interface ColorCodedArsenalProps {
  readonly rows: ReadonlyArray<ColorCodedArsenalRow>
  readonly loading: boolean
  readonly scopeLabel: string
  readonly showHandednessToggle: boolean
  readonly handedness: HandednessFilter
  readonly onHandednessChange: (h: HandednessFilter) => void
  readonly totalPitches: number
}

export function ColorCodedArsenal({
  rows,
  loading,
  scopeLabel,
  showHandednessToggle,
  handedness,
  onHandednessChange,
  totalPitches,
}: ColorCodedArsenalProps): ReactElement {
  const meta =
    totalPitches > 0
      ? `${scopeLabel} \u00b7 ${String(totalPitches)} pitches`
      : scopeLabel

  return (
    <Panel title="Arsenal" meta={meta}>
      {showHandednessToggle ? (
        <Segmented
          options={HANDEDNESS_OPTIONS}
          activeId={handedness}
          onSelect={(id) => onHandednessChange(id as HandednessFilter)}
        />
      ) : null}
      {rows.length > 0 ? (
        <div className="arsenal-cc" role="table" aria-label="Pitch arsenal">
          <div className="arsenal-cc__head" role="row">
            <span role="columnheader">Pitch</span>
            <span role="columnheader">Use</span>
            <span role="columnheader">Velo</span>
            <span role="columnheader">Spin</span>
            <span role="columnheader">Brk</span>
          </div>
          {rows.map((row) => (
            <div key={row.pitchType} className="arsenal-cc__row" role="row">
              <span className="arsenal-cc__name" role="rowheader">
                {row.pitchDescription}
              </span>
              <span className="arsenal-cc__usage" role="cell">
                {percent(row.usage, 0)}
              </span>
              <div className={`arsenal-cc__metric ${toneClass(row.velo.tone)}`} role="cell">
                <span className="arsenal-cc__value">{fixed(row.velo.value, 1)}</span>
                {row.velo.delta === null ? null : (
                  <span className="arsenal-cc__delta">{row.velo.delta}</span>
                )}
              </div>
              <div className={`arsenal-cc__metric ${toneClass(row.spin.tone)}`} role="cell">
                <span className="arsenal-cc__value">{fixed(row.spin.value, 0)}</span>
              </div>
              <div className={`arsenal-cc__metric ${toneClass(row.breakVertical.tone)}`} role="cell">
                <span className="arsenal-cc__value">{fixed(row.breakVertical.value, 1)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : loading ? (
        <SkeletonRows rows={4} />
      ) : (
        <EmptyPanel message={`No arsenal data for ${scopeLabel.toLowerCase()}`} />
      )}
    </Panel>
  )
}
