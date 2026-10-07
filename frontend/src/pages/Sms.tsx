import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { BellRing, MessageSquare, Send } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage, type Paginated } from '../lib/api'
import { useAuth } from '../lib/auth'
import { dateTime, label } from '../lib/format'
import { CustomerPicker } from '../components/CustomerPicker'
import { DataTable } from '../components/DataTable'
import { Card, Confirm, Field, Input, Modal, PageHeader, Pagination, SearchInput, Select, Spinner, StatusBadge, Textarea } from '../components/ui'

/** Customer SMS (module 44): logs, custom messages and bulk payment reminders. */
export default function Sms() {
  const { can } = useAuth()
  const [page, setPage] = useState(1)
  const [f, setF] = useState({ q: '', type: '', status: '' })
  const [compose, setCompose] = useState<any>(null)
  const [remind, setRemind] = useState(false)
  const [minBal, setMinBal] = useState('0')
  const [busy, setBusy] = useState(false)
  const params = { ...f, page }
  const list = useQuery({ queryKey: ['sms', params], queryFn: async () => (await api.get<Paginated<any>>('sms', { params })).data, placeholderData: keepPreviousData, enabled: can('sms.view') })

  const send = async () => {
    setBusy(true)
    try {
      await api.post('sms', { customer_id: compose.customer?.id, mobile: compose.customer ? undefined : compose.mobile, message: compose.message })
      toast.success('SMS sent')
      setCompose(null)
      list.refetch()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const sendReminders = async () => {
    setBusy(true)
    try {
      const { data } = await api.post('sms/reminders', { min_balance: Number(minBal) || 0 })
      toast.success(`${data.sent} reminder(s) sent`)
      setRemind(false)
      list.refetch()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Customer SMS" subtitle="Order ready, delivered & payment reminder messages" icon={<MessageSquare className="h-5 w-5" />} actions={can('sms.send') && <>
        <button className="btn-secondary" onClick={() => setRemind(true)}><BellRing className="h-4 w-4" />Payment reminders</button>
        <button className="btn-primary" onClick={() => setCompose({ customer: null, mobile: '', message: '' })}><Send className="h-4 w-4" />Compose</button>
      </>} />
      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <SearchInput className="flex-1" value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="Mobile or message…" />
          <Select className="w-auto" placeholder="All types" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={['order_created', 'order_ready', 'delivered', 'payment_reminder', 'ebill', 'custom'].map((t) => ({ value: t, label: label(t) }))} />
          <Select className="w-auto" placeholder="All statuses" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={['sent', 'failed', 'skipped', 'queued'].map((t) => ({ value: t, label: label(t) }))} />
        </div>
        <DataTable rows={list.data?.data ?? []} loading={list.isFetching && !list.data} columns={[
          { key: 'created_at', header: 'Time', render: (r) => <span className="text-xs">{dateTime(r.created_at)}</span> },
          { key: 'mobile', header: 'To', render: (r) => <div>{r.customer?.name ?? '—'}<p className="text-xs text-slate-500">{r.mobile}</p></div> },
          { key: 'type', header: 'Type', render: (r) => label(r.type) },
          { key: 'message', header: 'Message', className: 'max-w-md', render: (r) => <p className="line-clamp-2 text-xs">{r.message}</p> },
          { key: 'status', header: 'Status', render: (r) => <span title={r.response ?? ''}><StatusBadge status={r.status} /></span> },
        ]} />
        {list.data && <Pagination page={list.data.current_page} last={list.data.last_page} total={list.data.total} onPage={setPage} />}
      </Card>
      <Modal open={!!compose} onClose={() => setCompose(null)} title="Compose SMS" footer={<>
        <button className="btn-secondary" onClick={() => setCompose(null)}>Cancel</button>
        <button className="btn-primary" disabled={busy || !compose?.message || (!compose?.customer && !compose?.mobile)} onClick={send}>{busy && <Spinner className="h-4 w-4" />}Send</button>
      </>}>
        {compose && <div className="space-y-4">
          <Field label="Customer"><CustomerPicker value={compose.customer} onChange={(c) => setCompose({ ...compose, customer: c })} /></Field>
          {!compose.customer && <Field label="…or mobile number"><Input value={compose.mobile} onChange={(e) => setCompose({ ...compose, mobile: e.target.value })} placeholder="0771234567" /></Field>}
          <Field label="Message" hint={`${compose.message.length}/480 characters`}><Textarea maxLength={480} value={compose.message} onChange={(e) => setCompose({ ...compose, message: e.target.value })} /></Field>
        </div>}
      </Modal>
      <Confirm open={remind} danger={false} title="Send payment reminders?" confirmText="Send reminders" busy={busy} onClose={() => setRemind(false)} onConfirm={sendReminders}
        message="Sends the payment reminder template to every opted-in customer with an outstanding balance (max 500).">
        <Field label="Minimum balance" className="mt-4"><Input type="number" value={minBal} onChange={(e) => setMinBal(e.target.value)} /></Field>
      </Confirm>
    </div>
  )
}
