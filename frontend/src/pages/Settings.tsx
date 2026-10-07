import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building, MessageSquare, Percent, Printer, Save, Settings as Cog } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { printReceipt } from '../lib/print'
import { ResourcePage, yesNo } from '../components/ResourcePage'
import { Card, Field, Input, PageHeader, Select, Spinner, Tabs, Textarea, Toggle } from '../components/ui'

type Tab = 'general' | 'receipt' | 'sms' | 'rates'

const SAMPLE = {
  order_no: 'ORD-MAIN-2610-00001', receipt_no: 'RCP-MAIN-2610-000001', queue_no: 12, created_at: new Date().toISOString(), delivery_at: new Date(Date.now() + 864e5).toISOString(),
  delivery_type: 'pickup', customer: { name: 'Sample Customer', mobile: '0771234567' }, user: { name: 'Cashier' }, branch: { name: 'Main Branch' },
  items: [{ description: 'Up to 5 kg - Wash & Dry', pricing_type: 'weight_range', weight: 4.2, quantity: 10, unit_price: 300, total: 1260, notes: 'Collar stain' },
    { description: 'Shirt / T-Shirt - Ironing', pricing_type: 'per_piece', quantity: 3, unit_price: 60, total: 180 }],
  subtotal: 1440, discount: 40, service_charge: 0, tax: 0, total: 1400, payments: [{ method: 'cash', amount: 1000 }], returned: 0, balance: 400, total_weight: 4.2, total_pieces: 13,
}

/** Settings: business, receipt preferences (module 47), SMS templates, financial rates (module 50). */
export default function SettingsPage() {
  const { refresh } = useAuth()
  const [tab, setTab] = useState<Tab>('general')
  const q = useQuery({ queryKey: ['settings'], queryFn: async () => (await api.get('settings')).data })
  const [form, setForm] = useState<Record<string, Record<string, string>>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (q.data) setForm(q.data) }, [q.data])

  const set = (g: string, k: string, v: string) => setForm((f) => ({ ...f, [g]: { ...f[g], [k]: v } }))
  const bool = (g: string, k: string, l: string) => <Toggle checked={form[g]?.[k] === '1'} onChange={(v) => set(g, k, v ? '1' : '0')} label={l} />
  const text = (g: string, k: string, l: string, hint?: string) => <Field label={l} hint={hint}><Input value={form[g]?.[k] ?? ''} onChange={(e) => set(g, k, e.target.value)} /></Field>

  const save = async (g: string) => {
    setBusy(true)
    try {
      await api.put(`settings/${g}`, form[g])
      toast.success('Settings saved')
      await refresh()
      q.refetch()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const saveBtn = (g: string) => <button className="btn-primary" disabled={busy} onClick={() => save(g)}>{busy ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}Save</button>

  if (!q.data || !form.general) return <Spinner />

  return (
    <div>
      <PageHeader title="Settings" icon={<Cog className="h-5 w-5" />} subtitle="Business, receipts, SMS and financial rates" />
      <div className="mb-6"><Tabs value={tab} onChange={setTab} tabs={[
        { value: 'general', label: 'Business', icon: <Building className="h-4 w-4" /> },
        { value: 'receipt', label: 'Receipt', icon: <Printer className="h-4 w-4" /> },
        { value: 'sms', label: 'SMS', icon: <MessageSquare className="h-4 w-4" /> },
        { value: 'rates', label: 'Tax & charges', icon: <Percent className="h-4 w-4" /> },
      ]} /></div>

      {tab === 'general' && (
        <Card actions={saveBtn('general')} title="Business details">
          <div className="grid gap-4 sm:grid-cols-2">
            {text('general', 'business_name', 'Business name')}{text('general', 'currency', 'Currency symbol')}
            {text('general', 'phone', 'Phone')}{text('general', 'email', 'Email')}
            {text('general', 'address', 'Address')}{text('general', 'default_delivery_hours', 'Default turnaround (hours)')}
            <div className="sm:col-span-2">{bool('general', 'require_shift', 'Require an open cashier shift to bill & take payments')}</div>
          </div>
        </Card>
      )}

      {tab === 'receipt' && (
        <Card title="Receipt layout & content" actions={<>
          <button className="btn-secondary" onClick={() => printReceipt(SAMPLE, { general: form.general, receipt: form.receipt })}><Printer className="h-4 w-4" />Test print</button>
          {saveBtn('receipt')}
        </>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Paper size"><Select value={form.receipt.paper_width} onChange={(e) => set('receipt', 'paper_width', e.target.value)}
              options={[{ value: '58', label: '58 mm thermal' }, { value: '80', label: '80 mm thermal' }, { value: 'A4', label: 'A4' }]} /></Field>
            <Field label="Copies"><Input type="number" min="1" max="3" value={form.receipt.copies} onChange={(e) => set('receipt', 'copies', e.target.value)} /></Field>
            <Field label="Header text" className="sm:col-span-2"><Textarea value={form.receipt.header_text} onChange={(e) => set('receipt', 'header_text', e.target.value)} /></Field>
            <Field label="Footer text / terms" className="sm:col-span-2"><Textarea value={form.receipt.footer_text} onChange={(e) => set('receipt', 'footer_text', e.target.value)} /></Field>
            {bool('receipt', 'show_logo', 'Show logo')}{bool('receipt', 'show_queue_no', 'Show queue number')}
            {bool('receipt', 'show_barcode', 'Show order barcode')}{bool('receipt', 'show_tax_breakdown', 'Show tax breakdown')}
            {bool('receipt', 'show_customer', 'Show customer details')}{bool('receipt', 'show_item_notes', 'Show item notes')}
          </div>
        </Card>
      )}

      {tab === 'sms' && (
        <Card title="SMS gateway & templates" actions={saveBtn('sms')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{bool('sms', 'enabled', 'SMS enabled')}</div>
            <Field label="Driver" hint="HTTP gateway URL & API key are configured in the server .env (never stored here)">
              <Select value={form.sms.driver} onChange={(e) => set('sms', 'driver', e.target.value)} options={[{ value: 'log', label: 'Log only (testing)' }, { value: 'http', label: 'HTTP gateway' }]} /></Field>
            {text('sms', 'sender_id', 'Sender ID', 'Max 11 letters/numbers')}
            {bool('sms', 'auto_on_order', 'Auto SMS when order is created')}{bool('sms', 'auto_on_ready', 'Auto SMS when order is ready')}
            {bool('sms', 'auto_on_delivered', 'Auto SMS when delivered')}
            <p className="text-xs text-slate-500 sm:col-span-2">Placeholders: {'{name} {order_no} {queue_no} {total} {balance} {currency} {business} {ebill_link}'}</p>
            {[['tpl_order_created', 'Order created'], ['tpl_order_ready', 'Order ready'], ['tpl_delivered', 'Delivered'], ['tpl_payment_reminder', 'Payment reminder'], ['tpl_ebill', 'E-bill']].map(([k, l]) => (
              <Field key={k} label={l} className="sm:col-span-2"><Textarea value={form.sms[k]} onChange={(e) => set('sms', k, e.target.value)} /></Field>
            ))}
          </div>
        </Card>
      )}

      {tab === 'rates' && (
        <ResourcePage<any> title="Financial Rates" endpoint="financial-rates" subtitle="Active tax and service charge rates are applied to every bill"
          permissions={{ create: 'settings.manage', update: 'settings.manage', delete: 'settings.manage' }}
          columns={[{ key: 'name', header: 'Name', render: (r) => <b>{r.name}</b> }, { key: 'type', header: 'Type', render: (r) => (r.type === 'tax' ? 'Tax' : 'Service charge') },
            { key: 'rate', header: 'Rate', align: 'right', render: (r) => `${r.rate}%` }, { key: 'is_active', header: 'Status', render: (r) => yesNo(r.is_active) }]}
          fields={[{ name: 'name', label: 'Name', required: true }, { name: 'type', label: 'Type', type: 'select', required: true, default: 'tax', options: [{ value: 'tax', label: 'Tax' }, { value: 'service_charge', label: 'Service charge' }] },
            { name: 'rate', label: 'Rate %', type: 'number', required: true }, { name: 'is_active', label: 'Active', type: 'toggle', default: true }]} />
      )}
    </div>
  )
}
