import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  orgManagerUser,
  orgViewerUser,
  reauthGateHandlers,
  refreshSuccessHandler,
  sysAdminUser,
  sysManagerUser,
  sysViewerUser,
  USER_PASSWORD,
} from '../test/msw/handlers/auth'
import { adminLlmLimitBodies } from '../test/msw/handlers/llm-keys'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderDetail(
  token: string,
  user: typeof orgAdminUser,
  keyId: string,
  orgId?: string,
) {
  server.use(refreshSuccessHandler(token, user))
  return renderApp(`/admin/llm/keys/${keyId}${orgId ? `?org=${orgId}` : ''}`)
}

function expectNoActions() {
  for (const name of ['한도 변경', '키 정지', '정지 해제', '키 폐기']) {
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  }
}

describe('관리자 LLM API 키 역할·상태 action', () => {
  test('ORG_VIEWER와 SYS_VIEWER는 상세를 읽지만 action은 DOM에 없다', async () => {
    const orgViewer = renderDetail('access-org-viewer', orgViewerUser, uuid(171))
    expect(await screen.findByRole('heading', { name: 'active-admin-key' })).toBeInTheDocument()
    expectNoActions()

    orgViewer.unmount()
    renderDetail('access-sys-viewer', sysViewerUser, uuid(171))
    expect(await screen.findByRole('heading', { name: 'active-admin-key' })).toBeInTheDocument()
    expectNoActions()
  })

  test('ORG_MANAGER는 6개 한도와 suspend를 보지만 revoke는 보지 않는다', async () => {
    const user = userEvent.setup()
    renderDetail('access-org-manager', orgManagerUser, uuid(171))
    await screen.findByRole('heading', { name: 'active-admin-key' })
    expect(screen.getByRole('button', { name: '한도 변경' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '키 정지' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '키 폐기' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '한도 변경' }))
    const dialog = within(screen.getByRole('dialog', { name: 'LLM API 키 한도 변경' }))
    for (const label of ['RPM', 'TPM', '일일 토큰', '동시 요청', '금액 한도 (USD)', '금액 리셋 창']) {
      expect(dialog.getByLabelText(label)).toBeInTheDocument()
    }
  })

  test('ORG_ADMIN PENDING은 limits/revoke만, SYS_ADMIN SUSPENDED는 limits/resume/revoke만 본다', async () => {
    const pending = renderDetail('access-org-admin', orgAdminUser, uuid(170))
    await screen.findByRole('heading', { name: 'pending-admin-key' })
    expect(screen.getByRole('button', { name: '한도 변경' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '키 폐기' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '키 정지' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '정지 해제' })).not.toBeInTheDocument()

    pending.unmount()
    renderDetail('access-sys-admin', sysAdminUser, uuid(172))
    await screen.findByRole('heading', { name: 'suspended-admin-key' })
    expect(screen.getByRole('button', { name: '한도 변경' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '정지 해제' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '키 폐기' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '키 정지' })).not.toBeInTheDocument()
  })

  test('SYS_MANAGER는 비금액 4축만 편집하고 기존 금액값을 그대로 PUT한다', async () => {
    const user = userEvent.setup()
    renderDetail('access-sys-manager', sysManagerUser, uuid(171))
    await user.click(await screen.findByRole('button', { name: '한도 변경' }))
    const dialog = within(screen.getByRole('dialog', { name: 'LLM API 키 한도 변경' }))
    expect(dialog.queryByLabelText('금액 한도 (USD)')).not.toBeInTheDocument()
    expect(dialog.queryByLabelText('금액 리셋 창')).not.toBeInTheDocument()
    await user.clear(dialog.getByLabelText('RPM'))
    await user.type(dialog.getByLabelText('RPM'), '80')
    await user.click(dialog.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(adminLlmLimitBodies).toHaveLength(1))
    expect(adminLlmLimitBodies[0]).toMatchObject({
      rpm: 80,
      creditLimit: 5,
      creditLimitReset: 'MONTHLY',
    })
  })

  // 관리자가 입력한 목록이 요청 본문에 실리는지. 이 단언이 없으면 창이 값을
  // 버리고 저장해도 화면은 정직하게 "제한 없음"을 보여 주므로 아무도 모른다.
  test('한도 창이 입력한 모델 허용 목록을 정규화해 본문에 싣는다', async () => {
    const user = userEvent.setup()
    renderDetail('access-sys-admin', sysAdminUser, uuid(171))
    await user.click(await screen.findByRole('button', { name: '한도 변경' }))
    const dialog = within(screen.getByRole('dialog', { name: 'LLM API 키 한도 변경' }))
    const field = dialog.getByLabelText('허용할 상용 모델')
    await user.clear(field)
    await user.type(field, 'OpenAI/*{enter}anthropic/claude-sonnet-4')
    await user.click(dialog.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(adminLlmLimitBodies).toHaveLength(1))
    // 판정이 소문자 기준이라 대문자로 적어도 소문자로 나가야 한다.
    expect(adminLlmLimitBodies[0].creditAllowedModels)
      .toEqual(['openai/*', 'anthropic/claude-sonnet-4'])
  })

  test('상세가 키의 모델 허용 목록을 보여 준다', async () => {
    // uuid(171)이 울타리가 걸린 픽스처다. 걸린 키를 "제한 없음"으로 보여 주는
    // 회귀를 잡는 것이 이 단언의 전부다.
    renderDetail('access-sys-admin', sysAdminUser, uuid(171))
    expect(await screen.findByText('허용 상용 모델')).toBeInTheDocument()
    expect(screen.getByText('openai/*')).toBeInTheDocument()
  })

  test('SYS_MANAGER가 모델 허용 목록을 바꾸면 서버가 거절한다', async () => {
    const user = userEvent.setup()
    renderDetail('access-sys-manager', sysManagerUser, uuid(171))
    await user.click(await screen.findByRole('button', { name: '한도 변경' }))
    const dialog = within(screen.getByRole('dialog', { name: 'LLM API 키 한도 변경' }))
    // 금액 축을 못 만지는 역할이라 목록 칸도 없다 — 창은 기존 값을 그대로
    // 되돌려 보내고, 그래서 403이 나지 않는다.
    expect(dialog.queryByLabelText('허용할 상용 모델')).not.toBeInTheDocument()
    await user.clear(dialog.getByLabelText('RPM'))
    await user.type(dialog.getByLabelText('RPM'), '80')
    await user.click(dialog.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(adminLlmLimitBodies).toHaveLength(1))
    expect(adminLlmLimitBodies[0].creditAllowedModels).toEqual(['openai/*'])
  })

  test('6축 form은 오류 summary를 표시하고 첫 오류 입력으로 focus를 옮긴다', async () => {
    const user = userEvent.setup()
    renderDetail('access-sys-admin', sysAdminUser, uuid(171))
    await user.click(await screen.findByRole('button', { name: '한도 변경' }))
    const dialog = within(screen.getByRole('dialog', { name: 'LLM API 키 한도 변경' }))
    const rpm = dialog.getByLabelText('RPM')
    await user.clear(rpm)
    await user.type(rpm, '0')
    const credit = dialog.getByLabelText('금액 한도 (USD)')
    await user.clear(credit)
    await user.type(credit, '-1')
    await user.click(dialog.getByRole('button', { name: '저장' }))

    expect(dialog.getByText('입력값을 확인해 주세요')).toBeInTheDocument()
    expect(dialog.getAllByText('1 이상의 올바른 정수를 입력하거나 비워 주세요.')).toHaveLength(2)
    expect(dialog.getAllByText('금액 한도는 0 이상의 숫자여야 합니다.')).toHaveLength(2)
    await waitFor(() => expect(rpm).toHaveFocus())
  })

  test('EXPIRED와 REVOKED는 SYS_ADMIN에게도 읽기 전용이다', async () => {
    const expired = renderDetail('access-sys-admin', sysAdminUser, uuid(173))
    await screen.findByRole('heading', { name: 'expired-admin-key' })
    expectNoActions()

    expired.unmount()
    renderDetail('access-sys-admin', sysAdminUser, uuid(174))
    await screen.findByRole('heading', { name: 'revoked-admin-key' })
    expectNoActions()
  })
})

describe('관리자 LLM API 키 동작·링크·scope', () => {
  test('이미 연결된 계정은 링크만 보여 주고 한도 화면에서 변경 UI를 만들지 않는다', async () => {
    const user = userEvent.setup()
    renderDetail('access-sys-admin', sysAdminUser, uuid(171), uuid(1))
    expect(await screen.findByRole('link', { name: 'AI 교육 사업 A' })).toHaveAttribute(
      'href',
      `/admin/llm/accounts/${uuid(410)}?org=${uuid(1)}`,
    )
    expect(screen.getByText('금액 관측').closest('div')).toHaveTextContent('Limit window 사용 $2.50')
    expect(screen.getByText('금액 관측').closest('div')).toHaveTextContent('잔여 한도 $2.50')
    expect(screen.getByText('금액 관측').closest('div')!
      .querySelector('time[datetime="2026-08-31T00:27:30+09:00"]')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: '한도 변경' }))
    const dialog = within(screen.getByRole('dialog', { name: 'LLM API 키 한도 변경' }))
    expect(dialog.getByText('연결된 사업 계정은 바꿀 수 없습니다')).toBeInTheDocument()
    expect(dialog.queryByLabelText('OpenRouter 사업 계정')).not.toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(adminLlmLimitBodies).toHaveLength(1))
    expect(adminLlmLimitBodies[0].openrouterAccountId).toBe(uuid(410))
  })

  test('key 금액의 null과 실제 0을 구분한다', async () => {
    const unknown = renderDetail('access-sys-admin', sysAdminUser, uuid(176))
    await screen.findByRole('heading', { name: 'initial-binding-key' })
    expect(screen.getByText('금액 관측 전')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('$0.00')
    unknown.unmount()

    renderDetail('access-sys-admin', sysAdminUser, uuid(177))
    await screen.findByRole('heading', { name: 'remote-connected-unbound-key' })
    expect(screen.getByText('금액 관측').closest('div')).toHaveTextContent('Limit window 사용 $0.00')
    expect(screen.getByText('금액 관측').closest('div')).toHaveTextContent('잔여 한도 $0.00')
  })

  test('미결합 키의 첫 금액 부여는 사업 계정을 선택해 같은 ID로 저장한다', async () => {
    const user = userEvent.setup()
    renderDetail('access-sys-admin', sysAdminUser, uuid(176))
    await user.click(await screen.findByRole('button', { name: '한도 변경' }))
    const dialog = within(screen.getByRole('dialog', { name: 'LLM API 키 한도 변경' }))
    await user.clear(dialog.getByLabelText('금액 한도 (USD)'))
    await user.type(dialog.getByLabelText('금액 한도 (USD)'), '5')
    await user.selectOptions(dialog.getByLabelText('OpenRouter 사업 계정'), uuid(411))
    await user.click(dialog.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(adminLlmLimitBodies).toHaveLength(1))
    expect(adminLlmLimitBodies[0].openrouterAccountId).toBe(uuid(411))
    expect(await screen.findByRole('link', { name: '산학 협력 사업 B' })).toBeInTheDocument()
  })

  test.each([
    [uuid(170), 'pending-admin-key'],
    [uuid(177), 'remote-connected-unbound-key'],
  ])('금액이 있거나 OpenRouter 키가 발급된 미결합 키 %s는 최초 연결 UI를 열지 않는다', async (keyId, name) => {
    const user = userEvent.setup()
    let accountCalls = 0
    server.use(
      http.get('*/api/v1/admin/llm/accounts', () => {
        accountCalls += 1
        return HttpResponse.json([])
      }),
    )
    renderDetail('access-sys-admin', sysAdminUser, keyId)
    await user.click(await screen.findByRole('button', { name: '한도 변경' }))
    const dialog = within(screen.getByRole('dialog', { name: 'LLM API 키 한도 변경' }))
    expect(dialog.getByText('이 키는 이 화면에서 사업 계정에 연결할 수 없습니다')).toBeInTheDocument()
    expect(dialog.queryByLabelText('OpenRouter 사업 계정')).not.toBeInTheDocument()
    expect(dialog.getByRole('link', { name: '새 키 신청 검토' })).toHaveAttribute(
      'href',
      `/admin/requests?org=${uuid(1)}`,
    )
    await user.click(dialog.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(adminLlmLimitBodies).toHaveLength(1))
    expect(adminLlmLimitBodies[0].openrouterAccountId).toBeNull()
    expect(accountCalls).toBe(0)
    expect(await screen.findByRole('heading', { name })).toBeInTheDocument()
  })

  test('ACTIVE suspend와 SUSPENDED resume 상태 전이를 수행한다', async () => {
    const user = userEvent.setup()
    renderDetail('access-org-manager', orgManagerUser, uuid(171))
    await user.click(await screen.findByRole('button', { name: '키 정지' }))
    const suspend = within(screen.getByRole('dialog', { name: 'LLM API 키 정지' }))
    expect(suspend.queryByRole('alert')).not.toBeInTheDocument()
    await user.type(suspend.getByLabelText('정지 사유'), '과도한 호출 확인')
    await user.click(suspend.getByRole('button', { name: '정지' }))
    expect(await screen.findByText('LLM API 키를 정지했습니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '정지 해제' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '정지 해제' }))
    await user.click(within(screen.getByRole('dialog', { name: 'LLM API 키 정지 해제' })).getByRole('button', { name: '정지 해제' }))
    expect(await screen.findByText('LLM API 키 정지를 해제했습니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '키 정지' })).toBeInTheDocument()
  })

  test('ORG_ADMIN revoke는 기존 본인 확인 flow를 거쳐 재시도한다', async () => {
    const user = userEvent.setup()
    server.use(...reauthGateHandlers('POST /llm-keys/:keyId/revoke'))
    renderDetail('access-org-admin', orgAdminUser, uuid(171))
    await user.click(await screen.findByRole('button', { name: '키 폐기' }))
    const confirm = within(screen.getByRole('dialog', { name: 'LLM API 키 폐기' }))
    await user.type(confirm.getByLabelText(/active-admin-key/), 'active-admin-key')
    await user.click(confirm.getByRole('button', { name: '폐기' }))

    const reauth = within(await screen.findByRole('dialog', { name: '본인 확인' }))
    await user.type(reauth.getByLabelText('비밀번호'), USER_PASSWORD)
    await user.click(reauth.getByRole('button', { name: '확인' }))
    expect(await screen.findByText('LLM API 키를 폐기했습니다.')).toBeInTheDocument()
  })

  test('requestId로 정확한 신청에 연결하고 다른 active org deep link는 감춘다', async () => {
    const exactLink = renderDetail('access-sys-admin', sysAdminUser, uuid(171), uuid(1))
    expect(await screen.findByRole('link', { name: '정확한 신청 보기' })).toHaveAttribute(
      'href',
      `/admin/requests/${uuid(206)}?org=${uuid(1)}`,
    )

    exactLink.unmount()
    renderDetail('access-sys-admin', sysAdminUser, uuid(175), uuid(1))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '현재 관리 범위에서 이 LLM API 키를 찾을 수 없습니다.',
    )
    expect(screen.queryByText('other-org-key')).not.toBeInTheDocument()
  })

  test('잘못된 key id와 존재하지 않는 deep link 오류를 표시한다', async () => {
    const invalid = renderDetail('access-sys-admin', sysAdminUser, 'not-a-uuid')
    expect(await screen.findByRole('alert')).toHaveTextContent('올바르지 않은 주소')

    invalid.unmount()
    renderDetail('access-sys-admin', sysAdminUser, uuid(999))
    expect(await screen.findByRole('alert')).toHaveTextContent('해당 LLM API 키가 존재하지 않습니다.')
  })
})
