import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderDomains() {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp('/admin/domains')
}

describe('관리자 도메인', () => {
  test('도메인 상태·라우트·인증서 상태를 함께 나열한다', async () => {
    renderDomains()

    await screen.findByRole('heading', { name: '도메인' })
    const verifying = (await screen.findByText('demo.example.com')).closest('tr')!
    expect(within(verifying).getByText('검증 중')).toBeInTheDocument()
    expect(within(verifying).getByText('커스텀 도메인')).toBeInTheDocument()
    // 검증 전이라 라우트는 적용 대기, 인증서는 미발급(—).
    expect(within(verifying).getByText('적용 대기')).toBeInTheDocument()
  })

  test('강제 해제는 fqdn 확인 모달을 거쳐 목록에서 제거한다', async () => {
    const user = userEvent.setup()
    renderDomains()

    await screen.findByRole('heading', { name: '도메인' })
    const row = (await screen.findByText('demo.example.com')).closest('tr')!
    await user.click(within(row).getByRole('button', { name: '강제 해제' }))

    const dialog = await screen.findByRole('dialog', { name: '도메인 강제 해제' })
    const confirm = within(dialog).getByRole('button', { name: '강제 해제' })
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox'), 'demo.example.com')
    await user.click(confirm)

    expect(await screen.findByText(/강제 해제했습니다/)).toBeInTheDocument()
    expect(screen.queryByText('demo.example.com')).not.toBeInTheDocument()
  })

  test('커스텀 도메인 행에서 재검증을 접수할 수 있다', async () => {
    const user = userEvent.setup()
    renderDomains()

    await screen.findByRole('heading', { name: '도메인' })
    const custom = (await screen.findByText('demo.example.com')).closest('tr')!
    await user.click(within(custom).getByRole('button', { name: '재검증' }))
    expect(await screen.findByText(/재검증을 접수했습니다/)).toBeInTheDocument()

    // 플랫폼 서브도메인 행에는 재검증 버튼이 없다
    const platform = (await screen.findByText('ai-team.pickle.pnuops.com')).closest('tr')!
    expect(within(platform).queryByRole('button', { name: '재검증' })).not.toBeInTheDocument()
  })

  test('종류 필터로 커스텀 도메인만 볼 수 있다', async () => {
    const user = userEvent.setup()
    renderDomains()

    await screen.findByRole('heading', { name: '도메인' })
    await screen.findByText('ai-team.pickle.pnuops.com') // REQUESTED 도메인 존재

    await user.selectOptions(screen.getByLabelText('종류 필터'), 'CUSTOM')
    expect(await screen.findByText('demo.example.com')).toBeInTheDocument()
    expect(screen.queryByText('ai-team.pickle.pnuops.com')).not.toBeInTheDocument()
  })
})
