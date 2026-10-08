import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { label } from '../lib/format'
import { Card, Confirm, Field, Input, Modal, PageHeader, Spinner, cx } from '../components/ui'
import { ErrorState, Skeleton } from '../components/feedback'

/** User types (module 22) and the permission matrix (module 24). */
export default function Roles() {
  const { can, lookups } = useAuth()
  const qc = useQueryClient()
  const roles = useQuery({ queryKey: ['roles'], queryFn: async () => (await api.get('roles', { params: { all: 1 } })).data.data as any[] })
  const [edit, setEdit] = useState<any>(null)
  const [del, setDel] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const modules = lookups?.permission_modules ?? {}
  const manage = can('roles.manage')

  const toggle = (p: string) => setEdit({ ...edit, permissions: edit.permissions.includes(p) ? edit.permissions.filter((x: string) => x !== p) : [...edit.permissions, p] })
  const toggleModule = (m: string) => {
    const ps = modules[m].map((a) => `${m}.${a}`)
    const all = ps.every((p) => edit.permissions.includes(p))
    setEdit({ ...edit, permissions: all ? edit.permissions.filter((x: string) => !ps.includes(x)) : [...new Set([...edit.permissions, ...ps])] })
  }

  const save = async () => {
    setBusy(true)
    try {
      const body = { name: edit.name, description: edit.description, permissions: edit.permissions }
      if (edit.id) await api.put(`roles/${edit.id}`, body)
      else await api.post('roles', body)
      toast.success('User type saved')
      setEdit(null)
      qc.invalidateQueries({ queryKey: ['roles'] })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="User Types & Permissions" subtitle="Control exactly what each type of user can see and do" icon={<ShieldCheck className="h-5 w-5" />}
        actions={manage && <button className="btn-primary" onClick={() => setEdit({ name: '', description: '', permissions: [] })}><Plus className="h-4 w-4" />New user type</button>} />
      {!roles.data ? (roles.isError ? <ErrorState error={roles.error} onRetry={() => roles.refetch()} /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.data.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-lg font-bold">{r.name}{r.is_super && <Lock className="h-4 w-4 text-amber-500" />}</p>
                  <p className="text-sm text-slate-500">{r.description}</p>
                </div>
                {manage && !r.is_super && <div className="flex">
                  <button className="btn-icon" onClick={() => setEdit({ ...r, permissions: r.permissions ?? [] })}><Pencil className="h-4 w-4" /></button>
                  <button className="btn-icon hover:!text-rose-600" onClick={() => setDel(r)}><Trash2 className="h-4 w-4" /></button>
                </div>}
              </div>
              <p className="mt-4 text-sm"><b>{r.is_super ? 'All' : (r.permissions ?? []).length}</b> <span className="text-slate-500">permissions</span></p>
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.keys(modules).filter((m) => r.is_super || (r.permissions ?? []).some((p: string) => p.startsWith(m + '.'))).slice(0, 12).map((m) => (
                  <span key={m} className="chip bg-slate-100 dark:bg-slate-800">{label(m)}</span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Edit · ${edit.name}` : 'New user type'} size="xl" footer={<>
        <span className="mr-auto self-center text-sm text-slate-500">{edit?.permissions.length} selected</span>
        <button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
        <button className="btn-primary" disabled={busy || !edit?.name} onClick={save}>{busy && <Spinner className="h-4 w-4" />}Save</button>
      </>}>
        {edit && <>
          <div className="mb-5 grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Description"><Input value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(modules).map(([m, actions]) => {
              const all = actions.every((a) => edit.permissions.includes(`${m}.${a}`))
              return (
                <div key={m} className="rounded-2xl border border-slate-100 p-3 dark:border-slate-800">
                  <label className="mb-2 flex items-center gap-2 font-semibold">
                    <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={all} onChange={() => toggleModule(m)} />{label(m)}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {actions.map((a) => {
                      const p = `${m}.${a}`
                      const on = edit.permissions.includes(p)
                      return <button key={p} type="button" onClick={() => toggle(p)}
                        className={cx('chip cursor-pointer py-1 transition', on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300')}>{label(a)}</button>
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </>}
      </Modal>
      <Confirm open={!!del} title="Delete user type?" confirmText="Delete" onClose={() => setDel(null)} message="Only user types without users can be deleted."
        busy={busy} onConfirm={async () => { setBusy(true); try { await api.delete(`roles/${del.id}`); toast.success('User type deleted'); setDel(null); roles.refetch() } catch (e) { toast.error(errorMessage(e)) } finally { setBusy(false) } }} />
    </div>
  )
}
