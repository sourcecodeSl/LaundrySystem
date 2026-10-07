import { CreditCard, Printer } from 'lucide-react'
import dayjs from 'dayjs'
import { ResourcePage } from '../../components/ResourcePage'
import { amountInWords, date, money } from '../../lib/format'
import { esc, printHtml } from '../../lib/print'

/** Prints onto a standard (Sri Lankan) 7" x 3.5" cheque leaf. Positions are in mm. */
export function printCheque(c: any) {
  const d = dayjs(c.cheque_date).format('DDMMYYYY').split('')
  const amount = Number(c.amount).toLocaleString('en-LK', { minimumFractionDigits: 2 })
  printHtml(`<div class="chq">
    ${c.ac_payee ? '<div class="acp">A/C PAYEE ONLY</div>' : ''}
    <div class="date">${d.map((x) => `<span>${x}</span>`).join('')}</div>
    <div class="payee">${esc(c.payee)}</div>
    <div class="words">${esc(amountInWords(Number(c.amount)))}</div>
    <div class="amt">**${esc(amount)}**</div>
  </div>`, `@page{size:178mm 89mm;margin:0} body{font-family:Arial} .chq{position:relative;width:178mm;height:89mm;font-size:13px}
    .acp{position:absolute;left:8mm;top:6mm;transform:rotate(-12deg);border-top:1px solid;border-bottom:1px solid;font-weight:700;font-size:10px;padding:1px 4px}
    .date{position:absolute;right:8mm;top:7mm;display:flex;gap:2.2mm;letter-spacing:0;font-size:14px}.date span{width:4mm;text-align:center}
    .payee{position:absolute;left:22mm;top:24mm;width:140mm;font-weight:700}
    .words{position:absolute;left:22mm;top:33mm;width:115mm;line-height:8mm}
    .amt{position:absolute;right:10mm;top:41mm;font-weight:700;font-size:15px}`)
}

export default function Cheques() {
  return (
    <ResourcePage<any>
      title="Cheque Print" icon={<CreditCard className="h-5 w-5" />} endpoint="cheques" sendBranch subtitle="Register and print cheques"
      permissions={{ create: 'finance.cheques', update: 'finance.cheques', delete: 'finance.cheques' }}
      columns={[
        { key: 'cheque_date', header: 'Date', render: (r) => date(r.cheque_date) },
        { key: 'payee', header: 'Payee', render: (r) => <b>{r.payee}</b> },
        { key: 'cheque_no', header: 'Cheque #' }, { key: 'bank', header: 'Bank' },
        { key: 'amount', header: 'Amount', align: 'right', render: (r) => money(r.amount) },
        { key: 'words', header: 'In words', className: 'max-w-xs truncate text-xs text-slate-500', render: (r) => amountInWords(Number(r.amount)) },
      ]}
      rowActions={(r) => <button className="btn-icon" title="Print" onClick={() => printCheque(r)}><Printer className="h-4 w-4" /></button>}
      fields={[
        { name: 'payee', label: 'Payee', required: true, full: true },
        { name: 'amount', label: 'Amount', type: 'number', required: true },
        { name: 'cheque_date', label: 'Cheque date', type: 'date', required: true, default: dayjs().format('YYYY-MM-DD') },
        { name: 'cheque_no', label: 'Cheque number' }, { name: 'bank', label: 'Bank' },
        { name: 'ac_payee', label: 'A/C payee only', type: 'toggle', default: true },
      ]}
    />
  )
}
