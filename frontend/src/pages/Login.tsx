import { useState } from 'react'
import { Eye, EyeOff, Lock, ShieldCheck, Shirt, Sparkles, User } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Spinner } from '../components/ui'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const me = await login(username.trim(), password, remember)
      setPassword('')
      toast.success(`Welcome back, ${me.user.name.split(' ')[0]}!`)
    } catch (err) {
      setError(errorMessage(err, 'Unable to sign in'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-slate-950 lg:block">
        <div className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-brand-600/40 blur-3xl" />
        <div className="absolute -bottom-40 right-0 h-[30rem] w-[30rem] rounded-full bg-accent-500/30 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 backdrop-blur"><Shirt className="h-6 w-6" /></div>
            <span className="text-xl font-extrabold">FreshFold Laundry</span>
          </div>
          <div>
            <h1 className="text-5xl font-extrabold leading-tight tracking-tight">Every garment,<br /><span className="bg-gradient-to-r from-brand-300 to-accent-400 bg-clip-text text-transparent">tracked & spotless.</span></h1>
            <p className="mt-5 max-w-md text-lg text-slate-300">Orders, production, inventory, finance and reporting for every branch — in one secure workspace.</p>
            <div className="mt-10 grid max-w-md grid-cols-2 gap-3 text-sm">
              {['Weight & piece billing', 'Barcode garment tags', 'Multi-branch stock', 'Role-based access'].map((f) => (
                <div key={f} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 backdrop-blur"><Sparkles className="h-4 w-4 text-accent-400" />{f}</div>
              ))}
            </div>
          </div>
          <p className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4" />Protected by encrypted sessions, CSRF tokens and login throttling.</p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="slide-up w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white"><Shirt className="h-6 w-6" /></div>
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Sign in</h2>
          <p className="mt-2 text-sm text-slate-500">Use the username issued by your administrator.</p>

          {error && <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="label">Username</span>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="input pl-10" autoFocus required autoComplete="username" maxLength={100} value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
            </label>
            <label className="block">
              <span className="label">Password</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="input px-10" required type={show ? 'text' : 'password'} autoComplete="current-password" maxLength={255}
                  value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => setShow(!show)}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <input type="checkbox" className="h-4 w-4 rounded accent-brand-600" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Keep me signed in on this device
            </label>
          </div>
          <button className="btn-primary mt-6 w-full py-3" disabled={busy}>{busy && <Spinner className="h-4 w-4" />}Sign in</button>
        </form>
      </div>
    </div>
  )
}
