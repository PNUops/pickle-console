import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  refreshSuccessHandler,
  sysAdminUser,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderSettings() {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp('/admin/settings')
}

describe('플랫폼 설정', () => {
  test('ORG_ADMIN이 접근하면 관리자 홈으로 돌려보낸다', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin/settings')

    expect(
      await screen.findByRole('heading', { name: '관리자 대시보드' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '플랫폼 설정' })).not.toBeInTheDocument()
  })

  test('SYS_ADMIN은 설정 목록을 valueType별 표현으로 보고, 조회 전용 행에는 수정 버튼이 없다', async () => {
    renderSettings()

    await screen.findByRole('heading', { name: '플랫폼 설정' })
    const killRow = (await screen.findByText('ssh_gateway_enabled')).closest('tr')!
    expect(within(killRow).getByText('활성')).toBeInTheDocument()
    expect(within(killRow).getByRole('button', { name: '수정' })).toBeInTheDocument()

    const graceRow = screen.getByText('vm_delete_grace_hours').closest('tr')!
    expect(within(graceRow).getByText('168')).toBeInTheDocument()

    const jsonRow = screen.getByText('expiry_notice_days').closest('tr')!
    expect(within(jsonRow).getByText('[7,3,1,0]')).toBeInTheDocument()

    // 조회 전용(editable=false)
    const roRow = screen.getByText('platform_root_domain').closest('tr')!
    expect(within(roRow).queryByRole('button', { name: '수정' })).not.toBeInTheDocument()
  })

  test('SSH 킬 스위치를 끄면 위험 확인 모달을 거쳐 저장된다', async () => {
    const user = userEvent.setup()
    renderSettings()

    await screen.findByRole('heading', { name: '플랫폼 설정' })
    const killRow = (await screen.findByText('ssh_gateway_enabled')).closest('tr')!
    await user.click(within(killRow).getByRole('button', { name: '수정' }))

    const editDialog = await screen.findByRole('dialog', {
      name: '설정 수정 — ssh_gateway_enabled',
    })
    await user.click(within(editDialog).getByRole('checkbox'))
    await user.click(within(editDialog).getByRole('button', { name: '저장' }))

    // 끄는 방향은 위험 확인을 요구한다.
    const confirm = await screen.findByRole('dialog', { name: 'SSH 게이트웨이 비활성화' })
    expect(
      within(confirm).getByText('모든 사용자 SSH 접속이 차단됩니다. 계속할까요?'),
    ).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: '비활성화' }))

    expect(
      await screen.findByText("'ssh_gateway_enabled' 설정이 저장되었습니다."),
    ).toBeInTheDocument()
    const updatedRow = screen.getByText('ssh_gateway_enabled').closest('tr')!
    expect(within(updatedRow).getByText('비활성')).toBeInTheDocument()
  })

  test('정수 설정에 소수를 넣으면 클라이언트 검증 오류를 보여준다', async () => {
    const user = userEvent.setup()
    renderSettings()

    await screen.findByRole('heading', { name: '플랫폼 설정' })
    const graceRow = (await screen.findByText('vm_delete_grace_hours')).closest('tr')!
    await user.click(within(graceRow).getByRole('button', { name: '수정' }))

    const dialog = await screen.findByRole('dialog', {
      name: '설정 수정 — vm_delete_grace_hours',
    })
    fireEvent.change(within(dialog).getByLabelText(/값/), { target: { value: '3.5' } })
    await user.click(within(dialog).getByRole('button', { name: '저장' }))

    expect(await within(dialog).findByText('정수를 입력해 주세요.')).toBeInTheDocument()
  })
})
