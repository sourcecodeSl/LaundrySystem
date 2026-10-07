import axios, { AxiosError, type AxiosRequestConfig } from 'axios'
import { toast } from 'sonner'

/**
 * Sanctum SPA authentication: the session lives in an HttpOnly cookie (never
 * readable by JS), and every state-changing request carries the XSRF token.
 * No auth tokens are stored in localStorage.
 */
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
  headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  timeout: 30000,
})

export const csrf = () => axios.get('/sanctum/csrf-cookie', { withCredentials: true })

type Handler = () => void
const handlers: { unauthenticated?: Handler; passwordChange?: Handler } = {}
export const onAuthEvent = (h: typeof handlers) => Object.assign(handlers, h)

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError<any>) => {
    const status = error.response?.status
    const cfg = error.config as AxiosRequestConfig & { _retried?: boolean }
    if (status === 419 && cfg && !cfg._retried) {
      // CSRF token expired → refresh once and retry
      cfg._retried = true
      await csrf()
      return api(cfg)
    }
    if (status === 401 && !cfg?.url?.includes('auth/me')) handlers.unauthenticated?.()
    if (status === 423) handlers.passwordChange?.()
    if (status === 429) toast.error('Too many requests. Please slow down.')
    return Promise.reject(error)
  },
)

/** Human readable error message from a Laravel response. */
export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  const err = e as AxiosError<any>
  const data = err?.response?.data
  if (data?.errors) {
    const first = Object.values(data.errors as Record<string, string[]>)[0]
    if (first?.[0]) return first[0]
  }
  return data?.message || err?.message || fallback
}

export function fieldErrors(e: unknown): Record<string, string> {
  const errs = (e as AxiosError<any>)?.response?.data?.errors ?? {}
  return Object.fromEntries(Object.entries(errs).map(([k, v]) => [k, (v as string[])[0]]))
}

export type Paginated<T> = { data: T[]; current_page: number; last_page: number; total: number; per_page: number; from: number; to: number }
