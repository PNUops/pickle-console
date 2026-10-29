import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { getAccessToken } from '../api/token'
import { server } from '../test/msw/server'
import { orgAdminProfile, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { AUTHORITY_OVERRIDES, mockInstitutionAuthority } from '../test/msw/institution-authority'
import { renderApp } from '../test/render'
import { AuthProvider } from './AuthProvider'
import { useAuth, type AuthContextValue } from './auth-context'
import { hasWork } from './institution-authority'

function noticeOnly() {
  const context = mockInstitutionAuthority(orgAdminProfile)
  context.accountRole = 'ORG_MANAGER'
  context.authorityFingerprint = 'synthetic-notice-source-one'
  context.assignments[0].permission = { mode: 'SELECTED', work: ['notice.manage'], scopes: {}, revision: 11 }
  AUTHORITY_OVERRIDES[orgAdminProfile.id] = context
  server.use(refreshSuccessHandler('access-org-admin'))
  return context
}

describe('current institution authority integration', () => {
  test('notice-only administrators enter the overview without forbidden summary requests', async () => {
    noticeOnly()
    let unrelated = 0
    server.use(http.get('*/api/v1/admin/summary', () => { unrelated++; return new HttpResponse(null, { status: 403 }) }),
      http.get('*/api/v1/admin/requests', () => { unrelated++; return new HttpResponse(null, { status: 403 }) }))
    renderApp('/admin')
    await screen.findByRole('heading', { name: '관리자 대시보드' })
    expect(screen.getByRole('navigation', { name: '허용된 관리자 업무' })).toHaveTextContent('공지사항')
    expect(screen.queryByRole('link', { name: '가상머신' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '관리 기관 선택' })).toHaveValue('')
    expect(unrelated).toBe(0)
  })

  test('a selected notice writer can open the authoring route without an administrator display role', async () => {
    noticeOnly()
    renderApp('/admin/notices/new')
    await screen.findByRole('heading', { name: '공지 등록' })
    expect(screen.getByRole('textbox', { name: '제목' })).toBeInTheDocument()
  })

  test('context loss keeps the authenticated account and token while removing administrator caches and commands', async () => {
    const initial = noticeOnly()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let auth!: AuthContextValue
    function Probe() {
      auth = useAuth()
      return <><output>{auth.status}:{auth.user?.id}:{auth.user?.role}</output>
        <button disabled={!hasWork(auth.user, 'notice.manage')}>Synthetic write</button></>
    }
    render(<QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>)
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled())
    client.setQueryData(['admin', 'secret-projection'], 'old projection')
    client.setQueryData(['personal', 'workspace'], 'personal membership')
    AUTHORITY_OVERRIDES[orgAdminProfile.id] = { ...initial, state: 'VALID_EMPTY', accountRole: 'USER', authorityFingerprint: null, assignments: [], catalogue: [] }
    await act(async () => { await auth.refreshProfile() })
    expect(screen.getByRole('button')).toBeDisabled()
    expect(auth.status).toBe('authenticated')
    expect(auth.user?.id).toBe(orgAdminProfile.id)
    expect(auth.user?.role).toBe('USER')
    expect(getAccessToken()).toBe('access-org-admin')
    expect(client.getQueryData(['admin', 'secret-projection'])).toBeUndefined()
    expect(client.getQueryData(['personal', 'workspace'])).toBe('personal membership')
  })

  test('an unavailable authority endpoint cannot create FULL from the old display role', async () => {
    noticeOnly()
    server.use(http.get('*/api/v1/me/institution-authority', () => HttpResponse.json({ state: 'INVALID' })))
    renderApp('/admin/notices/new')
    await screen.findByRole('heading', { name: '대시보드' })
    expect(screen.queryByRole('heading', { name: '공지 등록' })).not.toBeInTheDocument()
  })
})
