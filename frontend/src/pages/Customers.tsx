import { Link } from 'react-router-dom'
import { BookOpen, Users } from 'lucide-react'
import { ResourcePage, yesNo } from '../components/ResourcePage'
import { useAuth } from '../lib/auth'
import { money } from '../lib/format'

export default function Customers() {
  const { can, lookups } = useAuth()
  return (
    <ResourcePage<any>
      title="Customers" icon={<Users className="h-5 w-5" />} endpoint="customers" subtitle="Customer master, balances and credit limits"
      searchPlaceholder="Search name, mobile, code…" exportPermission="customers.export"
      permissions={{ create: 'customers.create', update: 'customers.update', delete: 'customers.delete' }}
      filters={[
        { name: 'branch_id', label: 'branches', options: (lookups?.branches ?? []).map((b) => ({ value: b.id, label: b.name })) },
        { name: 'with_balance', label: 'customers', options: [{ value: 1, label: 'With balance due' }] },
      ]}
      columns={[
        { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs">{r.code}</span> },
        { key: 'name', header: 'Name', render: (r) => <b>{r.name}</b> },
        { key: 'mobile', header: 'Mobile' },
        { key: 'branch', header: 'Branch', render: (r) => r.branch?.name ?? '—' },
        { key: 'credit_limit', header: 'Credit limit', align: 'right', render: (r) => money(r.credit_limit) },
        { key: 'balance', header: 'Balance', align: 'right', render: (r) => <span className={r.balance > 0 ? 'font-bold text-rose-600' : r.balance < 0 ? 'font-bold text-emerald-600' : ''}>{money(r.balance)}</span> },
        { key: 'is_active', header: 'Status', render: (r) => yesNo(r.is_active) },
      ]}
      rowActions={(r) => can('customers.ledger') && <Link to={`/customers/${r.id}/ledger`} className="btn-icon" title="Ledger"><BookOpen className="h-4 w-4" /></Link>}
      fields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'mobile', label: 'Mobile', type: 'tel', required: true, placeholder: '07XXXXXXXX' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'branch_id', label: 'Home branch', type: 'select', options: (lookups?.branches ?? []).map((b) => ({ value: b.id, label: b.name })) },
        { name: 'credit_limit', label: 'Credit limit', type: 'number', default: 0 },
        { name: 'opening_balance', label: 'Opening balance', type: 'number', createOnly: true, default: 0, hint: 'Positive = customer owes; negative = advance' },
        { name: 'address', label: 'Address', full: true },
        { name: 'notes', label: 'Notes', type: 'textarea' },
        { name: 'sms_opt_in', label: 'Receive SMS', type: 'toggle', default: true },
        { name: 'is_active', label: 'Active', type: 'toggle', default: true },
      ]}
    />
  )
}
