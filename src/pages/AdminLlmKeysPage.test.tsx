import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { orgAdminUser, refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

describe('관리자 LLM API 키 목록', () => {
  test('active 기관 범위의 키를 상태·워크스페이스·한도와 함께 나열한다', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin/llm/keys')

    expect(await screen.findByRole('heading', { name: 'LLM API 키', level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'active-admin-key' })).toHaveAttribute(
      'href',
      `/admin/llm/keys/${uuid(171)}?org=${uuid(1)}`,
    )
    expect(screen.getByText('suspended-admin-key')).toBeInTheDocument()
    expect(screen.queryByText('other-org-key')).not.toBeInTheDocument()
    expect(screen.getAllByText(/RPM 60 · TPM 40,000/).length).toBeGreaterThan(0)
  })

  test('상태·검색·워크스페이스 필터를 API 목록에 적용한다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/llm/keys')

    await screen.findByText('other-org-key')
    await user.selectOptions(screen.getByLabelText('LLM API 키 상태 필터'), 'SUSPENDED')
    expect(await screen.findByText('suspended-admin-key')).toBeInTheDocument()
    expect(screen.queryByText('active-admin-key')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('LLM API 키 상태 필터'), '')
    await user.type(screen.getByLabelText('LLM API 키 검색'), 'other-org')
    await waitFor(() => expect(screen.queryByText('active-admin-key')).not.toBeInTheDocument())
    expect(screen.getByText('other-org-key')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('LLM API 키 검색'))
    await user.selectOptions(screen.getByLabelText('LLM API 키 워크스페이스 필터'), uuid(12))
    expect(await screen.findByText('active-admin-key')).toBeInTheDocument()
    expect(screen.queryByText('other-org-key')).not.toBeInTheDocument()
  })

  test('기관 scope 변경 시 이전 기관 workspace 필터를 초기화한다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/llm/keys')

    const workspace = await screen.findByLabelText('LLM API 키 워크스페이스 필터')
    await within(workspace).findByRole('option', { name: '캡스톤 3조' })
    await user.selectOptions(workspace, uuid(12))
    expect(workspace).toHaveValue(uuid(12))
    await user.selectOptions(screen.getByLabelText('관리 기관 선택'), uuid(2))

    await waitFor(() => expect(workspace).toHaveValue(''))
    expect(await screen.findByText('other-org-key')).toBeInTheDocument()
    expect(screen.queryByText('active-admin-key')).not.toBeInTheDocument()
  })

  test('빈 목록과 서버 오류를 명시한다', async () => {
    server.use(
      refreshSuccessHandler('access-sys-admin', sysAdminUser),
      http.get('*/api/v1/admin/llm/keys', () =>
        HttpResponse.json({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }),
      ),
    )
    const empty = renderApp('/admin/llm/keys')
    expect(await screen.findByRole('heading', { name: '표시할 LLM API 키가 없습니다' })).toBeInTheDocument()
    empty.unmount()

    server.use(
      refreshSuccessHandler('access-sys-admin', sysAdminUser),
      http.get('*/api/v1/admin/llm/keys', () =>
        HttpResponse.json(
          { title: '오류', status: 500, detail: '목록 오류', code: 'INTERNAL_ERROR' },
          { status: 500, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    renderApp('/admin/llm/keys')
    expect(await screen.findByRole('alert')).toHaveTextContent('목록 오류')
  })
})
