import type { ReactElement, ReactNode } from 'react'

/**
 * DataTable (DESIGN.md §5.11).
 *
 * A real <table>, so row rules are guaranteed to span the full content width
 * and never terminate raggedly. Right-aligned columns get --font-num,
 * tabular-nums and a UNIFORM --sp-4 right padding — the fix for numerics
 * hugging the table edge at 3-5px while their neighbours sat at 12px.
 */

export type DataTableAlign = 'left' | 'right'

export interface DataTableColumn {
  readonly key: string
  readonly label: string
  readonly align?: DataTableAlign
}

export type DataTableRow = Readonly<Record<string, ReactNode>>

export interface DataTableProps {
  readonly columns: ReadonlyArray<DataTableColumn>
  readonly rows: ReadonlyArray<DataTableRow>
  readonly dense?: boolean
}

const EM_DASH = '—'

export function DataTable({
  columns,
  rows,
  dense = false,
}: DataTableProps): ReactElement {
  return (
    <table className={dense ? 'ui-table ui-table--dense' : 'ui-table'}>
      <thead className="ui-table__head">
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className={`ui-table__th ui-table__cell--${column.align ?? 'left'}`}
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          // Rows are positional readouts with no stable domain id of their
          // own; the caller controls order, so the index IS the identity.
          <tr key={rowIndex} className="ui-table__row">
            {columns.map((column) => {
              const cell = row[column.key]
              const empty = cell === null || cell === undefined || cell === ''
              return (
                <td
                  key={column.key}
                  className={`ui-table__td ui-table__cell--${column.align ?? 'left'}`}
                >
                  {empty ? (
                    <span className="ui-table__empty">{EM_DASH}</span>
                  ) : (
                    cell
                  )}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default DataTable
