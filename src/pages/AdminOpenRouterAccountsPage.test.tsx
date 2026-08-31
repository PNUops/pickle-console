import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  orgManagerUser,
  orgViewerUser,
  refreshSuccessHandler,
  reauthGateHandlers,
  sysAdminUser,
  sysManagerUser,
  sysViewerUser,
  USER_PASSWORD,
} from '../test/msw/handlers/auth'
import { openRouterAccountStore } from '../test/msw/handlers/openrouter-accounts'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

const readerCases = [
  ['ORG_VIEWER', 'access-org-viewer', orgViewerUser],
  ['ORG_MANAGER', 'access-org-manager', orgManagerUser],
  ['ORG_ADMIN', 'access-org-admin', orgAdminUser],
  ['SYS_VIEWER', 'access-sys-viewer', sysViewerUser],
  ['SYS_MANAGER', 'access-sys-manager', sysManagerUser],
  ['SYS_ADMIN', 'access-sys-admin', sysAdminUser],
] as const

describe('OpenRouter 사업 계정 목록·권한', () => {
  test.each(readerCases)('%s는 scope 안의 secret-free 계정 상태를 읽는다', async (_role, token, profile) => {
    server.use(refreshSuccessHandler(token, profile))
    renderApp('/admin/llm/accounts')

    expect(await screen.findByRole('heading', { name: 'OpenRouter 사업 계정', level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'AI 교육 사업 A' })).toHaveAttribute(
      'href',
      profile.role.startsWith('ORG_')
        ? `/admin/llm/accounts/${uuid(410)}?org=${uuid(1)}`
        : `/admin/llm/accounts/${uuid(410)}`,
    )
    expect(screen.getByText('잔액 $87.50')).toBeInTheDocument()
    expect(screen.queryByText(/sk-or|managementKey|prefix|hash/i)).not.toBeInTheDocument()
  })

  test.each([
    ['ORG_MANAGER', 'access-org-manager', orgManagerUser, true],
    ['ORG_ADMIN', 'access-org-admin', orgAdminUser, true],
    ['SYS_ADMIN', 'access-sys-admin', sysAdminUser, true],
    ['ORG_VIEWER', 'access-org-viewer', orgViewerUser, false],
    ['SYS_MANAGER', 'access-sys-manager', sysManagerUser, false],
    ['SYS_VIEWER', 'access-sys-viewer', sysViewerUser, false],
  ] as const)('%s에게 등록 action 노출=%s', async (_role, token, profile, expected) => {
    server.use(refreshSuccessHandler(token, profile))
    renderApp('/admin/llm/accounts')
    await screen.findByRole('heading', { name: 'OpenRouter 사업 계정', level: 1 })
    const button = screen.queryByRole('button', { name: '사업 계정 등록' })
    if (expected) expect(button).toBeInTheDocument()
    else expect(button).not.toBeInTheDocument()
  })

  test('SYS 기관 scope는 목록과 deep link에 유지되고 다른 기관 상세는 렌더하지 않는다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    const list = renderApp(`/admin/llm/accounts?org=${uuid(2)}`)
    expect(await screen.findByRole('link', { name: '테스트 상용 모델 사업' })).toHaveAttribute(
      'href',
      `/admin/llm/accounts/${uuid(412)}?org=${uuid(2)}`,
    )
    expect(screen.queryByText('AI 교육 사업 A')).not.toBeInTheDocument()
    list.unmount()

    renderApp(`/admin/llm/accounts/${uuid(412)}?org=${uuid(1)}`)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '현재 관리 범위에서 이 OpenRouter 사업 계정을 찾을 수 없습니다.',
    )
    expect(screen.queryByRole('heading', { name: '테스트 상용 모델 사업' })).not.toBeInTheDocument()
  })

  test('계정 등록은 정확한 이름과 전역 재인증을 요구한다', async () => {
    const user = userEvent.setup()
    server.use(
      refreshSuccessHandler('access-org-manager', orgManagerUser),
      ...reauthGateHandlers('POST /admin/llm/accounts'),
    )
    renderApp('/admin/llm/accounts')
    await user.click(await screen.findByRole('button', { name: '사업 계정 등록' }))
    const dialog = within(screen.getByRole('dialog', { name: 'OpenRouter 사업 계정 등록' }))
    await user.type(dialog.getByLabelText('사업 계정 이름'), '신규 교육 사업')
    await user.type(dialog.getByLabelText(/계속하려면 이름/), '다른 이름')
    await user.click(dialog.getByRole('button', { name: '등록' }))
    expect(dialog.getByText('사업 계정 이름과 정확히 같아야 합니다.')).toBeInTheDocument()

    await user.clear(dialog.getByLabelText(/계속하려면 이름/))
    await user.type(dialog.getByLabelText(/계속하려면 이름/), '신규 교육 사업')
    await user.click(dialog.getByRole('button', { name: '등록' }))
    const reauth = within(await screen.findByRole('dialog', { name: '본인 확인' }))
    await user.type(reauth.getByLabelText('비밀번호'), USER_PASSWORD)
    await user.click(reauth.getByRole('button', { name: '확인' }))
    expect(await screen.findByText('신규 교육 사업 사업 계정을 등록했습니다.')).toBeInTheDocument()
  })

  test('SYS narrowed scope의 계정 등록은 현재 기관으로 고정되고 다른 기관 picker를 만들지 않는다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp(`/admin/llm/accounts?org=${uuid(1)}`)
    await user.click(await screen.findByRole('button', { name: '사업 계정 등록' }))
    const dialog = within(screen.getByRole('dialog', { name: 'OpenRouter 사업 계정 등록' }))
    expect(dialog.getByLabelText('기관')).toHaveValue('정보컴퓨터공학부 실습지원센터')
    expect(dialog.queryByRole('option', { name: '테스트 기관' })).not.toBeInTheDocument()
    await user.type(dialog.getByLabelText('사업 계정 이름'), 'SYS 범위 고정 사업')
    await user.type(dialog.getByLabelText(/계속하려면 이름/), 'SYS 범위 고정 사업')
    await user.click(dialog.getByRole('button', { name: '등록' }))
    expect(await screen.findByText('SYS 범위 고정 사업 사업 계정을 등록했습니다.')).toBeInTheDocument()
    expect(openRouterAccountStore.find((account) => account.name === 'SYS 범위 고정 사업')).toMatchObject({
      orgId: uuid(1),
      orgName: '정보컴퓨터공학부 실습지원센터',
    })
  })
})

describe('OpenRouter account credits 관측', () => {
  test('목록 compact cell은 balance·누적 사용·freshness와 관측 시각을 함께 표시한다', async () => {
    server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
    renderApp('/admin/llm/accounts')

    const first = (await screen.findByRole('link', { name: 'AI 교육 사업 A' })).closest('tr')!
    expect(within(first).getByText('잔액 $87.50')).toBeInTheDocument()
    expect(within(first).getByText('누적 사용 $12.50')).toBeInTheDocument()
    expect(within(first).getByText('30분 안에 갱신됨')).toBeInTheDocument()
    expect(within(first).getByText('2026-08-31 00:28 KST')).toBeInTheDocument()

    const negative = screen.getByRole('link', { name: '산학 협력 사업 B' }).closest('tr')!
    expect(within(negative).getByText('잔액 -$1.25')).toBeInTheDocument()
    expect(within(negative).getByText('갱신 지연')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/현재 잔액|실시간|live 잔액/i)
  })

  test('상세는 FRESH credits·forecast·paired managed/unmanaged와 각 observedAt을 분리한다', async () => {
    server.use(refreshSuccessHandler('access-sys-viewer', sysViewerUser))
    renderApp(`/admin/llm/accounts/${uuid(410)}`)

    expect(await screen.findByRole('heading', { name: 'Credits 관측' })).toBeInTheDocument()
    expect(screen.getByText('구매 credits 합계').closest('div')).toHaveTextContent('$100.00')
    expect(screen.getByText('Account 누적 사용').closest('div')).toHaveTextContent('$12.50')
    expect(screen.getByText('잔액').closest('div')).toHaveTextContent('$87.50')
    expect(screen.getByText('일평균 사용').closest('div')).toHaveTextContent('$2.50')
    expect(screen.getByText('Pickle 관리 key 증가분').closest('div')).toHaveTextContent('$5.00')
    expect(screen.getByText('미관리 지출').closest('div')).toHaveTextContent('$3.00')
    expect(screen.getAllByText('2026-08-31 00:28 KST').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2026-08-31 00:27 KST').length).toBeGreaterThan(0)
    expect(screen.getAllByText('30분 안에 갱신됨')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /갱신|새로 고침/ })).not.toBeInTheDocument()
  })

  test('STALE 실패는 마지막 성공과 시도를 보존하고 forecast·paired reset 이유를 말한다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp(`/admin/llm/accounts/${uuid(411)}`)

    expect(await screen.findByText('최근 credits 확인 실패')).toBeInTheDocument()
    expect(screen.getByText(/Vendor 요청 제한/)).toBeInTheDocument()
    expect(screen.getByText('최근 key 대사 실패')).toBeInTheDocument()
    expect(screen.getByText(/Vendor 연결 실패/)).toBeInTheDocument()
    expect(screen.getByText('잔액').closest('div')).toHaveTextContent('-$1.25')
    expect(screen.getByText('잔액 소진 예상').closest('div')).toHaveTextContent('reset 경계')
    expect(screen.getByText('미관리 지출').closest('div')).toHaveTextContent('reset 경계')
    expect(screen.getByText('Credits 마지막 성공').closest('div')).toHaveTextContent(
      '2026-08-31 00:28 KST',
    )
    expect(screen.getByText('Credits 마지막 시도').closest('div')).toHaveTextContent(
      '2026-08-31 01:20 KST',
    )
  })

  test('UNKNOWN null은 0으로 표시하지 않고 실제 0 관측과 구분한다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    const unknown = renderApp(`/admin/llm/accounts/${uuid(412)}`)
    await screen.findByRole('heading', { name: 'Credits 관측' })
    expect(screen.getAllByText('확인 전').length).toBeGreaterThan(2)
    expect(document.body).not.toHaveTextContent('$0.00')
    unknown.unmount()

    const account = openRouterAccountStore.find((item) => item.id === uuid(412))!
    account.credits = {
      ...account.credits,
      totalCredits: 0,
      totalUsage: 0,
      balance: 0,
      freshness: 'FRESH',
      observedAt: '2026-08-31T02:00:00+09:00',
      lastSuccessAt: '2026-08-31T02:00:00+09:00',
      lastAttemptAt: '2026-08-31T02:00:00+09:00',
    }
    renderApp(`/admin/llm/accounts/${uuid(412)}`)
    await screen.findByRole('heading', { name: 'Credits 관측' })
    expect(screen.getAllByText('$0.00').length).toBeGreaterThanOrEqual(3)
  })

  test('mutation 응답은 독립된 credits·keys 관측 cache를 덮지 않는다', async () => {
    const user = userEvent.setup()
    const base = openRouterAccountStore.find((item) => item.id === uuid(410))!
    const newer = {
      ...base,
      credits: {
        ...base.credits,
        totalCredits: 100,
        totalUsage: 10,
        balance: 90,
        observedAt: '2026-08-31T03:00:00+09:00',
        lastSuccessAt: '2026-08-31T03:00:00+09:00',
        keysLastAttemptAt: '2026-08-31T04:00:00+09:00',
      },
    }
    let getCount = 0
    let releaseRefetch!: () => void
    const refetchBlocked = new Promise<void>((resolve) => { releaseRefetch = resolve })
    server.use(
      refreshSuccessHandler('access-sys-admin', sysAdminUser),
      http.get('*/api/v1/admin/llm/accounts/:accountId', async () => {
        getCount += 1
        if (getCount > 1) await refetchBlocked
        return HttpResponse.json(newer)
      }),
      http.patch('*/api/v1/admin/llm/accounts/:accountId', () =>
        HttpResponse.json({
          ...newer,
          name: 'AI 교육 사업 A 변경',
          credits: {
            ...newer.credits,
            totalUsage: 99,
            balance: 1,
            observedAt: '2026-08-31T03:30:00+09:00',
            keysLastAttemptAt: '2026-08-31T03:00:00+09:00',
          },
        }),
      ),
    )
    renderApp(`/admin/llm/accounts/${uuid(410)}`)
    await screen.findByText('$90.00')
    await user.click(screen.getByRole('button', { name: '정보 변경' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '저장' }))
    expect(await screen.findByText('OpenRouter 사업 계정 정보를 변경했습니다.')).toBeInTheDocument()
    expect(screen.getByText('잔액').closest('div')).toHaveTextContent('$90.00')
    expect(screen.queryByText('$1.00')).not.toBeInTheDocument()
    releaseRefetch()
  })

  test('기관 scope 전환 중에는 이전 기관 credits 행을 재사용하지 않는다', async () => {
    const user = userEvent.setup()
    let releaseSecond!: () => void
    const secondReady = new Promise<void>((resolve) => { releaseSecond = resolve })
    server.use(
      refreshSuccessHandler('access-sys-admin', sysAdminUser),
      http.get('*/api/v1/admin/llm/accounts', async ({ request }) => {
        const orgId = new URL(request.url).searchParams.get('orgId')
        if (orgId === uuid(2)) await secondReady
        return HttpResponse.json(
          openRouterAccountStore.filter((account) => account.orgId === orgId),
        )
      }),
    )
    renderApp(`/admin/llm/accounts?org=${uuid(1)}`)
    await screen.findByText('AI 교육 사업 A')
    await user.selectOptions(screen.getByLabelText('관리 기관 선택'), uuid(2))
    await waitFor(() => {
      expect(screen.queryByText('AI 교육 사업 A')).not.toBeInTheDocument()
      expect(screen.getByText('OpenRouter 사업 계정 목록 불러오는 중')).toBeInTheDocument()
    })
    releaseSecond()
    expect(await screen.findByText('테스트 상용 모델 사업')).toBeInTheDocument()
  })
})

describe('OpenRouter credential lifecycle', () => {
  test('세 writer 역할만 detail action을 보고 reader·SYS_MANAGER에는 DOM이 없다', async () => {
    for (const [token, profile, visible] of [
      ['access-org-manager', orgManagerUser, true],
      ['access-org-admin', orgAdminUser, true],
      ['access-sys-admin', sysAdminUser, true],
      ['access-org-viewer', orgViewerUser, false],
      ['access-sys-manager', sysManagerUser, false],
    ] as const) {
      server.use(refreshSuccessHandler(token, profile))
      const view = renderApp(`/admin/llm/accounts/${uuid(410)}`)
      await screen.findByRole('heading', { name: 'AI 교육 사업 A' })
      const edit = screen.queryByRole('button', { name: '정보 변경' })
      if (visible) expect(edit).toBeInTheDocument()
      else expect(edit).not.toBeInTheDocument()
      if (!visible) expect(screen.queryByRole('toolbar', { name: 'OpenRouter 사업 계정 동작' })).not.toBeInTheDocument()
      view.unmount()
    }
  })

  test('stage는 평문을 cache·DOM·fixture에 남기지 않고 재인증 뒤 STAGED만 표시한다', async () => {
    const user = userEvent.setup()
    const secret = 'test-management-secret-never-store'
    server.use(
      refreshSuccessHandler('access-org-manager', orgManagerUser),
      ...reauthGateHandlers('POST /admin/llm/accounts/:accountId/credentials/staged'),
    )
    renderApp(`/admin/llm/accounts/${uuid(410)}`)
    await user.click(await screen.findByRole('button', { name: 'Credential 등록·교체' }))
    const stage = within(screen.getByRole('dialog', { name: 'Management credential 등록·교체' }))
    await user.type(stage.getByLabelText('OpenRouter management key'), secret)
    await user.type(stage.getByLabelText(/계속하려면 이름/), 'AI 교육 사업 A')
    await user.click(stage.getByRole('button', { name: '검증 후 대기 등록' }))

    expect(screen.queryByDisplayValue(secret)).not.toBeInTheDocument()
    const reauth = within(await screen.findByRole('dialog', { name: '본인 확인' }))
    await user.type(reauth.getByLabelText('비밀번호'), USER_PASSWORD)
    await user.click(reauth.getByRole('button', { name: '확인' }))
    expect(await screen.findByText('Management credential을 검증해 STAGED로 등록했습니다.')).toBeInTheDocument()
    expect(screen.getByText('교체 대기 STAGED')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(secret)
    expect(JSON.stringify(openRouterAccountStore)).not.toContain(secret)
  })

  test('STAGED 활성화 뒤 rollback은 열고 finalize는 reconciliation 전까지 숨긴다', async () => {
    const user = userEvent.setup()
    const account = openRouterAccountStore.find((item) => item.id === uuid(410))!
    account.rotationCredential = {
      status: 'STAGED',
      createdAt: '2026-08-31T01:00:00+09:00',
      verifiedAt: '2026-08-31T01:01:00+09:00',
      lastVerificationAttemptAt: '2026-08-31T01:01:00+09:00',
      activatedAt: null,
      retiringAt: null,
      lastUsedAt: null,
      lastReconciledAt: null,
      verificationError: null,
      retiringOverdue: false,
    }
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp(`/admin/llm/accounts/${uuid(410)}`)
    await user.click(await screen.findByRole('button', { name: '대기 credential 활성화' }))
    const activate = within(screen.getByRole('dialog', { name: '대기 credential 활성화' }))
    await user.type(activate.getByLabelText(/계속하려면 이름/), 'AI 교육 사업 A')
    await user.click(activate.getByRole('button', { name: '활성화' }))
    expect(await screen.findByText('대기 중인 management credential을 활성화했습니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '교체 되돌리기' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '이전 credential 정리' })).not.toBeInTheDocument()
    expect(screen.getByText('새 ACTIVE credential reconciliation 대기 중')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Credential 등록·교체' })).not.toBeInTheDocument()
  })

  test('reconciliation 뒤 finalize는 vendor 폐기 확인과 정확한 이름을 모두 요구한다', async () => {
    const user = userEvent.setup()
    const account = openRouterAccountStore.find((item) => item.id === uuid(410))!
    account.activeCredential = {
      ...account.activeCredential!,
      activatedAt: '2026-08-31T01:00:00+09:00',
      lastReconciledAt: '2026-08-31T01:05:00+09:00',
    }
    // 이전 검증 실패가 캐시에 남아 credentialAvailable=false여도 action은 숨기지
    // 않는다. 서버가 클릭 시 ACTIVE credential을 fresh 검증한다.
    account.credentialAvailable = false
    account.rotationCredential = {
      ...account.activeCredential,
      status: 'RETIRING',
      activatedAt: '2026-08-30T20:02:00+09:00',
      retiringAt: '2026-08-31T01:00:00+09:00',
    }
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp(`/admin/llm/accounts/${uuid(410)}`)
    await user.click(await screen.findByRole('button', { name: '이전 credential 정리' }))
    const finalize = within(screen.getByRole('dialog', { name: '이전 credential 정리' }))
    await user.type(finalize.getByLabelText(/계속하려면 이름/), 'AI 교육 사업 A')
    expect(finalize.getByRole('button', { name: '정리' })).toBeDisabled()
    await user.click(finalize.getByRole('checkbox', { name: /Vendor console/ }))
    expect(finalize.getByRole('button', { name: '정리' })).toBeEnabled()
  })

  test('연결 key가 없는 account만 safe ACTIVE delete action을 노출한다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    const bound = renderApp(`/admin/llm/accounts/${uuid(410)}`)
    await screen.findByRole('heading', { name: 'AI 교육 사업 A' })
    expect(screen.queryByRole('button', { name: 'Credential 삭제' })).not.toBeInTheDocument()
    bound.unmount()

    const deletable = openRouterAccountStore.find((item) => item.id === uuid(411))!
    deletable.credentialAvailable = false
    deletable.eligibleForBinding = false
    deletable.activeCredential = {
      ...deletable.activeCredential!,
      verificationError: 'CREDENTIAL_ERROR',
      lastVerificationAttemptAt: '2026-08-31T01:10:00+09:00',
    }
    renderApp(`/admin/llm/accounts/${uuid(411)}`)
    await screen.findByRole('heading', { name: '산학 협력 사업 B' })
    expect(screen.getByRole('button', { name: 'Credential 삭제' })).toBeInTheDocument()
  })
})
