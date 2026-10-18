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
import { orgs } from '../test/msw/handlers/reference'

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
  test('global support defaults to all institutions even for one assigned role', async () => {
    const scopes: Array<string | null> = []
    captureRequestScopes(scopes)
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin/requests')

    await waitFor(() => expect(currentPath()).toBe('/admin/requests'))
    expect(await screen.findByRole('heading', { name: '신청 검토' })).toBeInTheDocument()
    await waitFor(() => expect(scopes).toEqual([null]))
    expect(screen.getByLabelText('관리 기관 선택')).toHaveValue('')
    expect(screen.getByRole('option', { name: /기관 관리자/ })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: '관리자 메뉴' })
    expect(within(nav).getByRole('link', { name: '가상머신' })).toHaveAttribute(
      'href',
      '/admin/vms',
    )
    for (const link of within(nav).getAllByRole('link')) {
      expect(new URL(link.getAttribute('href')!, 'https://pickle.invalid').searchParams.get('org')).toBe(
        null,
      )
    }
    expect(within(nav).getByRole('link', { name: 'LLM API 키' })).toHaveAttribute(
      'href',
      '/admin/llm/keys',
    )
  })

  test('global support includes foreign institutions without requiring selection', async () => {
    const user = userEvent.setup()
    const scopes: Array<string | null> = []
    captureRequestScopes(scopes)
    server.use(refreshSuccessHandler('access-org-admin-dual', orgAdminUser))
    renderApp('/admin/requests')

    expect(await screen.findByRole('heading', { name: '신청 검토' })).toBeInTheDocument()
    await waitFor(() => expect(scopes).toEqual([null]))
    await screen.findByRole('option', { name: '테스트 기관 · 기관 관리자' })

    const selector = screen.getByLabelText('관리 기관 선택')
    await user.selectOptions(selector, uuid(2))
    await waitFor(() => expect(currentPath()).toBe(`/admin/requests?org=${uuid(2)}`))
    expect(await screen.findByRole('heading', { name: '신청 검토' })).toBeInTheDocument()
    await waitFor(() => expect(scopes).toEqual([null, uuid(2)]))
  })

  test('global support URLs retain their own target filters independently of stored institution', async () => {
    localStorage.setItem(ADMIN_ORG_SCOPE_KEY, uuid(2))
    server.use(refreshSuccessHandler('access-org-admin-dual', orgAdminUser))
    renderApp(`/admin/vms?workspaceId=${uuid(12)}`)

    await waitFor(() => expect(currentPath()).toBe(`/admin/vms?workspaceId=${uuid(12)}`))
    expect(screen.getByLabelText('관리 기관 선택')).toHaveValue('')
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
    await waitFor(() => expect(scopes).toEqual([null]))

    await screen.findByRole('option', { name: '테스트 기관' })
    selector.focus()
    expect(selector).toHaveFocus()
    await user.selectOptions(selector, uuid(2))
    await waitFor(() => expect(currentPath()).toBe(`/admin/requests?org=${uuid(2)}`))
    await waitFor(() => expect(scopes).toEqual([null, uuid(2)]))
  })

  test('a query filter keeps independent audit sources while the selected institution remains denied', async () => {
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
      expect(within(nav).getByRole('link', { name: '감사 로그' })).toHaveAttribute('href', `/admin/audit?org=${uuid(2)}`)
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
    expect(await screen.findByRole('heading', { name: '신청 검토' })).toBeInTheDocument()
    await waitFor(() => expect(scopes).toEqual([null]))
  })

  test('SYS 기관 목록 오류는 loading에 갇히지 않고 재시도 뒤 scope를 복구한다', async () => {
    const user = userEvent.setup()
    let calls = 0
    server.use(
      refreshSuccessHandler('access-sys-admin', sysAdminUser),
      http.get('*/api/v1/admin/support-orgs', () => {
        calls += 1
        return calls === 1
          ? HttpResponse.json(
              { title: '오류', status: 500, detail: '기관 목록 오류', code: 'INTERNAL_ERROR' },
              { status: 500 },
            )
          : HttpResponse.json(orgs)
      }),
    )
    renderApp(`/admin/requests?org=${uuid(1)}`)

    expect(
      await screen.findByRole('heading', { name: '관리 범위를 불러오지 못했습니다' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('관리 범위 확인 중')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '관리 범위 다시 시도' }))

    expect(await screen.findByRole('heading', { name: '신청 검토' })).toBeInTheDocument()
    expect(screen.getByLabelText('관리 기관 선택')).toHaveValue(uuid(1))
  })
})
