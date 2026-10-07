import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ShieldX } from 'lucide-react'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import { Empty, Spinner } from './components/ui'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Pos = lazy(() => import('./pages/Pos'))
const Orders = lazy(() => import('./pages/Orders'))
const OrderDetail = lazy(() => import('./pages/OrderDetail'))
const Production = lazy(() => import('./pages/Production'))
const Quotations = lazy(() => import('./pages/Quotations'))
const SalesReturns = lazy(() => import('./pages/SalesReturns'))
const Calculator = lazy(() => import('./pages/Calculator'))
const Customers = lazy(() => import('./pages/Customers'))
const CustomerLedger = lazy(() => import('./pages/CustomerLedger'))
const Masters = lazy(() => import('./pages/Masters'))
const PriceList = lazy(() => import('./pages/PriceList'))
const StockLevels = lazy(() => import('./pages/stock/StockLevels'))
const BranchStock = lazy(() => import('./pages/stock/BranchStock'))
const StockRecords = lazy(() => import('./pages/stock/StockRecords'))
const StockDocs = lazy(() => import('./pages/stock/StockDocs'))
const SupplierLedger = lazy(() => import('./pages/SupplierLedger'))
const SupplierPayments = lazy(() => import('./pages/finance/SupplierPayments'))
const CashBook = lazy(() => import('./pages/finance/CashBook'))
const Transactions = lazy(() => import('./pages/finance/Transactions'))
const Shifts = lazy(() => import('./pages/finance/Shifts'))
const Cheques = lazy(() => import('./pages/finance/Cheques'))
const Subscriptions = lazy(() => import('./pages/Subscriptions'))
const Sms = lazy(() => import('./pages/Sms'))
const Reports = lazy(() => import('./pages/Reports'))
const Roles = lazy(() => import('./pages/Roles'))
const Users = lazy(() => import('./pages/Users'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const ActivityLogs = lazy(() => import('./pages/ActivityLogs'))
const Ebill = lazy(() => import('./pages/Ebill'))

const Loading = () => <div className="grid min-h-[50vh] place-items-center"><Spinner className="h-7 w-7 text-brand-500" /></div>

function Guard({ perm, children }: { perm: string[]; children: ReactNode }) {
  const { can } = useAuth()
  return can(...perm) ? <>{children}</> : <Empty icon={<ShieldX className="h-7 w-7" />} title="Access denied" text="You don't have permission to view this page." />
}

const g = (perm: string | string[], el: ReactNode) => <Guard perm={Array.isArray(perm) ? perm : [perm]}>{el}</Guard>

export default function App() {
  const { me, loading } = useAuth()
  const loc = useLocation()

  if (loc.pathname.startsWith('/ebill/')) {
    return <Suspense fallback={<Loading />}><Routes><Route path="/ebill/:token" element={<Ebill />} /></Routes></Suspense>
  }
  if (loading) return <div className="grid min-h-screen place-items-center"><Spinner className="h-8 w-8 text-brand-500" /></div>
  if (!me) return <Login />
  if (me.user.must_change_password) return <ChangePassword forced />

  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={me.permissions.includes('dashboard.view') || me.role?.is_super ? <Dashboard /> : <Navigate to="/orders" replace />} />
          <Route path="pos" element={g('pos.access', <Pos />)} />
          <Route path="orders" element={g('orders.view', <Orders />)} />
          <Route path="orders/:id" element={g('orders.view', <OrderDetail />)} />
          <Route path="production" element={g('orders.status', <Production />)} />
          <Route path="quotations" element={g('quotations.view', <Quotations />)} />
          <Route path="sales-returns" element={g('sales_returns.view', <SalesReturns />)} />
          <Route path="calculator" element={g(['pos.access', 'services.view'], <Calculator />)} />
          <Route path="customers" element={g('customers.view', <Customers />)} />
          <Route path="customers/:id/ledger" element={g('customers.ledger', <CustomerLedger />)} />
          <Route path="suppliers/:id/ledger" element={g('suppliers.ledger', <SupplierLedger />)} />
          <Route path="price-list" element={g('services.view', <PriceList />)} />
          <Route path="stock/levels" element={g('inventory.view', <StockLevels />)} />
          <Route path="stock/branch" element={g('inventory.view', <BranchStock />)} />
          <Route path="stock/records" element={g('inventory.view', <StockRecords />)} />
          <Route path="stock/docs/:type" element={g('inventory.view', <StockDocs />)} />
          <Route path="supplier-payments" element={g('suppliers.payments', <SupplierPayments />)} />
          <Route path="cash-book" element={g('finance.cashbook', <CashBook />)} />
          <Route path="transactions" element={g('finance.transactions', <Transactions />)} />
          <Route path="shifts" element={g('shifts.manage', <Shifts />)} />
          <Route path="cheques" element={g('finance.cheques', <Cheques />)} />
          <Route path="billing/subscriptions" element={g('billing.transactions', <Subscriptions />)} />
          <Route path="sms" element={g(['sms.view', 'sms.send'], <Sms />)} />
          <Route path="reports" element={g('reports.view', <Reports />)} />
          <Route path="roles" element={g('roles.view', <Roles />)} />
          <Route path="users" element={g('users.view', <Users />)} />
          <Route path="settings" element={g('settings.manage', <SettingsPage />)} />
          <Route path="activity-logs" element={g('activity_logs.view', <ActivityLogs />)} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path=":resource" element={<Masters />} />
          <Route path="billing/plans" element={<Masters resource="billing-plans" />} />
          <Route path="*" element={<Empty title="Page not found" />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
