import dayjs from 'dayjs'

let currency = 'Rs.'
export const setCurrency = (c: string) => (currency = c || '')

export const money = (v: unknown, withSymbol = true) => {
  const n = Number(v ?? 0)
  const s = (Number.isFinite(n) ? n : 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return withSymbol ? `${currency} ${s}` : s
}
export const num = (v: unknown, d = 2) => Number(Number(v ?? 0).toFixed(d))
export const qty = (v: unknown) => Number(v ?? 0).toLocaleString('en-LK', { maximumFractionDigits: 3 })
export const date = (v?: string | null) => (v ? dayjs(v).format('DD MMM YYYY') : '—')
export const dateTime = (v?: string | null) => (v ? dayjs(v).format('DD MMM YYYY, hh:mm A') : '—')
export const today = () => dayjs().format('YYYY-MM-DD')
export const monthStart = () => dayjs().startOf('month').format('YYYY-MM-DD')
export const label = (s?: string | null) => (s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—')

export const STATUS_COLORS: Record<string, string> = {
  received: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  washing: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  drying: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  ironing: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
  ready: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  delivered: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  unpaid: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  refunded: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  open: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  resolved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  expired: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  closed: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  draft: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  applied: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  sent: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  failed: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  skipped: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  converted: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  accepted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  reported: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  investigating: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  compensated: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
}

export const ORDER_FLOW = ['received', 'washing', 'drying', 'ironing', 'ready', 'delivered'] as const

/** Amount in words for cheque printing. */
export function amountInWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
    'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const chunk = (n: number): string => {
    if (n < 20) return ones[n]
    if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`
    return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ' and ' + chunk(n % 100) : ''}`
  }
  const words = (n: number): string => {
    if (n === 0) return 'Zero'
    const parts: string[] = []
    const scales: [number, string][] = [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']]
    for (const [v, name] of scales) {
      if (n >= v) {
        parts.push(`${chunk(Math.floor(n / v))} ${name}`)
        n %= v
      }
    }
    if (n) parts.push(chunk(n))
    return parts.join(' ')
  }
  const rupees = Math.floor(amount)
  const cents = Math.round((amount - rupees) * 100)
  return `${words(rupees)}${cents ? ` and Cents ${chunk(cents)}` : ''} Only`
}
