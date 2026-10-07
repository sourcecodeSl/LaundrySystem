import { Wallet } from 'lucide-react'
import { ResourcePage } from '../../components/ResourcePage'
import { StatusBadge } from '../../components/ui'
import { date, label, money, today } from '../../lib/format'

/** Incomes & expenses (module 41). Posted entries are immutable (delete reverses the cash book). */
export default function Transactions() {
  return (
    <ResourcePage<any>
      title="Incomes & Expenses" icon={<Wallet className="h-5 w-5" />} endpoint="transactions" sendBranch subtitle="Other incomes and operating expenses"
      permissions={{ create: 'finance.transactions', delete: 'finance.transactions' }}
      filters={[
        { name: 'type', label: 'types', options: [{ value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }] },
        { name: 'method', label: 'methods', options: ['cash', 'card', 'bank_transfer', 'cheque'].map((m) => ({ value: m, label: label(m) })) },
      ]}
      columns={[
        { key: 'ref_no', header: 'Ref', render: (r) => <b>{r.ref_no}</b> }, { key: 'date', header: 'Date', render: (r) => date(r.date) },
        { key: 'type', header: 'Type', render: (r) => <StatusBadge status={r.type === 'income' ? 'paid' : 'unpaid'} /> },
        { key: 'category', header: 'Category', render: (r) => r.category?.name }, { key: 'description', header: 'Description' },
        { key: 'method', header: 'Method', render: (r) => label(r.method) }, { key: 'branch', header: 'Branch', render: (r) => r.branch?.name },
        { key: 'amount', header: 'Amount', align: 'right', render: (r) => <b className={r.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}>{money(r.amount)}</b> },
      ]}
      fields={[
        { name: 'type', label: 'Type', type: 'select', required: true, default: 'expense', options: [{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }] },
        { name: 'category_id', label: 'Category', type: 'select', required: true, optionsFrom: { endpoint: 'transaction-categories', label: (c) => `${c.name} (${c.type})`, params: { is_active: 1 } } },
        { name: 'date', label: 'Date', type: 'date', required: true, default: today() },
        { name: 'amount', label: 'Amount', type: 'number', required: true },
        { name: 'method', label: 'Method', type: 'select', required: true, default: 'cash', options: ['cash', 'card', 'bank_transfer', 'cheque'].map((m) => ({ value: m, label: label(m) })) },
        { name: 'reference', label: 'Reference' },
        { name: 'description', label: 'Description', full: true },
      ]}
    />
  )
}
