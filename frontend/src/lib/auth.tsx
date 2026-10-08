import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, csrf, onAuthEvent } from './api'
import { setCurrency } from './format'

export type Branch = { id: number; code: string; name: string; address?: string; phone?: string }
export type Me = {
  user: { id: number; name: string; username: string; email?: string; branch_id: number | null; must_change_password: boolean }
  role: { id: number; name: string; is_super: boolean } | null
  branch: (Branch & { allow_password_change: boolean }) | null
  permissions: string[]
  all_branches: boolean
}
export type Lookups = {
  branches: Branch[]
  order_statuses: string[]
  payment_methods: string[]
  permission_modules: Record<string, string[]>
  settings: { general: Record<string, string>; receipt: Record<string, string> }
}

type AuthCtx = {
  me: Me | null
  lookups: Lookups | null
  loading: boolean
  can: (...perms: string[]) => boolean
  login: (username: string, password: string, remember: boolean) => Promise<Me>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  branchId: number | null // working branch (selected branch for multi-branch users)
  setBranchId: (id: number | null) => void
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [lookups, setLookups] = useState<Lookups | null>(null)
  const [loading, setLoading] = useState(true)
  const [branchId, setBranchState] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem('branch')
      return v ? Number(v) : null
    } catch {
      return null
    }
  })
  const qc = useQueryClient()

  const loadLookups = useCallback(async () => {
    const { data } = await api.get<Lookups>('lookups')
    setLookups(data)
    setCurrency(data.settings.general.currency)
    return data
  }, [])

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get<Me>('auth/me')
      setMe(data)
      if (!data.user.must_change_password) await loadLookups()
    } catch {
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [loadLookups])

  useEffect(() => {
    refresh()
    onAuthEvent({
      unauthenticated: () => {
        setMe((m) => {
          if (m) toast.warning('Your session has expired. Please sign in again.', { id: 'session-expired' })
          return null
        })
        qc.clear()
      },
      passwordChange: () => setMe((m) => (m ? { ...m, user: { ...m.user, must_change_password: true } } : m)),
    })
  }, [refresh, qc])

  const login = async (username: string, password: string, remember: boolean) => {
    await csrf()
    const { data } = await api.post<Me>('auth/login', { username, password, remember })
    setMe(data)
    if (!data.user.must_change_password) await loadLookups()
    return data
  }

  const logout = async () => {
    try {
      await api.post('auth/logout')
    } finally {
      setMe(null)
      setLookups(null)
      qc.clear()
    }
  }

  const setBranchId = (id: number | null) => {
    setBranchState(id)
    try {
      if (id) localStorage.setItem('branch', String(id))
      else localStorage.removeItem('branch')
    } catch {
      /* storage unavailable */
    }
    qc.invalidateQueries()
  }

  const can = useCallback((...perms: string[]) => !!me && (me.role?.is_super || perms.some((p) => me.permissions.includes(p))), [me])

  // Single-branch users are always locked to their branch.
  const effectiveBranch = me && !me.all_branches ? me.user.branch_id : branchId

  const value = useMemo(
    () => ({ me, lookups, loading, can, login, logout, refresh, branchId: effectiveBranch, setBranchId }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me, lookups, loading, can, effectiveBranch],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
