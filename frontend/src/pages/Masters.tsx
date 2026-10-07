import { useParams, Link } from 'react-router-dom'
import { BadgePercent, BookOpen, Building2, Layers, Package, RotateCcw, Scale, ShieldAlert, Shirt, Tags, Truck } from 'lucide-react'
import { ResourcePage, yesNo, type ResourceConfig } from '../components/ResourcePage'
import { Empty, StatusBadge } from '../components/ui'
import { useAuth } from '../lib/auth'
import { date, label, money, qty } from '../lib/format'

const active = { name: 'is_active', label: 'Active', type: 'toggle' as const, default: true }
const activeFilter = { name: 'is_active', label: 'statuses', options: [{ value: 1, label: 'Active' }, { value: 0, label: 'Inactive' }] }
const opts = (xs: string[]) => xs.map((x) => ({ value: x, label: label(x) }))

const CONFIGS: Record<string, { view: string[]; cfg: ResourceConfig<any> }> = {
  branches: {
    view: ['branches.view'],
    cfg: {
      title: 'Branches', icon: <Building2 className="h-5 w-5" />, endpoint: 'branches', subtitle: 'Shop locations',
      permissions: { create: 'branches.create', update: 'branches.update', delete: 'branches.delete' },
      columns: [
        { key: 'code', header: 'Code', render: (r) => <b>{r.code}</b> },
        { key: 'name', header: 'Name' }, { key: 'phone', header: 'Phone' }, { key: 'address', header: 'Address' },
        { key: 'allow_password_change', header: 'Pwd change', render: (r) => (r.allow_password_change ? 'Allowed' : 'Locked') },
        { key: 'is_active', header: 'Status', render: (r) => yesNo(r.is_active) },
      ],
      filters: [activeFilter],
      fields: [
        { name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Name', required: true },
        { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email', type: 'email' },
        { name: 'address', label: 'Address', full: true },
        { name: 'allow_password_change', label: 'Users may change their password', type: 'toggle', default: true }, active,
      ],
    },
  },
  services: {
    view: ['services.view'],
    cfg: {
      title: 'Services', icon: <Shirt className="h-5 w-5" />, endpoint: 'services', subtitle: 'Service master (Dry, Wash & Dry, Ironing, Dry Cleaning)',
      permissions: { create: 'services.create', update: 'services.update', delete: 'services.delete' },
      columns: [
        { key: 'code', header: 'Code', render: (r) => <b>{r.code}</b> }, { key: 'name', header: 'Name' },
        { key: 'processing_hours', header: 'Turnaround (h)', align: 'right' }, { key: 'description', header: 'Description' },
        { key: 'is_active', header: 'Status', render: (r) => yesNo(r.is_active) },
      ],
      filters: [activeFilter],
      fields: [
        { name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Name', required: true },
        { name: 'processing_hours', label: 'Processing hours', type: 'number', default: 24, required: true },
        { name: 'description', label: 'Description', full: true }, active,
      ],
    },
  },
  'service-categories': {
    view: ['services.view'],
    cfg: {
      title: 'Service Categories', icon: <Tags className="h-5 w-5" />, endpoint: 'service-categories',
      permissions: { create: 'services.create', update: 'services.update', delete: 'services.delete' },
      columns: [{ key: 'name', header: 'Name', render: (r) => <b>{r.name}</b> }, { key: 'description', header: 'Description' }, { key: 'is_active', header: 'Status', render: (r) => yesNo(r.is_active) }],
      fields: [{ name: 'name', label: 'Name', required: true }, { name: 'description', label: 'Description', full: true }, active],
    },
  },
  'service-variants': {
    view: ['services.view'],
    cfg: {
      title: 'Service Variants', icon: <Scale className="h-5 w-5" />, endpoint: 'service-variants', subtitle: 'Weight-range, per-piece and per-item variants',
      permissions: { create: 'services.create', update: 'services.update', delete: 'services.delete' },
      columns: [
        { key: 'name', header: 'Variant', render: (r) => <b>{r.name}</b> },
        { key: 'category', header: 'Category', render: (r) => r.category?.name ?? '—' },
        { key: 'pricing_type', header: 'Pricing', render: (r) => label(r.pricing_type) },
        { key: 'range', header: 'Weight range', render: (r) => (r.pricing_type === 'weight_range' ? `${qty(r.min_weight)} – ${r.max_weight ? qty(r.max_weight) : '∞'} kg` : '—') },
        { key: 'unit', header: 'Unit' },
        { key: 'prices', header: 'Prices set', align: 'right', render: (r) => r.prices?.length ?? 0 },
        { key: 'is_active', header: 'Status', render: (r) => yesNo(r.is_active) },
      ],
      filters: [{ name: 'pricing_type', label: 'types', options: opts(['weight_range', 'per_piece', 'per_item']) }],
      fields: [
        { name: 'name', label: 'Name', required: true },
        { name: 'category_id', label: 'Category', type: 'select', optionsFrom: { endpoint: 'service-categories', label: (r) => r.name } },
        { name: 'pricing_type', label: 'Pricing type', type: 'select', required: true, options: opts(['weight_range', 'per_piece', 'per_item']), default: 'per_piece' },
        { name: 'unit', label: 'Unit', required: true, default: 'pcs' },
        { name: 'min_weight', label: 'Min weight (kg)', type: 'number', visible: (f) => f.pricing_type === 'weight_range' },
        { name: 'max_weight', label: 'Max weight (kg)', type: 'number', visible: (f) => f.pricing_type === 'weight_range', hint: 'Leave empty for no upper limit' },
        active,
      ],
    },
  },
  promotions: {
    view: ['promotions.view'],
    cfg: {
      title: 'Promotions', icon: <BadgePercent className="h-5 w-5" />, endpoint: 'promotions', subtitle: 'Special offers, discounts and package deals',
      permissions: { create: 'promotions.create', update: 'promotions.update', delete: 'promotions.delete' },
      columns: [
        { key: 'name', header: 'Name', render: (r) => <div><b>{r.name}</b>{r.code && <p className="text-xs text-slate-500">{r.code}</p>}</div> },
        { key: 'type', header: 'Type', render: (r) => label(r.type) },
        { key: 'value', header: 'Offer', render: (r) => r.type === 'percentage' ? `${r.value}%` : r.type === 'fixed' ? money(r.value) : `${r.package_qty} pcs for ${money(r.package_price)}` },
        { key: 'scope', header: 'Applies to', render: (r) => r.variant?.name ?? r.service?.name ?? 'All' },
        { key: 'min_amount', header: 'Min bill', align: 'right', render: (r) => money(r.min_amount) },
        { key: 'period', header: 'Period', render: (r) => `${r.starts_at ? date(r.starts_at) : 'Any'} → ${r.ends_at ? date(r.ends_at) : 'Open'}` },
        { key: 'is_active', header: 'Status', render: (r) => yesNo(r.is_active) },
      ],
      filters: [{ name: 'type', label: 'types', options: opts(['percentage', 'fixed', 'package']) }],
      fields: [
        { name: 'name', label: 'Name', required: true }, { name: 'code', label: 'Promo code' },
        { name: 'type', label: 'Type', type: 'select', required: true, options: opts(['percentage', 'fixed', 'package']), default: 'percentage' },
        { name: 'value', label: 'Value (% or amount)', type: 'number', visible: (f) => f.type !== 'package' },
        { name: 'package_qty', label: 'Package pieces', type: 'number', visible: (f) => f.type === 'package' },
        { name: 'package_price', label: 'Package price', type: 'number', visible: (f) => f.type === 'package' },
        { name: 'service_id', label: 'Limit to service', type: 'select', optionsFrom: { endpoint: 'services', label: (r) => r.name } },
        { name: 'variant_id', label: 'Limit to variant', type: 'select', optionsFrom: { endpoint: 'service-variants', label: (r) => r.name } },
        { name: 'min_amount', label: 'Minimum bill', type: 'number', default: 0 },
        { name: 'starts_at', label: 'Starts', type: 'date' }, { name: 'ends_at', label: 'Ends', type: 'date' },
        { name: 'description', label: 'Description', full: true }, active,
      ],
    },
  },
  items: {
    view: ['inventory.view'],
    cfg: {
      title: 'Consumable Items', icon: <Package className="h-5 w-5" />, endpoint: 'items', subtitle: 'Detergents, softeners, hangers, bags…',
      permissions: { create: 'inventory.manage_items', update: 'inventory.manage_items', delete: 'inventory.manage_items' },
      columns: [
        { key: 'code', header: 'Code', render: (r) => <b>{r.code}</b> }, { key: 'name', header: 'Name' }, { key: 'unit', header: 'Unit' },
        { key: 'cost_price', header: 'Cost', align: 'right', render: (r) => money(r.cost_price) },
        { key: 'reorder_level', header: 'Reorder level', align: 'right', render: (r) => qty(r.reorder_level) },
        { key: 'is_active', header: 'Status', render: (r) => yesNo(r.is_active) },
      ],
      fields: [
        { name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Name', required: true },
        { name: 'unit', label: 'Unit', required: true, default: 'pcs' }, { name: 'cost_price', label: 'Cost price', type: 'number', required: true, default: 0 },
        { name: 'reorder_level', label: 'Reorder level', type: 'number', required: true, default: 0 }, active,
      ],
    },
  },
  suppliers: {
    view: ['suppliers.view'],
    cfg: {
      title: 'Suppliers', icon: <Truck className="h-5 w-5" />, endpoint: 'suppliers',
      permissions: { create: 'suppliers.create', update: 'suppliers.update', delete: 'suppliers.delete' },
      columns: [
        { key: 'code', header: 'Code', render: (r) => <b>{r.code}</b> }, { key: 'name', header: 'Name' },
        { key: 'contact_person', header: 'Contact' }, { key: 'mobile', header: 'Mobile' },
        { key: 'balance', header: 'Payable', align: 'right', render: (r) => <span className={r.balance > 0 ? 'font-semibold text-rose-600' : ''}>{money(r.balance)}</span> },
        { key: 'is_active', header: 'Status', render: (r) => yesNo(r.is_active) },
      ],
      rowActions: (r) => <Link className="btn-icon" title="Ledger" to={`/suppliers/${r.id}/ledger`}><BookOpen className="h-4 w-4" /></Link>,
      fields: [
        { name: 'name', label: 'Name', required: true }, { name: 'contact_person', label: 'Contact person' },
        { name: 'mobile', label: 'Mobile', type: 'tel' }, { name: 'email', label: 'Email', type: 'email' },
        { name: 'address', label: 'Address', full: true },
        { name: 'opening_balance', label: 'Opening balance (payable)', type: 'number', createOnly: true, default: 0, hint: 'Negative = supplier owes us' }, active,
      ],
    },
  },
  'transaction-categories': {
    view: ['finance.transactions'],
    cfg: {
      title: 'Income & Expense Categories', icon: <Tags className="h-5 w-5" />, endpoint: 'transaction-categories',
      permissions: { create: 'finance.categories', update: 'finance.categories', delete: 'finance.categories' },
      columns: [{ key: 'name', header: 'Name', render: (r) => <b>{r.name}</b> }, { key: 'type', header: 'Type', render: (r) => <StatusBadge status={r.type === 'income' ? 'paid' : 'unpaid'} /> }, { key: 'is_active', header: 'Status', render: (r) => yesNo(r.is_active) }],
      filters: [{ name: 'type', label: 'types', options: opts(['income', 'expense']) }],
      fields: [{ name: 'name', label: 'Name', required: true }, { name: 'type', label: 'Type', type: 'select', required: true, options: opts(['income', 'expense']), default: 'expense' }, active],
    },
  },
  'billing-plans': {
    view: ['billing.plans'],
    cfg: {
      title: 'Billing Plans', icon: <Layers className="h-5 w-5" />, endpoint: 'billing-plans', subtitle: 'Memberships & monthly packages',
      permissions: { create: 'billing.plans', update: 'billing.plans', delete: 'billing.plans' },
      columns: [
        { key: 'name', header: 'Plan', render: (r) => <div><b>{r.name}</b><p className="text-xs text-slate-500">{r.description}</p></div> },
        { key: 'price', header: 'Price', align: 'right', render: (r) => money(r.price) },
        { key: 'duration_days', header: 'Days', align: 'right' },
        { key: 'limits', header: 'Limits', render: (r) => [r.weight_limit && `${qty(r.weight_limit)} kg`, r.piece_limit && `${r.piece_limit} pcs`].filter(Boolean).join(' · ') || 'Unlimited' },
        { key: 'discount_percent', header: 'Discount', align: 'right', render: (r) => `${r.discount_percent}%` },
        { key: 'is_active', header: 'Status', render: (r) => yesNo(r.is_active) },
      ],
      fields: [
        { name: 'name', label: 'Name', required: true }, { name: 'price', label: 'Price', type: 'number', required: true },
        { name: 'duration_days', label: 'Duration (days)', type: 'number', required: true, default: 30 },
        { name: 'discount_percent', label: 'Order discount %', type: 'number', default: 0 },
        { name: 'weight_limit', label: 'Weight limit (kg)', type: 'number' }, { name: 'piece_limit', label: 'Piece limit', type: 'number' },
        { name: 'description', label: 'Description', full: true }, active,
      ],
    },
  },
  complaints: {
    view: ['complaints.view'],
    cfg: {
      title: 'Re-wash & Complaints', icon: <RotateCcw className="h-5 w-5" />, endpoint: 'complaints', sendBranch: true,
      permissions: { create: 'complaints.create', update: 'complaints.update' },
      columns: [
        { key: 'ref_no', header: 'Ref', render: (r) => <b>{r.ref_no}</b> }, { key: 'created_at', header: 'Date', render: (r) => date(r.created_at) },
        { key: 'type', header: 'Type', render: (r) => label(r.type) },
        { key: 'order', header: 'Order', render: (r) => (r.order ? <Link className="text-brand-600 hover:underline" to={`/orders/${r.order.id}`}>{r.order.order_no}</Link> : '—') },
        { key: 'customer', header: 'Customer', render: (r) => r.customer?.name ?? '—' },
        { key: 'description', header: 'Description', className: 'max-w-xs truncate' },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ],
      filters: [{ name: 'type', label: 'types', options: opts(['rewash', 'complaint']) }, { name: 'status', label: 'statuses', options: opts(['open', 'in_progress', 'resolved', 'rejected']) }],
      fields: [
        { name: 'type', label: 'Type', type: 'select', required: true, options: opts(['rewash', 'complaint']), default: 'rewash' },
        { name: 'order_id', label: 'Order', type: 'select', createOnly: true, optionsFrom: { endpoint: 'orders', label: (r) => `${r.order_no} · ${r.customer?.name ?? 'Walk-in'}` } },
        { name: 'customer_id', label: 'Customer (if no order)', type: 'select', optionsFrom: { endpoint: 'customers', label: (r) => `${r.name} (${r.mobile})` } },
        { name: 'status', label: 'Status', type: 'select', options: opts(['open', 'in_progress', 'resolved', 'rejected']), default: 'open' },
        { name: 'description', label: 'Description', type: 'textarea', required: true },
        { name: 'resolution', label: 'Resolution', type: 'textarea' },
      ],
    },
  },
  'damage-lost': {
    view: ['damage_lost.view'],
    cfg: {
      title: 'Damage & Lost Register', icon: <ShieldAlert className="h-5 w-5" />, endpoint: 'damage-lost', sendBranch: true,
      permissions: { create: 'damage_lost.create', update: 'damage_lost.update', delete: 'damage_lost.update' },
      columns: [
        { key: 'ref_no', header: 'Ref', render: (r) => <b>{r.ref_no}</b> }, { key: 'reported_on', header: 'Reported', render: (r) => date(r.reported_on) },
        { key: 'type', header: 'Type', render: (r) => <StatusBadge status={r.type === 'lost' ? 'unpaid' : 'partial'} /> },
        { key: 'item_description', header: 'Item' },
        { key: 'order', header: 'Order', render: (r) => r.order?.order_no ?? '—' }, { key: 'customer', header: 'Customer', render: (r) => r.customer?.name ?? '—' },
        { key: 'compensation', header: 'Compensation', align: 'right', render: (r) => money(r.compensation) },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ],
      filters: [{ name: 'type', label: 'types', options: opts(['damage', 'lost']) }, { name: 'status', label: 'statuses', options: opts(['reported', 'investigating', 'compensated', 'closed']) }],
      fields: [
        { name: 'type', label: 'Type', type: 'select', required: true, options: opts(['damage', 'lost']), default: 'damage' },
        { name: 'reported_on', label: 'Reported on', type: 'date', required: true, default: new Date().toISOString().slice(0, 10) },
        { name: 'order_id', label: 'Order', type: 'select', createOnly: true, optionsFrom: { endpoint: 'orders', label: (r) => `${r.order_no} · ${r.customer?.name ?? 'Walk-in'}` } },
        { name: 'customer_id', label: 'Customer', type: 'select', optionsFrom: { endpoint: 'customers', label: (r) => `${r.name} (${r.mobile})` } },
        { name: 'item_description', label: 'Item description', required: true, full: true },
        { name: 'compensation', label: 'Compensation', type: 'number', default: 0 },
        { name: 'status', label: 'Status', type: 'select', options: opts(['reported', 'investigating', 'compensated', 'closed']), default: 'reported' },
        { name: 'description', label: 'Details', type: 'textarea' },
      ],
    },
  },
}

export default function Masters({ resource }: { resource?: string }) {
  const params = useParams()
  const { can } = useAuth()
  const key = resource ?? params.resource ?? ''
  const entry = CONFIGS[key]
  if (!entry) return <Empty title="Page not found" />
  if (!can(...entry.view)) return <Empty title="Access denied" text="You don't have permission to view this page." />
  return <ResourcePage key={key} {...entry.cfg} />
}
