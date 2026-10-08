import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Activity } from 'lucide-react'
import { api, type Paginated } from '../lib/api'
import { useAuth } from '../lib/auth'
import { dateTime, label } from '../lib/format'
import { DataTable } from '../components/DataTable'
import { Card, DateRange, Modal, PageHeader, Pagination, SearchInput, Select, cx } from '../components/ui'

const ACTIONS = ['created', 'updated', 'deleted', 'login', 'login_failed', 'logout', 'password_changed', 'password_reset', 'prices_updated', 'bulk_price_update', 'settings_updated']

export default function ActivityLogs() {
  const { branchId } = useAuth()
  const [page, setPage] = useState(1)
  const [f, setF] = useState({ q: '', action: '', from: '', to: '' })
  const [view, setView] = useState<any>(null)
  const params = { ...f, page, branch_id: branchId || undefined }
  const q = useQuery({ queryKey: ['activity', params], queryFn: async () => (await api.get<Paginated<any>>('activity-logs', { params })).data, placeholderData: keepPreviousData })
  return (
    <div>
      <PageHeader title="Activity Logs" subtitle="Audit trail of every change and sign-in" icon={<Activity className="h-5 w-5" />} />
      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <SearchInput className="flex-1" value={f.q} onChange={(v) => setF({ ...f, q: v })} placeholder="Description or IP…" />
          <Select className="w-auto" placeholder="All actions" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} options={ACTIONS.map((a) => ({ value: a, label: label(a) }))} />
          <DateRange from={f.from} to={f.to} onChange={(from, to) => setF({ ...f, from, to })} />
        </div>
        <DataTable rows={q.data?.data ?? []} loading={q.isFetching} error={q.error} onRetry={() => q.refetch()} onRowClick={(r) => r.changes && setView(r)} columns={[
          { key: 'created_at', header: 'Time', render: (r) => <span className="text-xs">{dateTime(r.created_at)}</span> },
          { key: 'user', header: 'User', render: (r) => r.user?.name ?? 'System' },
          { key: 'action', header: 'Action', render: (r) => <span className={cx('chip', r.action === 'login_failed' || r.action === 'deleted' ? 'bg-rose-100 text-rose-700' : r.action === 'created' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>{label(r.action)}</span> },
          { key: 'description', header: 'Description', render: (r) => <>{r.description}{r.subject_id ? <span className="text-xs text-slate-400"> #{r.subject_id}</span> : null}</> },
          { key: 'ip_address', header: 'IP', render: (r) => <span className="font-mono text-xs">{r.ip_address}</span> },
        ]} />
        {q.data && <Pagination page={q.data.current_page} last={q.data.last_page} total={q.data.total} onPage={setPage} />}
      </Card>
      <Modal open={!!view} onClose={() => setView(null)} title={view?.description} size="lg">
        <pre className="max-h-[60vh] overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-emerald-300">{JSON.stringify(view?.changes, null, 2)}</pre>
      </Modal>
    </div>
  )
}
