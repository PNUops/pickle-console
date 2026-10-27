import { act, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import App from '../App'
import type { AdminLlmKeyDetail } from '../api/queries'
import { requestReaderKey } from '../api/request-review'
import { setAccessToken } from '../api/token'
import { AuthContext, type AuthContextValue } from '../auth/auth-context'
import { ToastProvider } from '../components/ui'
import { singleProjectionResponse } from '../test/llm-projection-fixture'
import { ACCESS_TOKENS } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'

test.each(['financeVisible', 'observationVisible'] as const)('a current row mask immediately hides a same-reader cached impact through a failed refresh (%s)', async (mask) => {
  const row = structuredClone(singleProjectionResponse)
  const user = ACCESS_TOKENS['access-sys-admin']
  setAccessToken('access-sys-admin')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  let reduced = false
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const current: AdminLlmKeyDetail = { ...row, limitsProjection: null, metadataVisible: false, tokenReferenceVisible: false,
    allowedWorkIds: ['llm.key.budget', mask === 'financeVisible' ? 'llm.observe' : 'llm.key.cost.read'] }
  current[mask] = false
  let saved: Record<string, unknown> | undefined
  server.use(http.get('*/api/v1/admin/llm/keys/:keyId', async ({ request }) => {
    if (new URL(request.url).searchParams.has('projectLimits')) {
      if (reduced) { await gate; return new HttpResponse(null, { status: 503 }) }
      return HttpResponse.json(row)
    }
    return HttpResponse.json(reduced ? current : { ...row, limitsProjection: null })
  }), http.put('*/api/v1/admin/llm/keys/:keyId/limits', async ({ request }) => {
    saved = await request.json() as Record<string, unknown>
    return HttpResponse.json({ ...current, creditLimit: saved.creditLimit })
  }))
  const auth: AuthContextValue = { status: 'authenticated', user,
    login: async () => { throw new Error('Unused credential exchange') }, completeMfa: async () => { throw new Error('Unused credential exchange') },
    refreshProfile: async () => {}, logout: async () => {}, beginCredentialExchange: () => { throw new Error('Unused credential exchange') } }
  render(<MemoryRouter initialEntries={[`/admin/llm/keys/${row.id}`]}><QueryClientProvider client={client}>
    <AuthContext.Provider value={auth}><ToastProvider><App /></ToastProvider></AuthContext.Provider>
  </QueryClientProvider></MemoryRouter>)
  const actions = userEvent.setup()
  await actions.click(await screen.findByRole('button', { name: '한도 변경' }))
  let modal = within(screen.getByRole('dialog'))
  await actions.clear(modal.getByLabelText('금액 한도 (USD)'))
  await actions.type(modal.getByLabelText('금액 한도 (USD)'), '20')
  await modal.findByText('$5.00 → $15.00')
  await actions.click(modal.getByRole('button', { name: '취소' }))
  reduced = true
  await act(async () => { client.setQueryData(['admin', 'llm-keys', 'detail', { keyId: row.id, orgId: null, reader: requestReaderKey(user) }], current) })
  try {
    await actions.click(screen.getByRole('button', { name: '한도 변경' }))
    modal = within(screen.getByRole('dialog'))
    await actions.clear(modal.getByLabelText('금액 한도 (USD)'))
    await actions.type(modal.getByLabelText('금액 한도 (USD)'), '20')
    expect.soft(modal.queryByText('$5.00 → $15.00')).not.toBeInTheDocument()
    await act(async () => { release(); await gate })
    await modal.findByText(/계정 영향을 조회하지 못했습니다/)
    expect.soft(modal.queryByText('$5.00 → $15.00')).not.toBeInTheDocument()
    await actions.click(modal.getByRole('button', { name: '저장' }))
    await screen.findByText('LLM API 키 한도를 변경했습니다.')
    expect(saved).toHaveProperty('creditLimit', 20)
    expect(saved).not.toHaveProperty('dailyTokens')
  } finally { release() }
})
