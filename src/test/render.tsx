import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import App from '../App'
import { PathnameProbe } from './PathnameProbe'
import { AuthProvider } from '../auth/AuthProvider'
import { ReauthProvider } from '../auth/ReauthProvider'
import { ToastProvider } from '../components/ui'

/** 현재 경로 (renderApp으로 그린 화면에서만). */
export function currentPath(): string {
  return screen.getByTestId('app-pathname').textContent ?? ''
}

/** Render the full app (routing + auth + query) at the given route. */
export function renderApp(route = '/') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <ReauthProvider>
              <App />
              <PathnameProbe />
            </ReauthProvider>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}
