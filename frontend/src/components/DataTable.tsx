import type { ReactNode } from 'react'
import { ErrorState, TableSkeleton } from './feedback'
import { Empty, cx } from './ui'

export type Column<T> = {
  key: string
  header: ReactNode
  render?: (row: T) => ReactNode
  className?: string
  align?: 'left' | 'right' | 'center'
}

export function DataTable<T extends { id?: number | string }>({ columns, rows, loading, error, onRetry, onRowClick, empty, footer }: {
  columns: Column<T>[]; rows: T[]; loading?: boolean; error?: unknown; onRetry?: () => void
  onRowClick?: (row: T) => void; empty?: ReactNode; footer?: ReactNode
}) {
  const firstLoad = loading && rows.length === 0
  if (error && rows.length === 0 && !loading) return <ErrorState error={error} onRetry={onRetry} compact />
  return (
    <div className="relative overflow-x-auto">
      {/* thin bar while refreshing data that is already on screen */}
      {loading && !firstLoad && <div className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden"><div className="h-full w-1/3 animate-[slideBar_1s_ease-in-out_infinite] bg-brand-500" /></div>}
      <table className={cx('table-base transition-opacity', loading && !firstLoad && 'opacity-60')}>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={cx(c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.className)}>{c.header}</th>)}</tr>
        </thead>
        {!firstLoad && (
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id ?? i} onClick={onRowClick ? () => onRowClick(row) : undefined} className={onRowClick ? 'cursor-pointer' : undefined}>
                {columns.map((c) => (
                  <td key={c.key} className={cx(c.align === 'right' && 'text-right tabular-nums', c.align === 'center' && 'text-center', c.className)}>
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        )}
        {!firstLoad && footer}
      </table>
      {firstLoad && <TableSkeleton cols={Math.min(columns.length, 6)} />}
      {!loading && !error && rows.length === 0 && (empty ?? <Empty />)}
    </div>
  )
}
