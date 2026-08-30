import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { ADMIN_ORG_SCOPE_KEY } from '../lib/storage-keys'
import { currentPath, renderApp } from '../test/render'
import {
  ACCESS_TOKENS,
  orgAdminDualProfile,
  orgAdminUser,
  refreshSuccessHandler,
  sysAdminUser,
} from '../test/msw/handlers/auth'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'

const emptyRequests = {
  content: [],
  page: 0,
  size: 10,
  totalElements: 0,
  totalPages: 0,
}

function captureRequestScopes(scopes: Array<string | null>) {
  server.use(
    http.get('*/api/v1/admin/requests', ({ request }) => {
      scopes.push(new URL(request.url).searchParams.get('orgId'))
      return HttpResponse.json(emptyRequests)
    }),
  )
}

describe('관리 기관 scope selector', () => {
  test('단일 ORG 기관은 자동 선택하고 API와 모든 nav link에 scope를 전달한다', async () => {
    const scopes: Array<string | null> = []
    captureRequestScopes(scopes)
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin/requests')

    await waitFor(() => expect(currentPath()).toBe(`/admin/requests?org=${uuid(1)}`))
    expect(await screen.findByRole('heading', { name: '승인 대기' })).toBeInTheDocument()
    expect(scopes).toEqual([uuid(1)])
    expect(screen.getByLabelText('관리 기관 선택')).toHaveValue(uuid(1))
    expect(screen.getByRole('option', { name: /기관 관리자/ })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: '관리자 메뉴' })
    expect(within(nav).getByRole('link', { name: '가상머신' })).toHaveAttribute(
      'href',
      `/admin/vms?org=${uuid(1)}`,
    )
    for (const link of within(nav).getAllByRole('link')) {
      expect(new URL(link.getAttribute('href')!, 'https://pickle.invalid').searchParams.get('org')).toBe(
        uuid(1),
      )
    }
    expect(within(nav).queryByRole('link', { name: /LLM API/ })).not.toBeInTheDocument()
  })

  test('다기관 ORG는 선택 전 route page를 마운트하지 않고 선택 뒤에만 호출한다', async () => {
    const user = userEvent.setup()
    const scopes: Array<string | null> = []
    captureRequestScopes(scopes)
    server.use(refreshSuccessHandler('access-org-admin-dual', orgAdminUser))
    renderApp('/admin/requests')

    expect(await screen.findByRole('heading', { name: '관리 기관을 선택하세요' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '승인 대기' })).not.toBeInTheDocument()
    expect(scopes).toEqual([])

    const selector = screen.getByLabelText('관리 기관 선택')
    await user.selectOptions(selector, uuid(2))
    await waitFor(() => expect(currentPath()).toBe(`/admin/requests?org=${uuid(2)}`))
    expect(await screen.findByRole('heading', { name: '승인 대기' })).toBeInTheDocument()
    expect(scopes).toEqual([uuid(2)])
  })

  test('마지막 유효 ORG 선택을 복원하고 이전 기관의 workspace filter를 버린다', async () => {
    localStorage.setItem(ADMIN_ORG_SCOPE_KEY, uuid(2))
    server.use(refreshSuccessHandler('access-org-admin-dual', orgAdminUser))
    renderApp(`/admin/vms?workspaceId=${uuid(12)}`)

    await waitFor(() => expect(currentPath()).toBe(`/admin/vms?org=${uuid(2)}`))
    expect(screen.getByLabelText('관리 기관 선택')).toHaveValue(uuid(2))
    expect(await screen.findByRole('heading', { name: 'VM 관리' })).toBeInTheDocument()
  })

  test('SYS는 전체 플랫폼이 기본이고 native selector로 기관 scope를 선택한다', async () => {
    const user = userEvent.setup()
    const scopes: Array<string | null> = []
    captureRequestScopes(scopes)
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/requests')

    const selector = await screen.findByLabelText('관리 기관 선택')
    expect(selector.tagName).toBe('SELECT')
    expect(selector).toHaveClass('min-w-0', 'max-w-full')
    expect(selector).toHaveValue('')
    expect(scopes).toEqual([null])

    await screen.findByRole('option', { name: '테스트 기관' })
    selector.focus()
    expect(selector).toHaveFocus()
    await user.selectOptions(selector, uuid(2))
    await waitFor(() => expect(currentPath()).toBe(`/admin/requests?org=${uuid(2)}`))
    expect(scopes.at(-1)).toBe(uuid(2))
  })

  test('active 기관의 실제 역할을 nav action 의미에 사용한다', async () => {
    ACCESS_TOKENS['access-org-mixed'] = {
      ...orgAdminDualProfile,
      managedOrgs: [
        orgAdminDualProfile.managedOrgs[0],
        { ...orgAdminDualProfile.managedOrgs[1], role: 'ORG_VIEWER' },
      ],
    }
    try {
      server.use(refreshSuccessHandler('access-org-mixed', orgAdminUser))
      renderApp(`/admin?org=${uuid(2)}`)

      expect(await screen.findByRole('option', { name: /테스트 기관 · 기관 열람자/ })).toBeInTheDocument()
      const nav = screen.getByRole('navigation', { name: '관리자 메뉴' })
      expect(within(nav).queryByRole('link', { name: '감사 로그' })).not.toBeInTheDocument()
    } finally {
      delete ACCESS_TOKENS['access-org-mixed']
    }
  })

  test('존재하지 않는 SYS org query는 page 호출 전에 전체 플랫폼으로 되돌린다', async () => {
    const scopes: Array<string | null> = []
    captureRequestScopes(scopes)
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp(`/admin/requests?org=${uuid(999)}`)

    await waitFor(() => expect(currentPath()).toBe('/admin/requests'))
    expect(await screen.findByRole('heading', { name: '승인 대기' })).toBeInTheDocument()
    expect(scopes).toEqual([null])
  })
})
