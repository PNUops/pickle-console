import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import {
  ACCESS_TOKENS,
  orgAdminUser,
  orgViewerUser,
  problemResponse,
  refreshSuccessHandler,
  sysAdminUser,
  sysManagerUser,
  sysViewerUser,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'
import { toVmSummary, vmStore } from '../test/msw/handlers/vms'
import App from '../App'
import { AuthProvider } from '../auth/AuthProvider'
import { useAuth } from '../auth/auth-context'
import { ToastProvider } from '../components/ui'
import { PathnameProbe } from '../test/PathnameProbe'

function NavigationProbe() {
  const navigate = useNavigate()
  const location = useLocation()
  const { refreshProfile } = useAuth()
  return <>
    <button onClick={() => void navigate(-1)}>History back</button>
    <button onClick={() => void refreshProfile()}>Refresh actor</button>
    <button onClick={() => void navigate({ pathname: location.pathname, search: location.search }, {
      replace: true, state: { vmList: { ...location.state?.vmList, path: '/admin/users' } },
    })}>Corrupt return</button>
  </>
}

function renderNavigation(route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<MemoryRouter initialEntries={[route]}>
    <QueryClientProvider client={client}><AuthProvider><ToastProvider>
      <App /><NavigationProbe /><PathnameProbe />
    </ToastProvider></AuthProvider></QueryClientProvider>
  </MemoryRouter>)
}

function renderAsOrgAdmin() {
  server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
  renderApp('/admin/vms')
}

function renderAsSysAdmin() {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp('/admin/vms')
}

/** Enter the exact VM route through its list row. */
async function selectVm(user: ReturnType<typeof userEvent.setup>, name: string) {
  const row = (await screen.findByRole('link', { name })).closest('tr')!
  await user.click(row)
  await screen.findByRole('heading', { name })
  expect(screen.queryByRole('dialog', { name: 'VM 상세' })).not.toBeInTheDocument()
  return document.body
}

describe('관리자 VM 목록', () => {
  test('VM을 워크스페이스 이름과 함께 나열하고 상태 탭·관리 범위가 동작한다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await screen.findByRole('heading', { name: 'VM 관리' })
    expect(await screen.findByText('관리자 가상머신 목록')).toBeInTheDocument()
    const row = (await screen.findByText('capstone-team3-api')).closest('tr')!
    expect(within(row).getByText('캡스톤 3조')).toBeInTheDocument()

    // 상태 탭: 중지됨 → STOPPED VM만
    await user.click(screen.getByRole('button', { name: '중지됨' }))
    expect(await screen.findByText('web-lab')).toBeInTheDocument()
    expect(screen.queryByText('capstone-team3-api')).not.toBeInTheDocument()

    // 전역 관리 범위: org 2 → ai-train만
    await user.click(screen.getByRole('button', { name: '전체' }))
    await user.selectOptions(screen.getByLabelText('관리 기관 선택'), uuid(2))
    expect(await screen.findByText('ai-train')).toBeInTheDocument()
    expect(screen.queryByText('capstone-team3-api')).not.toBeInTheDocument()
    expect(screen.getByText(/테스트 기관 가상머신을 조회하고/)).toBeInTheDocument()
  })

  test('drops prior institution rows while the new scoped list is pending', async () => {
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

    expect(screen.queryByText('algo-judge')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'VM 상세' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제 예약' })).not.toBeInTheDocument()

    releaseOrgResponse()
    expect(await screen.findByText('ai-train')).toBeInTheDocument()
  })

  test('이름 검색과 정렬 헤더가 서버 파라미터로 동작한다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()
    await screen.findByText('capstone-team3-api')

    // 검색(디바운스): 'algo' → algo-judge만 남는다
    await user.type(screen.getByLabelText('VM 검색'), 'algo')
    await waitFor(() =>
      expect(screen.queryByText('capstone-team3-api')).not.toBeInTheDocument(),
    )
    expect(await screen.findByText('algo-judge')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('VM 검색'))
    await screen.findByText('capstone-team3-api')

    // 이름 헤더 클릭 → 오름차순 (ai-train이 첫 행)
    await user.click(screen.getByRole('button', { name: '이름' }))
    expect(screen.getByRole('columnheader', { name: '이름' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    await waitFor(() => {
      const firstRow = screen.getAllByRole('row')[1]
      expect(within(firstRow).getByText('ai-train')).toBeInTheDocument()
    })

    // 다시 클릭 → 내림차순, 세 번째 클릭 → 해제(기본 최신순)
    await user.click(screen.getByRole('button', { name: '이름' }))
    expect(screen.getByRole('columnheader', { name: '이름' })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    await waitFor(() => {
      const firstRow = screen.getAllByRole('row')[1]
      expect(within(firstRow).getByText('web-lab')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: '이름' }))
    expect(screen.getByRole('columnheader', { name: '이름' })).not.toHaveAttribute('aria-sort')
  })

  test('워크스페이스 필터 드롭다운으로 워크스페이스를 좁힐 수 있고, 기관 변경 시 선택이 초기화된다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await screen.findByText('capstone-team3-api')
    const workspaceSelect = screen.getByLabelText('워크스페이스 필터')
    expect(within(workspaceSelect).getByRole('option', { name: /캡스톤 3조/ })).toBeInTheDocument()

    await user.selectOptions(workspaceSelect, uuid(12))
    expect(await screen.findByText('capstone-team3-api')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('ai-train')).not.toBeInTheDocument())

    // 기관을 바꾸면 이전 기관의 워크스페이스 선택은 무효 → 전체 워크스페이스로 초기화
    await user.selectOptions(screen.getByLabelText('관리 기관 선택'), uuid(2))
    expect(screen.getByLabelText('워크스페이스 필터')).toHaveValue('')
    expect(await screen.findByText('ai-train')).toBeInTheDocument()
  })

  test('global VM metadata retains actual institution actions and hides system deletion', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await screen.findByRole('heading', { name: 'VM 관리' })
    // Foreign metadata does not grant operations on that foreign institution.
    expect(await screen.findByText('algo-judge')).toBeInTheDocument()
    expect(screen.queryByLabelText('기관 필터')).not.toBeInTheDocument()
    expect(screen.getByText('ai-train')).toBeInTheDocument()

    await selectVm(user, 'algo-judge')
    expect(screen.getByRole('button', { name: '삭제 예약' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '삭제 취소' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '강제 삭제' })).not.toBeInTheDocument()
  })

  test('opens SYS_MANAGER detail with power controls and no deletion actions', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-manager', sysManagerUser))
    renderApp('/admin/vms')

    const drawer = await selectVm(user, 'algo-judge')
    expect(within(drawer).getByText('호스트네임')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제 예약' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제 취소' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '강제 삭제' })).not.toBeInTheDocument()
  })
})

describe('관리자 VM 삭제 예약', () => {
  test('과거 날짜는 422 필드 에러, 7일 미만은 경고와 함께 접수된다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await selectVm(user, 'algo-judge')
    const dateInput = screen.getByLabelText(/파기 예정일/)
    const reasonInput = screen.getByLabelText(/삭제 사유/)

    // 과거 시각 → 서버 422 → scheduledFor 필드 에러 (유일하게 남은 날짜 규칙)
    fireEvent.change(dateInput, { target: { value: '2020-01-01' } })
    await user.type(reasonInput, '사용 종료일이 지난 VM 정리')
    expect(
      screen.getByText(/권장 통보 기간\(7일\)보다 이른 파기 예정일입니다/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '삭제 예약' }))
    expect(
      await screen.findByText('삭제 예정일은 미래 시각이어야 합니다.'),
    ).toBeInTheDocument()

    // 미래이되 권장 통보 기간(7일) 미만 → 경고 표시 상태로도 접수된다
    const nearDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
    fireEvent.change(dateInput, { target: { value: nearDate } })
    expect(
      screen.getByText(/권장 통보 기간\(7일\)보다 이른 파기 예정일입니다/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '삭제 예약' }))
    expect(
      await screen.findByText(
        '삭제 예약을 접수했습니다. 사용자에게 사유가 포함된 통보 메일이 발송됩니다.',
      ),
    ).toBeInTheDocument()
    expect(await screen.findByText('삭제 예약됨')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '삭제 취소' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제 예약' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '기간 연장' })).not.toBeInTheDocument()
  })

  test('사유 없이 제출하면 필드 에러를 보여준다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await selectVm(user, 'algo-judge')
    fireEvent.change(screen.getByLabelText(/파기 예정일/), {
      target: { value: '2099-01-01' },
    })
    await user.click(screen.getByRole('button', { name: '삭제 예약' }))
    expect(await screen.findByText('삭제 사유를 입력해 주세요.')).toBeInTheDocument()
  })
})

describe('교차 링크·URL 필터', () => {
  test('URL의 workspaceId 파라미터로 워크스페이스 필터가 초기화된다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp(`/admin/vms?workspaceId=${uuid(12)}`)

    await screen.findByRole('heading', { name: 'VM 관리' })
    expect(await screen.findByText('capstone-team3-api')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('ai-train')).not.toBeInTheDocument())
    expect(screen.getByLabelText('워크스페이스 필터')).toHaveValue(uuid(12))
  })

  test('returns from detail to its scoped workspace VM list', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await selectVm(user, 'capstone-team3-api')
    await user.click(screen.getByRole('link', { name: 'VM 보기' }))

    // The detail link returns to the workspace-filtered list.
    expect(screen.queryByRole('dialog', { name: 'VM 상세' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('워크스페이스 필터')).toHaveValue(uuid(12))
    await waitFor(() => expect(screen.queryByText('ai-train')).not.toBeInTheDocument())
  })
})

describe('SSH·웹 터미널 차단 토글', () => {
  test('blocks SSH and web terminal from the detail route', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await selectVm(user, 'algo-judge')
    await user.click(screen.getByRole('button', { name: '접속 차단' }))
    const dialog = await screen.findByRole('dialog', { name: 'SSH·웹 터미널 차단' })
    await user.type(within(dialog).getByPlaceholderText(/감사 기록/), '남용 신고 확인')
    await user.click(within(dialog).getByRole('button', { name: '차단' }))

    expect(await screen.findByText('SSH·웹 터미널 접속을 차단했습니다.')).toBeInTheDocument()
    expect(await screen.findByText('SSH·터미널 차단됨')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '차단 해제' })).toBeEnabled()
  })

  test('ORG_ADMIN에게는 차단 토글이 보이지 않는다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await selectVm(user, 'algo-judge')
    expect(screen.queryByRole('button', { name: '접속 차단' })).not.toBeInTheDocument()
  })
})

describe('VM detail period changes', () => {
  test('retains the period update acknowledgement on the detail route', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await selectVm(user, 'algo-judge')
    await user.click(screen.getByRole('button', { name: '기간 연장' }))
    const dialog = await screen.findByRole('dialog', { name: '기간 연장 — algo-judge' })
    fireEvent.change(within(dialog).getByLabelText(/새 종료일/), {
      target: { value: '2099-01-01' },
    })
    await user.click(within(dialog).getByRole('button', { name: '연장' }))

    expect(await screen.findByText(/새 종료일을 저장했습니다/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '기간 연장 — algo-judge' })).not.toBeInTheDocument()
  })
})

describe('관리자 삭제 취소', () => {
  test('취소 불가 deletion은 상태만 보이고 취소 action이 없다', async () => {
    const user = userEvent.setup()
    const vm = vmStore.find((item) => item.id === uuid(56))!
    server.use(
      http.get('*/api/v1/admin/vms/:vmId', () =>
        HttpResponse.json({
          ...vm,
          deletion: {
                kind: 'FORCE',
                scheduledFor: '2026-08-30T14:00:00+09:00',
                requestedAt: '2026-08-30T14:00:00+09:00',
                requestedById: sysAdminUser.id,
                reason: '보안 사고 대응',
                cancelable: false,
          },
        }),
      ),
    )
    renderAsOrgAdmin()

    await selectVm(user, 'algo-judge')
    expect(screen.getByText('삭제가 진행 중입니다')).toBeInTheDocument()
    expect(screen.getByText(/취소할 수 없습니다/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제 취소' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제 예약' })).not.toBeInTheDocument()
  })

  test('본인 삭제 유예 중 VM을 취소하면 중지됨으로 남는다는 안내를 보여준다', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    await selectVm(user, 'retiring-vm')
    await user.click(screen.getByRole('button', { name: '삭제 취소' }))

    expect(
      await screen.findByText(
        '삭제가 취소되었습니다. VM은 중지됨 상태로 남으며, 시작은 사용자가 직접 수행합니다.',
      ),
    ).toBeInTheDocument()
    // Exact detail metadata reflects the canceled deletion's stopped state.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'retiring-vm' })).toBeInTheDocument()
      expect(screen.getByText('중지됨')).toBeInTheDocument()
    })
  })

  test('retains cancellation feedback after entering detail from a deletion filter', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()

    // The originating filter must not own the exact target's acknowledgement.
    await screen.findByRole('heading', { name: 'VM 관리' })
    await user.click(screen.getByRole('button', { name: '삭제 중' }))
    await selectVm(user, 'retiring-vm')
    await user.click(screen.getByRole('button', { name: '삭제 취소' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'VM 상세' })).not.toBeInTheDocument()
    })
    expect(
      screen.getByText(
        '삭제가 취소되었습니다. VM은 중지됨 상태로 남으며, 시작은 사용자가 직접 수행합니다.',
      ),
    ).toBeInTheDocument()
  })

})

describe('강제 삭제 (SYS_ADMIN)', () => {
  test('이름 확인 모달을 거쳐 즉시 파기를 접수한다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await selectVm(user, 'algo-judge')
    await user.click(screen.getByRole('button', { name: '강제 삭제' }))

    const dialog = await screen.findByRole('dialog', { name: 'VM 강제 삭제' })
    const confirm = within(dialog).getByRole('button', { name: '즉시 파기' })
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox'), 'algo-judge')
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    expect(
      await screen.findByText(
        '강제 삭제를 접수했습니다. VM이 즉시 강제 종료되고 파기됩니다.',
      ),
    ).toBeInTheDocument()
    // Completion remains visible with no pending-deletion label or write action.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'algo-judge' })).toBeInTheDocument()
      expect(screen.getAllByText('삭제됨').length).toBeGreaterThan(0)
      expect(screen.queryByRole('button', { name: '강제 삭제' })).not.toBeInTheDocument()
      expect(screen.queryByText('삭제가 진행 중입니다')).not.toBeInTheDocument()
    })
  })

  test('강제 삭제가 409로 실패하면 모달이 유지되고 입력을 다시 치지 않아도 재시도할 수 있다', async () => {
    const user = userEvent.setup()
    // 첫 요청만 이름 불일치 409 — 이후에는 기본 핸들러(성공)로 떨어진다.
    server.use(
      http.post(
        '*/api/v1/admin/vms/:vmId/force-delete',
        () =>
          problemResponse({
            type: 'about:blank',
            title: '확인용 이름이 일치하지 않습니다',
            status: 409,
            detail:
              '입력한 이름이 VM 이름과 일치하지 않습니다. VM 이름을 정확히 입력해 주세요.',
            code: 'VM_CONFIRM_NAME_MISMATCH',
          }),
        { once: true },
      ),
    )
    renderAsSysAdmin()

    await selectVm(user, 'algo-judge')
    await user.click(screen.getByRole('button', { name: '강제 삭제' }))
    const dialog = await screen.findByRole('dialog', { name: 'VM 강제 삭제' })
    await user.type(within(dialog).getByRole('textbox'), 'algo-judge')
    await user.click(within(dialog).getByRole('button', { name: '즉시 파기' }))

    // 모달이 닫히지 않고 오류가 모달 안에 인라인으로 표시되며 입력이 보존된다.
    expect(
      await within(dialog).findByText(/입력한 이름이 VM 이름과 일치하지 않습니다/),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox')).toHaveValue('algo-judge')

    // 다시 치지 않고 재시도만으로 접수된다.
    await user.click(within(dialog).getByRole('button', { name: '즉시 파기' }))
    expect(
      await screen.findByText(
        '강제 삭제를 접수했습니다. VM이 즉시 강제 종료되고 파기됩니다.',
      ),
    ).toBeInTheDocument()
  })

  test('retains force-deletion acknowledgement and completed detail state', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    // Entering from a RUNNING filter does not lose the detail's result after deletion.
    await screen.findByRole('heading', { name: 'VM 관리' })
    await user.click(screen.getByRole('button', { name: '실행 중' }))
    await selectVm(user, 'algo-judge')
    await user.click(screen.getByRole('button', { name: '강제 삭제' }))
    const dialog = await screen.findByRole('dialog', { name: 'VM 강제 삭제' })
    await user.type(within(dialog).getByRole('textbox'), 'algo-judge')
    await user.click(within(dialog).getByRole('button', { name: '즉시 파기' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'VM 상세' })).not.toBeInTheDocument(),
    )
    expect(
      screen.getByText('강제 삭제를 접수했습니다. VM이 즉시 강제 종료되고 파기됩니다.'),
    ).toBeInTheDocument()
  })
})

describe('AdminVmsPage row selection', () => {
  test('selects without navigating and keeps the selection across pages', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()
    await user.click(await screen.findByRole('checkbox', { name: 'algo-judge 선택' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(currentPath()).toBe('/admin/vms')
    expect(screen.getByRole('toolbar', { name: '선택한 항목 동작' })).toHaveTextContent('1개 선택됨')
    await user.click(screen.getByRole('button', { name: '다음' }))
    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: 'algo-judge 선택' })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('toolbar', { name: '선택한 항목 동작' })).toHaveTextContent('1개 선택됨')
  })

  test('renders no selection for viewer roles', async () => {
    for (const [token, profile] of [
      ['access-org-viewer', orgViewerUser],
      ['access-sys-viewer', sysViewerUser],
    ] as const) {
      server.use(refreshSuccessHandler(token, profile))
      const view = renderApp('/admin/vms')
      expect(await screen.findByText('algo-judge')).toBeInTheDocument()
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '일괄 변경' })).not.toBeInTheDocument()
      view.unmount()
    }
  })
})


describe('VM list detail navigation', () => {
  test('retains the originating search when returning from the exact VM detail', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp(`/admin/vms?org=${uuid(1)}`)
    await screen.findByRole('link', { name: 'algo-judge' })
    await user.type(screen.getByLabelText('VM 검색'), 'algo')
    await waitFor(() => expect(screen.queryByRole('link', { name: 'capstone-team3-api' })).not.toBeInTheDocument())
    await user.click(await screen.findByRole('link', { name: 'algo-judge' }))
    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('link', { name: '← VM 관리' }))
    await screen.findByRole('heading', { name: 'VM 관리' })
    expect(screen.getByLabelText('VM 검색')).toHaveValue('algo')
  })

  test('returns to the global list with its original bulk selection owner', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()
    await user.click(await screen.findByRole('checkbox', { name: 'algo-judge 선택' }))
    expect(screen.getByRole('toolbar', { name: '선택한 항목 동작' })).toHaveTextContent('1개 선택됨')
    await user.click(await screen.findByRole('link', { name: 'algo-judge' }))
    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('link', { name: '← VM 관리' }))
    await screen.findByRole('heading', { name: 'VM 관리' })
    expect(currentPath()).toBe('/admin/vms')
    expect(screen.getByLabelText('관리 기관 선택')).toHaveValue('')
    expect(screen.getByRole('toolbar', { name: '선택한 항목 동작' })).toHaveTextContent('1개 선택됨')
    expect(screen.getByRole('checkbox', { name: 'algo-judge 선택' })).toBeChecked()
  })

  test('restores workspace, status, search, sort and page after changing a detail tab', async () => {
    const user = userEvent.setup()
    const queries: URLSearchParams[] = []
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser),
      http.get('*/api/v1/admin/vms', ({ request }) => {
        const params = new URL(request.url).searchParams
        queries.push(params)
        return HttpResponse.json({ content: [toVmSummary(vmStore.find((vm) => vm.id === uuid(56))!)],
          page: Number(params.get('page') ?? '0'), size: 10, totalElements: 30, totalPages: 3 })
      }))
    renderApp(`/admin/vms?org=${uuid(1)}&workspaceId=${uuid(15)}`)
    await screen.findByRole('link', { name: 'algo-judge' })
    await user.click(screen.getByRole('button', { name: '실행 중' }))
    await user.type(screen.getByLabelText('VM 검색'), 'algo')
    await waitFor(() => expect(queries.at(-1)?.get('q')).toBe('algo'))
    await user.click(screen.getByRole('button', { name: '이름' }))
    await user.click(screen.getByRole('button', { name: '이름' }))
    await user.click(screen.getByRole('button', { name: '2 페이지' }))
    await waitFor(() => expect(queries.at(-1)?.get('page')).toBe('1'))
    await user.click(screen.getByRole('checkbox', { name: 'algo-judge 선택' }))
    await user.click(screen.getByRole('link', { name: 'algo-judge' }))
    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('tab', { name: '이벤트' }))
    await screen.findByText('승인 신청 90에 따라 자동 생성')
    await user.click(screen.getByRole('link', { name: '← VM 관리' }))
    await screen.findByRole('heading', { name: 'VM 관리' })
    expect(screen.getByLabelText('VM 검색')).toHaveValue('algo')
    expect(screen.getByLabelText('워크스페이스 필터')).toHaveValue(uuid(15))
    expect(screen.getByRole('button', { name: '실행 중' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('columnheader', { name: '이름' })).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getByRole('button', { name: '2 페이지' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('toolbar', { name: '선택한 항목 동작' })).toHaveTextContent('1개 선택됨')
    await waitFor(() => expect(Object.fromEntries(queries.at(-1)!)).toMatchObject({
      orgId: uuid(1), workspaceId: uuid(15), status: 'RUNNING', q: 'algo', sort: '-name', page: '1',
    }))
  })

  test('browser history restores a cleared workspace cross-filter and the same selection', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderNavigation(`/admin/vms?workspaceId=${uuid(15)}`)
    await screen.findByRole('link', { name: 'algo-judge' })
    await user.selectOptions(screen.getByLabelText('워크스페이스 필터'), '')
    await user.type(screen.getByLabelText('VM 검색'), 'algo')
    await user.click(await screen.findByRole('checkbox', { name: 'algo-judge 선택' }))
    await user.click(screen.getByRole('link', { name: 'algo-judge' }))
    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('button', { name: 'History back' }))
    await screen.findByRole('heading', { name: 'VM 관리' })
    expect(currentPath()).toBe(`/admin/vms?workspaceId=${uuid(15)}`)
    expect(screen.getByLabelText('워크스페이스 필터')).toHaveValue('')
    expect(screen.getByLabelText('VM 검색')).toHaveValue('algo')
    expect(screen.getByRole('toolbar', { name: '선택한 항목 동작' })).toHaveTextContent('1개 선택됨')
  })

  test.each(['account', 'role'] as const)('discards list context and selection after an %s change', async (change) => {
    const user = userEvent.setup()
    const original = ACCESS_TOKENS['access-sys-admin']
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    try {
      renderNavigation('/admin/vms')
      await user.click(await screen.findByRole('checkbox', { name: 'algo-judge 선택' }))
      await user.type(screen.getByLabelText('VM 검색'), 'algo')
      await user.click(screen.getByRole('link', { name: 'algo-judge' }))
      await screen.findByRole('heading', { name: 'algo-judge' })
      ACCESS_TOKENS['access-sys-admin'] = change === 'account'
        ? { ...original, id: uuid(6) }
        : { ...original, role: 'SYS_VIEWER' }
      await user.click(screen.getByRole('button', { name: 'Refresh actor' }))
      await waitFor(() => expect(screen.getByRole('link', { name: '← VM 관리' })).toHaveAttribute('href', `/admin/vms?org=${uuid(1)}`))
      await user.click(screen.getByRole('link', { name: '← VM 관리' }))
      await screen.findByRole('heading', { name: 'VM 관리' })
      expect(screen.getByLabelText('VM 검색')).toHaveValue('')
      expect(screen.queryByRole('toolbar', { name: '선택한 항목 동작' })).not.toBeInTheDocument()
      expect(sessionStorage.getItem('pickle.bulk-selection.vms')).toBeNull()
    } finally { ACCESS_TOKENS['access-sys-admin'] = original }
  })

  test('rejects an unrelated return route and does not reuse its stored selection', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderNavigation('/admin/vms')
    await user.click(await screen.findByRole('checkbox', { name: 'algo-judge 선택' }))
    await user.type(screen.getByLabelText('VM 검색'), 'algo')
    await user.click(screen.getByRole('link', { name: 'algo-judge' }))
    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('button', { name: 'Corrupt return' }))
    expect(screen.getByRole('link', { name: '← VM 관리' })).toHaveAttribute('href', `/admin/vms?org=${uuid(1)}`)
    await user.click(screen.getByRole('link', { name: '← VM 관리' }))
    await screen.findByRole('heading', { name: 'VM 관리' })
    expect(screen.getByLabelText('VM 검색')).toHaveValue('')
    expect(screen.queryByRole('toolbar', { name: '선택한 항목 동작' })).not.toBeInTheDocument()
    expect(sessionStorage.getItem('pickle.bulk-selection.vms')).toBeNull()
  })

  test('exposes a real detail link and routes a row click to the actual institution', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()
    const link = await screen.findByRole('link', { name: 'algo-judge' })
    expect(link).toHaveAttribute('href', `/admin/vms/${uuid(56)}?org=${uuid(1)}`)
    expect(screen.queryByRole('button', { name: 'algo-judge' })).not.toBeInTheDocument()
    await user.click(link.closest('tr')!)
    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(currentPath()).toBe(`/admin/vms/${uuid(56)}?org=${uuid(1)}`)
    expect(screen.queryByRole('dialog', { name: 'VM 상세' })).not.toBeInTheDocument()
  })

  test('foreign support metadata does not grant direct deletion or power control', async () => {
    const user = userEvent.setup()
    renderAsOrgAdmin()
    await selectVm(user, 'ai-train')
    expect(screen.queryByRole('button', { name: '삭제 예약' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제 취소' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '강제 삭제' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '종료' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '기간 연장' })).not.toBeInTheDocument()
  })
})
