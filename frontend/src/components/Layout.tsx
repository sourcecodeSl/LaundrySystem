import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, ArrowLeftRight, BadgePercent, BarChart3, Boxes, Building2, Calculator, ClipboardCheck, ClipboardList, CreditCard,
  FileText, Gauge, KeyRound, Layers, LayoutGrid, LogOut, Menu, MessageSquare, Moon, Package, PackageMinus, PackagePlus, PackageSearch,
  RotateCcw, ScanBarcode, Settings, ShieldAlert, ShieldCheck, ShoppingBag, Shirt, Sun, Tags, Truck, Undo2,
  UserCog, Users, Wallet, Warehouse, Wrench, X, ChevronDown, Timer, BookOpen, Crown, ListChecks, Banknote, Scale,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { money } from '../lib/format'
import { cx } from './ui'
import { PageLoader, useConfirm } from './feedback'
import { NotificationBell } from './NotificationBell'

type NavItem = { to: string; label: string; icon: ReactNode; perm: string[] }
type NavGroup = { label: string; items: NavItem[] }

const i = (C: typeof Gauge) => <C className="h-[18px] w-[18px]" />

export const NAV: NavGroup[] = [
  { label: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: i(Gauge), perm: ['dashboard.view'] }] },
  {
    label: 'Sales', items: [
      { to: '/pos', label: 'New Order (POS)', icon: i(ShoppingBag), perm: ['pos.access'] },
      { to: '/orders', label: 'Orders', icon: i(ClipboardList), perm: ['orders.view'] },
      { to: '/production', label: 'Production Board', icon: i(LayoutGrid), perm: ['orders.status'] },
      { to: '/quotations', label: 'Quotations', icon: i(FileText), perm: ['quotations.view'] },
      { to: '/sales-returns', label: 'Sales Returns', icon: i(Undo2), perm: ['sales_returns.view'] },
      { to: '/calculator', label: 'Price Calculator', icon: i(Calculator), perm: ['pos.access', 'services.view'] },
    ],
  },
  {
    label: 'Customers', items: [
      { to: '/customers', label: 'Customers', icon: i(Users), perm: ['customers.view'] },
      { to: '/billing/subscriptions', label: 'Plan Subscriptions', icon: i(Crown), perm: ['billing.transactions'] },
      { to: '/billing/plans', label: 'Billing Plans', icon: i(Layers), perm: ['billing.plans'] },
      { to: '/complaints', label: 'Re-wash & Complaints', icon: i(RotateCcw), perm: ['complaints.view'] },
      { to: '/damage-lost', label: 'Damage & Lost', icon: i(ShieldAlert), perm: ['damage_lost.view'] },
      { to: '/sms', label: 'Customer SMS', icon: i(MessageSquare), perm: ['sms.view', 'sms.send'] },
    ],
  },
  {
    label: 'Catalog', items: [
      { to: '/services', label: 'Services', icon: i(Shirt), perm: ['services.view'] },
      { to: '/service-categories', label: 'Service Categories', icon: i(Tags), perm: ['services.view'] },
      { to: '/service-variants', label: 'Service Variants', icon: i(Scale), perm: ['services.view'] },
      { to: '/price-list', label: 'Price List', icon: i(ListChecks), perm: ['services.view'] },
      { to: '/promotions', label: 'Promotions', icon: i(BadgePercent), perm: ['promotions.view'] },
    ],
  },
  {
    label: 'Inventory', items: [
      { to: '/stock/levels', label: 'Stock Levels', icon: i(Boxes), perm: ['inventory.view'] },
      { to: '/stock/branch', label: 'Branch Stock', icon: i(Warehouse), perm: ['inventory.view'] },
      { to: '/stock/records', label: 'Stock Records', icon: i(PackageSearch), perm: ['inventory.view'] },
      { to: '/stock/docs/grns', label: 'GRN / Stock Add', icon: i(PackagePlus), perm: ['inventory.grn'] },
      { to: '/stock/docs/supplier-returns', label: 'Supplier Returns', icon: i(PackageMinus), perm: ['inventory.supplier_return'] },
      { to: '/stock/docs/adjustments', label: 'Stock Adjustments', icon: i(Wrench), perm: ['inventory.adjustment'] },
      { to: '/stock/docs/transfers', label: 'Stock Transfers', icon: i(ArrowLeftRight), perm: ['inventory.transfer'] },
      { to: '/stock/docs/counts', label: 'Stock Count', icon: i(ClipboardCheck), perm: ['inventory.count'] },
      { to: '/stock/docs/opening', label: 'Opening Stock', icon: i(Package), perm: ['inventory.opening'] },
      { to: '/items', label: 'Consumable Items', icon: i(Package), perm: ['inventory.view'] },
      { to: '/suppliers', label: 'Suppliers', icon: i(Truck), perm: ['suppliers.view'] },
      { to: '/supplier-payments', label: 'Supplier Payments', icon: i(Banknote), perm: ['suppliers.payments'] },
    ],
  },
  {
    label: 'Finance', items: [
      { to: '/cash-book', label: 'Cash Book', icon: i(BookOpen), perm: ['finance.cashbook'] },
      { to: '/transactions', label: 'Incomes & Expenses', icon: i(Wallet), perm: ['finance.transactions'] },
      { to: '/transaction-categories', label: 'Income/Expense Categories', icon: i(Tags), perm: ['finance.categories'] },
      { to: '/shifts', label: 'Cashier Shifts', icon: i(Timer), perm: ['shifts.manage'] },
      { to: '/cheques', label: 'Cheque Print', icon: i(CreditCard), perm: ['finance.cheques'] },
    ],
  },
  { label: 'Insights', items: [{ to: '/reports', label: 'Reports', icon: i(BarChart3), perm: ['reports.view'] }] },
  {
    label: 'Administration', items: [
      { to: '/branches', label: 'Branches', icon: i(Building2), perm: ['branches.view'] },
      { to: '/users', label: 'Users', icon: i(UserCog), perm: ['users.view'] },
      { to: '/roles', label: 'User Types & Permissions', icon: i(ShieldCheck), perm: ['roles.view'] },
      { to: '/settings', label: 'Settings', icon: i(Settings), perm: ['settings.manage'] },
      { to: '/activity-logs', label: 'Activity Logs', icon: i(Activity), perm: ['activity_logs.view'] },
    ],
  },
]

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem('theme', dark ? 'dark' : 'light') } catch { /* ignore */ }
  }, [dark])
  return [dark, setDark] as const
}

export function useShift() {
  return useQuery({ queryKey: ['shift-current'], queryFn: async () => (await api.get('shifts/current')).data.shift, staleTime: 30_000 })
}

export default function Layout() {
  const { me, lookups, can, logout, branchId, setBranchId } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dark, setDark] = useTheme()
  const [menu, setMenu] = useState(false)
  const [tag, setTag] = useState('')
  const nav = useNavigate()
  const loc = useLocation()
  const shift = useShift()
  const confirm = useConfirm()
  const business = lookups?.settings.general.business_name ?? 'Laundry'

  useEffect(() => setMobileOpen(false), [loc.pathname])

  // Network connectivity alerts
  useEffect(() => {
    const off = () => toast.error('You are offline. Changes cannot be saved until the connection is back.', { id: 'net', duration: Infinity })
    const on = () => toast.success('Back online', { id: 'net', duration: 3000 })
    window.addEventListener('offline', off)
    window.addEventListener('online', on)
    if (!navigator.onLine) off()
    return () => { window.removeEventListener('offline', off); window.removeEventListener('online', on) }
  }, [])

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((it) => can(...it.perm)) })).filter((g) => g.items.length)

  const lookupTag = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = tag.trim()
    if (!t) return
    try {
      const { data } = await api.get(`orders/tag/${encodeURIComponent(t)}`)
      setTag('')
      nav(`/orders/${data.id}`)
    } catch (err) {
      toast.error(errorMessage(err, 'No order found for that tag'))
    }
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-lg shadow-brand-500/30">
          <Shirt className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-extrabold tracking-tight text-white">{business}</p>
          <p className="text-[11px] font-medium text-slate-400">Laundry Management</p>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">{g.label}</p>
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.to === '/'}
                  className={({ isActive }) => cx('group flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition',
                    isActive ? 'bg-gradient-to-r from-brand-600/90 to-brand-500/60 text-white shadow-lg shadow-brand-900/30' : 'text-slate-400 hover:bg-white/5 hover:text-white')}>
                  {it.icon}<span className="truncate">{it.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  )

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 bg-slate-950 lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fade-in absolute inset-0 bg-slate-950/60" onClick={() => setMobileOpen(false)} />
          <aside className="slide-up absolute inset-y-0 left-0 w-72 bg-slate-950">
            <button className="absolute right-3 top-5 text-slate-400" onClick={() => setMobileOpen(false)}><X className="h-5 w-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button className="btn-icon lg:hidden" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5" /></button>

            {can('orders.view') && (
              <form onSubmit={lookupTag} className="relative hidden max-w-xs flex-1 md:block">
                <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="input py-2 pl-9" placeholder="Scan tag / order / receipt no…" value={tag} onChange={(e) => setTag(e.target.value)} />
              </form>
            )}
            <div className="flex-1" />

            {me?.all_branches ? (
              <select className="input w-auto py-2 text-sm font-semibold" value={branchId ?? ''} onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">All branches</option>
                {lookups?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            ) : (
              <span className="hidden items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold dark:bg-slate-800 sm:inline-flex">
                <Building2 className="h-4 w-4 text-brand-500" />{me?.branch?.name}
              </span>
            )}

            {can('shifts.manage') && (
              <NavLink to="/shifts" className={cx('hidden items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold sm:inline-flex',
                shift.data ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300')}>
                <span className={cx('h-2 w-2 rounded-full', shift.data ? 'animate-pulse bg-emerald-500' : 'bg-amber-500')} />
                {shift.data ? `Shift open · ${money(shift.data.summary?.expected_cash)}` : 'No open shift'}
              </NavLink>
            )}

            <NotificationBell />
            <button className="btn-icon" onClick={() => setDark(!dark)} title="Toggle theme">{dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>

            <div className="relative">
              <button onClick={() => setMenu(!menu)} className="flex items-center gap-2 rounded-xl p-1.5 pr-2 hover:bg-slate-100 dark:hover:bg-slate-800">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-sm font-bold text-white">
                  {me?.user.name.charAt(0).toUpperCase()}
                </span>
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block text-sm font-semibold">{me?.user.name}</span>
                  <span className="block text-[11px] text-slate-500">{me?.role?.name}</span>
                </span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                  <div className="slide-up absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                    <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => { setMenu(false); nav('/change-password') }}><KeyRound className="h-4 w-4" />Change password</button>
                    <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                      onClick={async () => { setMenu(false); if (await confirm({ title: 'Sign out?', message: 'You will need to sign in again to continue.', confirmText: 'Sign out', danger: false })) { await logout(); toast.success('Signed out') } }}><LogOut className="h-4 w-4" />Sign out</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] p-4 sm:p-6"><Suspense fallback={<PageLoader />}><Outlet /></Suspense></main>
      </div>
    </div>
  )
}

