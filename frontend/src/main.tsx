import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster, toast } from 'sonner'
import { errorMessage } from './lib/api'
import { AuthProvider } from './lib/auth'
import { ConfirmProvider, TopProgress } from './components/feedback'
import App from './App'
import './index.css'

// Statuses handled elsewhere: 401 → login screen, 423 → forced password change, 429 → api interceptor toast.
const SILENT = [401, 423, 429]

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // Background load failures surface as one toast per query (pages also show an inline error state).
    onError: (err: any, query) => {
      if (query.meta?.silent || SILENT.includes(err?.response?.status)) return
      toast.error(err?.code === 'ERR_NETWORK' ? 'Cannot reach the server' : errorMessage(err, 'Failed to load data'), { id: query.queryHash })
    },
  }),
  mutationCache: new MutationCache({
    // Mutations that don't handle their own errors still get an alert.
    onError: (err: any, _v, _c, mutation) => {
      if (mutation.options.onError || SILENT.includes(err?.response?.status)) return
      toast.error(errorMessage(err))
    },
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (count, err: any) => count < 1 && ![401, 403, 404, 422, 423].includes(err?.response?.status),
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ConfirmProvider>
            <TopProgress />
            <App />
            <Toaster richColors position="top-right" closeButton visibleToasts={4} toastOptions={{ duration: 4000 }} />
          </ConfirmProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
