import { useState } from 'react'
import { KeyRound, LockOpen, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { ResourcePage, yesNo } from '../components/ResourcePage'
import { Field, Input, Modal, Spinner } from '../components/ui'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { dateTime } from '../lib/format'

export default function Users() {
  const { can, lookups } = useAuth()
  const [reset, setReset] = useState<any>(null)
  const [pw, setPw] = useState({ password: '', password_confirmation: '' })
  const [busy, setBusy] = useState(false)

  const doReset = async () => {
    setBusy(true)
    try {
      await api.post(`users/${reset.id}/reset-password`, pw)
      toast.success('Password reset. User must change it at next login.')
      setReset(null)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const unlock = async (id: number) => {
    try {
      await api.post(`users/${id}/unlock`)
      toast.success('Account unlocked')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const branches = (lookups?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))
  return (
    <>
      <ResourcePage<any>
        title="Users" icon={<UserCog className="h-5 w-5" />} endpoint="users" subtitle="System users, roles and branch assignment"
        permissions={{ create: 'users.create', update: 'users.update', delete: 'users.delete' }}
        filters={[{ name: 'branch_id', label: 'branches', options: branches }]}
        columns={[
          { key: 'name', header: 'Name', render: (r) => <div><b>{r.name}</b><p className="text-xs text-slate-500">@{r.username}</p></div> },
          { key: 'role', header: 'User type', render: (r) => r.role?.name },
          { key: 'branch', header: 'Branch', render: (r) => r.branch?.name ?? 'All branches' },
          { key: 'last_login_at', header: 'Last login', render: (r) => dateTime(r.last_login_at) },
          { key: 'is_active', header: 'Status', render: (r) => yesNo(r.is_active) },
        ]}
        rowActions={(r) => <>
          {can('users.reset_password') && <button className="btn-icon" title="Reset password" onClick={() => { setPw({ password: '', password_confirmation: '' }); setReset(r) }}><KeyRound className="h-4 w-4" /></button>}
          {can('users.update') && <button className="btn-icon" title="Unlock" onClick={() => unlock(r.id)}><LockOpen className="h-4 w-4" /></button>}
        </>}
        fields={[
          { name: 'name', label: 'Full name', required: true },
          { name: 'username', label: 'Username', required: true },
          { name: 'email', label: 'Email', type: 'email' },
          { name: 'mobile', label: 'Mobile', type: 'tel' },
          { name: 'role_id', label: 'User type', type: 'select', required: true, optionsFrom: { endpoint: 'roles', label: (r) => r.name } },
          { name: 'branch_id', label: 'Branch', type: 'select', options: branches, hint: 'Empty = access to all branches' },
          { name: 'password', label: 'Password', type: 'password', createOnly: true, required: true, hint: '8+ chars, upper, lower, number & symbol' },
          { name: 'password_confirmation', label: 'Confirm password', type: 'password', createOnly: true, required: true },
          { name: 'must_change_password', label: 'Must change password at login', type: 'toggle', default: true, createOnly: true },
          { name: 'is_active', label: 'Active', type: 'toggle', default: true },
        ]}
      />
      <Modal open={!!reset} onClose={() => setReset(null)} title={`Reset password · ${reset?.name ?? ''}`} size="sm" footer={<>
        <button className="btn-secondary" onClick={() => setReset(null)}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={doReset}>{busy && <Spinner className="h-4 w-4" />}Reset</button>
      </>}>
        <div className="space-y-4">
          <Field label="New password"><Input type="password" autoComplete="new-password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} /></Field>
          <Field label="Confirm"><Input type="password" autoComplete="new-password" value={pw.password_confirmation} onChange={(e) => setPw({ ...pw, password_confirmation: e.target.value })} /></Field>
          <p className="text-xs text-slate-500">All of the user's sessions are signed out and they must choose a new password at next login.</p>
        </div>
      </Modal>
    </>
  )
}
