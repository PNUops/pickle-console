import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { http, HttpResponse } from 'msw'
import { describe, expect, test, vi } from 'vitest'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { ToastProvider } from '../components/ui'
import { server } from '../test/msw/server'
import { adminLlmKeyStore, adminLlmLimitBodies } from '../test/msw/handlers/llm-keys'
import { orgAdminUser, refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

function renderHistory(entries: string[]) {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const cached = adminLlmKeyStore.find((key) => key.id === uuid(172))!
  client.setQueryData(['admin', 'llm-keys', 'detail', { keyId: cached.id, orgId: null }], cached)
  const router = createMemoryRouter([
    { path: '*', element: <QueryClientProvider client={client}><AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider></QueryClientProvider> },
  ], { initialEntries: entries, initialIndex: entries.length - 1 })
  render(<RouterProvider router={router} />)
  return { router, client }
}

describe('administrator target state', () => {
  test('an explicit unmanaged institution cannot restore the previous institution', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp(`/admin/llm/keys/${uuid(171)}?org=${uuid(2)}`)
    await screen.findByText('관리 기관을 선택하세요')
    expect(screen.queryByRole('heading', { name: 'active-admin-key' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '한도 변경' })).not.toBeInTheDocument()
  })
  test('Back to a cached key discards the previous limits and saves only the new input', async () => {
    const user = userEvent.setup()
    const { router } = renderHistory([`/admin/llm/keys/${uuid(172)}`, `/admin/llm/keys/${uuid(171)}`])
    await user.click(await screen.findByRole('button', { name: '한도 변경' }))
    let dialog = within(screen.getByRole('dialog', { name: 'LLM API 키 한도 변경' }))
    await user.clear(dialog.getByLabelText('RPM'))
    await user.type(dialog.getByLabelText('RPM'), '987')
    await act(() => router.navigate(-1))
    await screen.findByRole('heading', { name: 'suspended-admin-key' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(adminLlmLimitBodies).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: '한도 변경' }))
    dialog = within(screen.getByRole('dialog', { name: 'LLM API 키 한도 변경' }))
    expect(dialog.getByLabelText('RPM')).toHaveValue(60)
    await user.clear(dialog.getByLabelText('RPM'))
    await user.type(dialog.getByLabelText('RPM'), '81')
    await user.click(dialog.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(adminLlmLimitBodies).toHaveLength(1))
    expect(adminLlmKeyStore.find((key) => key.id === uuid(172))?.rpm).toBe(81)
    expect(adminLlmKeyStore.find((key) => key.id === uuid(171))?.rpm).toBe(60)
  })

  test('switching institution closes the editor before a delayed mismatched detail arrives', async () => {
    const user = userEvent.setup()
    const { router } = renderHistory([`/admin/llm/keys/${uuid(171)}?org=${uuid(1)}`])
    await user.click(await screen.findByRole('button', { name: '한도 변경' }))
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    server.use(http.get('*/api/v1/admin/llm/keys/:keyId', async () => {
      await held
      return HttpResponse.json(adminLlmKeyStore.find((key) => key.id === uuid(171)))
    }))
    await act(() => router.navigate(`/admin/llm/keys/${uuid(171)}?org=${uuid(2)}`))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'active-admin-key' })).not.toBeInTheDocument()
    release()
    await screen.findByText('현재 관리 범위에서 이 LLM API 키를 찾을 수 없습니다.')
    expect(adminLlmLimitBodies).toHaveLength(0)
  })

  test('a delayed save cannot refill a cleared detail cache after leaving its editor', async () => {
    const user = userEvent.setup()
    const { router, client } = renderHistory([`/admin/llm/keys/${uuid(171)}`])
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    let started = false
    server.use(http.put('*/api/v1/admin/llm/keys/:keyId/limits', async () => {
      started = true
      await held
      return HttpResponse.json({ ...adminLlmKeyStore.find((key) => key.id === uuid(171)), rpm: 81 })
    }))
    await user.click(await screen.findByRole('button', { name: '한도 변경' }))
    const dialog = within(screen.getByRole('dialog', { name: 'LLM API 키 한도 변경' }))
    await user.click(dialog.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(started).toBe(true))
    await act(() => router.navigate('/admin/users'))
    client.clear()
    const invalidations = vi.spyOn(client, 'invalidateQueries')
    release()
    await waitFor(() => expect(invalidations).toHaveBeenCalledWith({ queryKey: ['admin', 'llm-accounts'] }))
    expect(client.getQueryData(['admin', 'llm-keys', 'detail', { keyId: uuid(171), orgId: null }])).toBeUndefined()
    expect(screen.queryByText('LLM API 키 한도를 변경했습니다.')).not.toBeInTheDocument()
    invalidations.mockRestore()
  })
})
