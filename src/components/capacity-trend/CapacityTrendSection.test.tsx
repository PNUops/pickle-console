import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import CapacityTrendSection from './CapacityTrendSection'
import { AdminScopeContext, type AdminScopeValue } from '../../lib/admin-scope-context'
import { capacityTrendFixture } from '../../test/msw/handlers/metrics'
import { server } from '../../test/msw/server'
import { uuid } from '../../test/msw/ids'

test('capacity placeholders preserve periods but discard data from another institution', async () => {
  const user = userEvent.setup()
  let release!: () => void
  let held = new Promise<void>((resolve) => { release = resolve })
  let requestedOrg: string | null | undefined
  server.use(http.get('*/api/v1/admin/capacity-trend', async ({ request }) => {
    const url = new URL(request.url)
    requestedOrg = url.searchParams.get('orgId')
    if (requestedOrg) await held
    return HttpResponse.json(capacityTrendFixture(Number(url.searchParams.get('days'))))
  }))
  const scope: AdminScopeValue = {
    tier: 'system', activeOrgId: undefined, activeOrg: undefined, activeOrgRole: undefined,
    options: [], requiresSelection: false, resolving: false, catalogPending: false, error: false, ready: true,
    retry: () => {}, setActiveOrgId: () => {}, path: (path) => path,
  }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AdminScopeContext.Provider value={scope}><CapacityTrendSection canFilterByOrg /></AdminScopeContext.Provider>
  </QueryClientProvider>)
  const period = `${capacityTrendFixture(90).from} ~ ${capacityTrendFixture(90).to}`
  await screen.findByText(period)
  await user.selectOptions(screen.getByLabelText('할당 추이 기관 필터'), uuid(1))
  await waitFor(() => expect(requestedOrg).toBe(uuid(1)))
  expect(screen.queryByText(period)).not.toBeInTheDocument()
  expect(screen.getByLabelText('할당 추이 불러오는 중')).toBeInTheDocument()
  release()
  await screen.findByText(period)

  held = new Promise<void>((resolve) => { release = resolve })
  await user.click(screen.getByRole('button', { name: '30일' }))
  expect(screen.getByText(period)).toBeInTheDocument()
  release()
  await waitFor(() => expect(screen.getByRole('button', { name: '30일' })).toHaveAttribute('aria-pressed', 'true'))
})
