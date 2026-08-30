import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
