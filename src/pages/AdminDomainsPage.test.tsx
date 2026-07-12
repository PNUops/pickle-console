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
