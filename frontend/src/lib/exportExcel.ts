import { utils, writeFile } from 'xlsx'

export type ExportColumn<T> = { header: string; value: (row: T) => unknown }

/** Export rows to a real .xlsx workbook (module 53). */
export function exportExcel<T>(rows: T[], columns: ExportColumn<T>[], filename: string, sheet = 'Data') {
  const data = rows.map((r) => Object.fromEntries(columns.map((c) => {
    const v = c.value(r)
    return [c.header, typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v] // neutralise CSV/formula injection
  })))
  const ws = utils.json_to_sheet(data)
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(c.header.length + 2, 14) }))
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, sheet.slice(0, 31))
  writeFile(wb, `${filename}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
