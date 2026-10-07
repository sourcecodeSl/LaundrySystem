import type { ReactNode } from 'react'
import { Empty, Spinner, cx } from './ui'

export type Column<T> = {
  key: string
  header: ReactNode
  render?: (row: T) => ReactNode
  className?: string
  align?: 'left' | 'right' | 'center'
}

export function DataTable<T extends { id?: number | string }>({ columns, rows, loading, onRowClick, empty, footer }: {
  columns: Column<T>[]; rows: T[]; loading?: boolean; onRowClick?: (row: T) => void; empty?: ReactNode; footer?: ReactNode
}) {
  return (
    <div className="relative overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={cx(c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.className)}>{c.header}</th>)}</tr>
        </thead>
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
        {footer}
      </table>
      {loading && <div className="absolute inset-0 grid place-items-center bg-white/50 dark:bg-slate-900/50"><Spinner className="h-6 w-6 text-brand-500" /></div>}
      {!loading && rows.length === 0 && (empty ?? <Empty />)}
    </div>
  )
}
