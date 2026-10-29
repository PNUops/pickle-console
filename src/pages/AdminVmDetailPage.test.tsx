import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  orgAdminUser,
  orgAdminProfile,
  sysManagerUser,
  sysViewerUser,
  orgManagerUser,
  orgViewerUser,
  refreshSuccessHandler,
  sysAdminUser,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { AUTHORITY_OVERRIDES, mockInstitutionAuthority } from '../test/msw/institution-authority'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'
import { vmStore } from '../test/msw/handlers/vms'

function renderAsSysAdmin(path: string) {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  return renderApp(path)
}

afterEach(() => vi.unstubAllEnvs())

describe('explicit VM network policy authority', () => {
  function writeOnly(differentWorkspace = false) {
    vi.stubEnv('VITE_VM_NETWORK_POLICY_ENABLED', '1')
    const vm = { ...vmStore.find((row) => row.id === uuid(56))!, metadataVisible: false,
      allowedWorkIds: ['vm.network-policy.write'] }
    const workspaceId = vm.workspaceId
    if (!workspaceId) throw new Error('The network policy fixture must identify its actual workspace')
    const context = mockInstitutionAuthority(orgAdminProfile)
    context.accountRole = 'ORG_MANAGER'
    context.authorityFingerprint = `synthetic-policy-write:${differentWorkspace}`
    context.assignments[0].permission = { mode: 'SELECTED', revision: 19, work: ['vm.network-policy.write'],
      scopes: { VM: { mode: 'LISTED', workspaceIds: [differentWorkspace ? uuid(9999) : workspaceId] } } }
    AUTHORITY_OVERRIDES[orgAdminProfile.id] = context
    server.use(refreshSuccessHandler('access-org-admin'),
      http.get('*/api/v1/admin/vms/:vmId', () => HttpResponse.json(vm)))
    return vm
  }

  test('a matching write-only source loads the current policy and saves through the admin API', async () => {
    const vm = writeOnly()
    const policy = { revision: 8, rules: [{ direction: 'IN', action: 'ACCEPT', protocol: 'TCP', peer: '192.0.2.0/24', portStart: 443, portEnd: 443 }],
      systemRules: [], applyState: 'APPLIED', desiredGeneration: 8, appliedGeneration: 8, lastError: null, updatedAt: null }
    let reads = 0, personalRequests = 0
    const writes: unknown[] = []
    server.use(http.get('*/api/v1/admin/vms/:vmId/network-policy', () => { reads++; return HttpResponse.json(policy) }),
      http.put('*/api/v1/admin/vms/:vmId/network-policy', async ({ request }) => {
        writes.push(await request.json()); return HttpResponse.json({ ...policy, revision: 9 })
      }),
      http.get('*/api/v1/vms/:vmId/network-policy', () => { personalRequests++; return new HttpResponse(null, { status: 403 }) }))
    renderApp(`/admin/vms/${vm.id}?tab=network-policy`)
    await screen.findByRole('heading', { name: vm.displayName || vm.name })
    const save = await screen.findByRole('button', { name: '통신 정책 저장' })
    expect(screen.getByRole('tab', { name: '통신 정책' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('textbox', { name: '출발지 IP/CIDR' })).toHaveValue('192.0.2.0/24')
    await userEvent.click(save)
    await waitFor(() => expect(writes).toEqual([{ expectedRevision: 8, rules: policy.rules }]))
    expect(reads).toBe(1)
    expect(personalRequests).toBe(0)
  })

  test('a write row cannot borrow an unrelated workspace source to load the policy', async () => {
    const vm = writeOnly(true)
    let reads = 0
    server.use(http.get('*/api/v1/admin/vms/:vmId/network-policy', () => { reads++; return HttpResponse.json({}) }))
    renderApp(`/admin/vms/${vm.id}?tab=network-policy`)
    await screen.findByRole('heading', { name: vm.displayName || vm.name })
    expect(screen.queryByRole('tab', { name: '통신 정책' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '통신 정책 저장' })).not.toBeInTheDocument()
    expect(reads).toBe(0)
  })
})

describe('관리자 VM 상세', () => {
  test('allows scoped ORG_MANAGER edits and keeps ORG_VIEWER read-only', async () => {
    vi.stubEnv('VITE_VM_NETWORK_POLICY_ENABLED', '1')
    server.use(refreshSuccessHandler('access-org-manager', orgManagerUser))
    const first = renderApp(`/admin/vms/${uuid(56)}?tab=network-policy`)
    expect(await screen.findByRole('button', { name: '통신 정책 저장' })).toBeEnabled()
    first.unmount()

    server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
    renderApp(`/admin/vms/${uuid(57)}?tab=network-policy`)
    await screen.findByRole('region', { name: 'VM 통신 정책' })
    expect(screen.queryByRole('button', { name: '통신 정책 저장' })).not.toBeInTheDocument()
    expect(screen.getByText('192.0.2.0/24 · 443')).toBeInTheDocument()
  })

  test('hides the policy tab and skips its query while the feature is off', async () => {
    let requests = 0
    server.use(http.get('*/api/v1/admin/vms/:vmId/network-policy', () => {
      requests += 1
      return HttpResponse.json({})
    }))
    renderAsSysAdmin(`/admin/vms/${uuid(56)}?tab=network-policy`)
    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.queryByRole('tab', { name: '통신 정책' })).not.toBeInTheDocument()
    expect(requests).toBe(0)
  })

  test('개요 탭에 요약과 상태에 맞는 전원 버튼이 보인다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByText('10.10.0.56')).toBeInTheDocument()
    expect(screen.getByText('알고리즘 스터디')).toBeInTheDocument()

    // RUNNING: 상태상 가능한 액션만 보인다. 강제 종료는 종료 버튼의 메뉴 항목이다.
    expect(screen.queryByRole('button', { name: '시작' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '종료' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '재부팅' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '강제 종료' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '종료 옵션' }))
    expect(screen.getByRole('menuitem', { name: '강제 종료' })).toBeInTheDocument()
  })

  test('강제 종료는 메뉴에서 열리고 관리자용 확인 문구를 보여준다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('button', { name: '종료 옵션' }))
    await user.click(screen.getByRole('menuitem', { name: '강제 종료' }))
    const dialog = await screen.findByRole('dialog', { name: 'VM 강제 종료' })
    expect(within(dialog).getByText(/저장되지 않은 데이터는 유실될 수 있습니다/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '강제 종료' })).toBeEnabled()
  })

  test('종료는 확인 모달을 거쳐 접수 메시지를 보여준다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('button', { name: '종료' }))
    const dialog = await screen.findByRole('dialog', { name: 'VM 종료' })
    expect(within(dialog).getByText(/정지 보호 설정과 무관하게/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '종료' }))

    expect(
      await screen.findByText('VM 종료 요청을 접수했습니다. 잠시 후 상태가 갱신됩니다.'),
    ).toBeInTheDocument()
  })

  test('STOPPED VM은 시작만 활성화된다', async () => {
    renderAsSysAdmin(`/admin/vms/${uuid(57)}`)

    await screen.findByRole('heading', { name: 'web-lab' })
    expect(screen.getByRole('button', { name: '시작' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '종료' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '종료 옵션' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '강제 종료' })).not.toBeInTheDocument()
  })

  test('SYS 기관 scope 밖의 VM deep link는 작업 action을 렌더하지 않는다', async () => {
    renderAsSysAdmin(`/admin/vms/${uuid(61)}?org=${uuid(1)}`)

    expect(
      await screen.findByText('선택한 관리 범위의 가상머신이 아닙니다'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'ai-train' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '종료' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '가상머신 목록으로 돌아가기' })).toHaveAttribute(
      'href',
      `/admin/vms?org=${uuid(1)}`,
    )
  })

  test('이벤트 탭은 이력을 최신순으로 보여준다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('tab', { name: '이벤트' }))

    expect(await screen.findByText('승인 신청 90에 따라 자동 생성')).toBeInTheDocument()
    const rows = screen.getAllByRole('row')
    // 헤더 다음 첫 행이 최신 이벤트(관리자 차단), 그다음이 START.
    // 사용자 화면과 달리 개입한 관리자의 이름이 배지와 함께 보인다.
    expect(within(rows[1]).getByText('SSH·터미널 차단')).toBeInTheDocument()
    expect(within(rows[1]).getByText('운영 담당자')).toBeInTheDocument()
    expect(within(rows[1]).getByText('관리자')).toBeInTheDocument()
    expect(within(rows[2]).getByText('시작')).toBeInTheDocument()
    expect(within(rows[2]).getByText('홍길동')).toBeInTheDocument()
  })

  test('감사 로그가 닫힌 역할에게는 이벤트 이력의 관리자 이름이 가려진다', async () => {
    // 서버가 이 역할에게만 관리자 행의 신원을 비운다. 목이 그 규칙을 모르면
    // 이름이 비어 오는 화면 자체를 테스트가 한 번도 지나가지 못한다.
    server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
    const user = userEvent.setup()
    renderApp(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('tab', { name: '이벤트' }))

    await screen.findByText('승인 신청 90에 따라 자동 생성')
    const rows = screen.getAllByRole('row')
    expect(within(rows[1]).getByText('SSH·터미널 차단')).toBeInTheDocument()
    expect(within(rows[1]).getByText('관리자')).toBeInTheDocument()
    expect(within(rows[1]).queryByText('운영 담당자')).not.toBeInTheDocument()
    // 동료 행은 그대로 이름이 보인다 — 가리는 것은 개입한 관리자뿐이다.
    expect(within(rows[2]).getByText('홍길동')).toBeInTheDocument()
  })

  test('수행 화면을 모르는 행은 이름과 함께 미기록으로 구분된다', async () => {
    // 관리자에게는 이름이 오지만, 동료가 한 일과 같은 모양으로 그리면 서버가
    // 거부한 추측을 화면이 대신하게 된다.
    const user = userEvent.setup()
    renderAsSysAdmin(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.click(screen.getByRole('tab', { name: '이벤트' }))

    await screen.findByText('승인 신청 90에 따라 자동 생성')
    const rows = screen.getAllByRole('row')
    const unknownRow = rows[rows.length - 1]
    expect(within(unknownRow).getByText('홍길동')).toBeInTheDocument()
    expect(within(unknownRow).getByText('화면 미기록')).toBeInTheDocument()
  })

  test('ORG_ADMIN에게는 차단 토글이 보이지 않고 전원 제어는 열린다', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByRole('button', { name: '종료' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '접속 차단' })).not.toBeInTheDocument()
  })

  test('ORG_VIEWER에게는 전원 제어와 기간 연장이 보이지 않는다', async () => {
    server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
    renderApp(`/admin/vms/${uuid(56)}`)

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.queryByRole('button', { name: '종료' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '기간 연장' })).not.toBeInTheDocument()
    expect(screen.queryByText('전원 제어 (관리자 개입)')).not.toBeInTheDocument()
  })
})


describe('VM detail deletion capabilities', () => {
  test.each([
    ['access-org-admin', orgAdminUser, true, false],
    ['access-org-manager', orgManagerUser, false, false],
    ['access-org-viewer', orgViewerUser, false, false],
    ['access-sys-admin', sysAdminUser, true, true],
    ['access-sys-manager', sysManagerUser, false, false],
    ['access-sys-viewer', sysViewerUser, false, false],
  ] as const)('shows target-institution deletion actions for %s', async (token, profile, schedule, force) => {
    server.use(refreshSuccessHandler(token, profile))
    renderApp(`/admin/vms/${uuid(56)}`)
    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.queryByRole('button', { name: '삭제 예약' }) != null).toBe(schedule)
    expect(screen.queryByRole('button', { name: '강제 삭제' }) != null).toBe(force)
  })

  test.each(['ORG_VIEWER', 'ORG_MANAGER'] as const)('does not inherit deletion rights from an administrator role in another institution: %s', async (role) => {
    const foreignProfile = {
      ...orgAdminProfile,
      managedOrgs: [...orgAdminProfile.managedOrgs,
        { orgId: uuid(2), orgName: '테스트 기관', role, requestMail: false }],
    }
    AUTHORITY_OVERRIDES[foreignProfile.id] = mockInstitutionAuthority(foreignProfile)
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser),
      http.get('*/api/v1/me', () => HttpResponse.json(foreignProfile)))
    renderApp(`/admin/vms/${uuid(61)}`)
    await screen.findByRole('heading', { name: 'ai-train' })
    expect(screen.queryByRole('button', { name: '삭제 예약' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제 취소' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '강제 삭제' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '기간 연장' }) != null).toBe(role === 'ORG_MANAGER')
  })

  test('drops deletion drafts and actions when the selected institution no longer matches', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin(`/admin/vms/${uuid(56)}?org=${uuid(1)}`)
    await screen.findByRole('heading', { name: 'algo-judge' })
    await user.type(screen.getByLabelText('삭제 사유'), '기존 범위의 입력')
    await user.selectOptions(screen.getByLabelText('관리 기관 선택'), uuid(2))
    expect(await screen.findByText('선택한 관리 범위의 가상머신이 아닙니다')).toBeInTheDocument()
    expect(screen.queryByLabelText('삭제 사유')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제 예약' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '강제 삭제' })).not.toBeInTheDocument()
  })
})
