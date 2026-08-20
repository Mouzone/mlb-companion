import type { ReactElement } from 'react'
import { Badge, Card, EmptyPanel, PlayerAvatar, Stat, StatGrid } from '../ui'
import { SkeletonRows } from './PvbPanels'
import type { Cell, PlatoonBlock } from './PvbCards'

export interface PvbCardProps {
  readonly personId: number
  readonly name: string
  readonly strap: string
  readonly scopeLabel: string
  readonly role: 'pitcher' | 'batter'
  readonly cells: ReadonlyArray<Cell>
  readonly platoon: PlatoonBlock | null
  readonly loading: boolean
}

export function PvbCard({
  personId,
  name,
  strap,
  scopeLabel,
  role,
  cells,
  platoon,
  loading,
}: PvbCardProps): ReactElement {
  return (
    <Card className={`pvb-card pvb-card--${role}`}>
      <div className="pvb-card__id">
        <PlayerAvatar personId={personId} name={name} size="md" />
        <div className="pvb-card__ident">
          <span className="pvb-name">{name}</span>
          <span className="pvb-strap">{strap}</span>
        </div>
        <Badge tone="neutral">{scopeLabel}</Badge>
      </div>

      {cells.length > 0 ? (
        <StatGrid minColumnWidth={88}>
          {cells.map((cell) => (
            <Stat
              key={cell.label}
              label={cell.label}
              value={cell.value}
              tone={cell.tone}
              benchmark={cell.benchmark}
            />
          ))}
        </StatGrid>
      ) : loading ? (
        <SkeletonRows rows={3} />
      ) : (
        <EmptyPanel message={`No ${scopeLabel.toLowerCase()} line published`} />
      )}

      {platoon === null ? null : (
        <div className="pvb-card__platoon">
          <span className="pvb-strap">{platoon.title}</span>
          <StatGrid>
            {platoon.cells.map((cell) => (
              <Stat key={cell.label} label={cell.label} value={cell.value} tone={cell.tone} />
            ))}
          </StatGrid>
        </div>
      )}
    </Card>
  )
}
