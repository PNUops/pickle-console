import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  refreshSuccessHandler,
  sysAdminUser,
} from '../test/msw/handlers/auth'
import { toVmSummary, vmStore } from '../test/msw/handlers/vms'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderAsOrgAdmin() {
  server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
  renderApp('/admin/vms')
}

function renderAsSysAdmin() {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp('/admin/vms')
}

describe('관리자 VM 목록', () => {
  test('VM을 워크스페이스 이름과 함께 나열하고 상태 탭·관리 범위가 동작한다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await screen.findByRole('heading', { name: 'VM 관리' })
    expect(await screen.findByText('관리자 가상머신 목록')).toBeInTheDocument()
    const row = (await screen.findByRole('link', { name: 'capstone-team3-api' })).closest('tr')!
    expect(within(row).getByText('캡스톤 3조')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '중지됨' }))
    expect(await screen.findByRole('link', { name: 'web-lab' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'capstone-team3-api' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '전체' }))
    await user.selectOptions(screen.getByLabelText('관리 기관 선택'), uuid(2))
    expect(await screen.findByRole('link', { name: 'ai-train' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'capstone-team3-api' })).not.toBeInTheDocument()
    expect(screen.getByText(/테스트 기관 가상머신을 조회합니다/)).toBeInTheDocument()
  })

  test('기관 scope 응답 대기 중 이전 기관 행과 상세 link를 숨긴다', async () => {
    const user = userEvent.setup()
    let releaseOrgResponse!: () => void
    const orgResponsePending = new Promise<void>((resolve) => {
      releaseOrgResponse = resolve
    })
    server.use(
      http.get('*/api/v1/admin/vms', async ({ request }) => {
        if (new URL(request.url).searchParams.get('orgId') !== uuid(2)) return
        await orgResponsePending
        const scopedVm = vmStore.find((vm) => vm.orgId === uuid(2))!
        return HttpResponse.json({
          content: [toVmSummary(scopedVm)],
          page: 0,
          size: 10,
          totalElements: 1,
          totalPages: 1,
        })
      }),
    )
    renderAsSysAdmin()

    expect(await screen.findByRole('link', { name: 'algo-judge' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('관리 기관 선택'), uuid(2))

    expect(screen.queryByRole('link', { name: 'algo-judge' })).not.toBeInTheDocument()
    releaseOrgResponse()
    expect(await screen.findByRole('link', { name: 'ai-train' })).toBeInTheDocument()
  })

  test('이름 검색과 정렬 헤더가 서버 파라미터로 동작한다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()
    await screen.findByRole('link', { name: 'capstone-team3-api' })

    await user.type(screen.getByLabelText('VM 검색'), 'algo')
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'capstone-team3-api' })).not.toBeInTheDocument(),
    )
    expect(await screen.findByRole('link', { name: 'algo-judge' })).toBeInTheDocument()
    await user.clear(screen.getByLabelText('VM 검색'))
    await screen.findByRole('link', { name: 'capstone-team3-api' })

    await user.click(screen.getByRole('button', { name: '이름' }))
    expect(screen.getByRole('columnheader', { name: '이름' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    await waitFor(() => {
      expect(within(screen.getAllByRole('row')[1]).getByRole('link', { name: 'ai-train' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '이름' }))
    expect(screen.getByRole('columnheader', { name: '이름' })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    await waitFor(() => {
      expect(within(screen.getAllByRole('row')[1]).getByRole('link', { name: 'web-lab' })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: '이름' }))
    expect(screen.getByRole('columnheader', { name: '이름' })).not.toHaveAttribute('aria-sort')
  })

  test('워크스페이스 필터로 좁히고 기관 변경 시 선택을 초기화한다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await screen.findByRole('link', { name: 'capstone-team3-api' })
    const workspaceSelect = screen.getByLabelText('워크스페이스 필터')
    expect(within(workspaceSelect).getByRole('option', { name: /캡스톤 3조/ })).toBeInTheDocument()

    await user.selectOptions(workspaceSelect, uuid(12))
    expect(await screen.findByRole('link', { name: 'capstone-team3-api' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('link', { name: 'ai-train' })).not.toBeInTheDocument())

    await user.selectOptions(screen.getByLabelText('관리 기관 선택'), uuid(2))
    expect(screen.getByLabelText('워크스페이스 필터')).toHaveValue('')
    expect(await screen.findByRole('link', { name: 'ai-train' })).toBeInTheDocument()
  })

  test('행과 이름 link는 기관 scope를 보존해 별도 상세 페이지로 이동한다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp(`/admin/vms?org=${uuid(1)}`)

    const link = await screen.findByRole('link', { name: 'algo-judge' })
    expect(link).toHaveAttribute('href', `/admin/vms/${uuid(56)}?org=${uuid(1)}`)

    await user.click(link.closest('tr')!)
    expect(await screen.findByRole('heading', { name: 'algo-judge' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'VM 상세' })).not.toBeInTheDocument()
  })

  test('ORG_ADMIN은 자기 기관 VM만 보고 상세 link로 이동한다', async () => {
    renderAsOrgAdmin()

    const link = await screen.findByRole('link', { name: 'algo-judge' })
    expect(screen.queryByLabelText('기관 필터')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'ai-train' })).not.toBeInTheDocument()
    expect(link).toHaveAttribute('href', `/admin/vms/${uuid(56)}?org=${uuid(1)}`)
  })

  test('URL의 workspaceId 파라미터로 워크스페이스 필터가 초기화된다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp(`/admin/vms?workspaceId=${uuid(12)}`)

    await screen.findByRole('heading', { name: 'VM 관리' })
    expect(await screen.findByRole('link', { name: 'capstone-team3-api' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('link', { name: 'ai-train' })).not.toBeInTheDocument())
    expect(screen.getByLabelText('워크스페이스 필터')).toHaveValue(uuid(12))
  })
})
