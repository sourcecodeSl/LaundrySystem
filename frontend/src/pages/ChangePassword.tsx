import { useState } from 'react'
import { Check, KeyRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage, fieldErrors } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Card, Field, Input, PageHeader, Spinner, cx } from '../components/ui'

const RULES: [string, (p: string) => boolean][] = [
  ['At least 8 characters', (p) => p.length >= 8],
  ['Upper & lower case letters', (p) => /[a-z]/.test(p) && /[A-Z]/.test(p)],
  ['At least one number', (p) => /\d/.test(p)],
  ['At least one symbol', (p) => /[^A-Za-z0-9]/.test(p)],
]

export default function ChangePassword({ forced = false }: { forced?: boolean }) {
  const { refresh, logout, me } = useAuth()
  const [form, setForm] = useState({ current_password: '', password: '', password_confirmation: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const allowed = forced || me?.role?.is_super || me?.branch?.allow_password_change !== false

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      await api.post('auth/change-password', form)
      toast.success('Password updated')
      setForm({ current_password: '', password: '', password_confirmation: '' })
      await refresh()
    } catch (err) {
      setErrors(fieldErrors(err))
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const body = (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Current password" error={errors.current_password}>
        <Input type="password" autoComplete="current-password" required value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} />
      </Field>
      <Field label="New password" error={errors.password}>
        <Input type="password" autoComplete="new-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </Field>
      <ul className="grid gap-1.5 text-xs sm:grid-cols-2">
        {RULES.map(([t, fn]) => (
          <li key={t} className={cx('flex items-center gap-1.5', fn(form.password) ? 'text-emerald-600' : 'text-slate-400')}>
            {fn(form.password) ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}{t}
          </li>
        ))}
      </ul>
      <Field label="Confirm new password" error={form.password_confirmation && form.password !== form.password_confirmation ? 'Passwords do not match' : undefined}>
        <Input type="password" autoComplete="new-password" required value={form.password_confirmation} onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })} />
      </Field>
      <div className="flex gap-2 pt-2">
        <button className="btn-primary flex-1" disabled={busy || !RULES.every(([, f]) => f(form.password)) || form.password !== form.password_confirmation}>
          {busy && <Spinner className="h-4 w-4" />}Update password
        </button>
        {forced && <button type="button" className="btn-secondary" onClick={() => logout()}>Sign out</button>}
      </div>
    </form>
  )

  if (forced) {
    return (
      <div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-50 to-cyan-50 p-6 dark:from-slate-950 dark:to-slate-900">
        <div className="card slide-up w-full max-w-md p-8">
          <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white"><KeyRound className="h-6 w-6" /></div>
          <h1 className="text-2xl font-extrabold">Set a new password</h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">For your security, you must change your password before continuing.</p>
          {body}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl">
      <PageHeader title="Change password" icon={<KeyRound className="h-5 w-5" />} subtitle="Other devices will be signed out." />
      <Card>{allowed ? body : <p className="text-sm text-slate-500">Password changes are disabled for your branch. Ask an administrator to reset your password.</p>}</Card>
    </div>
  )
}
