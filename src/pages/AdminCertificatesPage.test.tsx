import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderCerts() {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp('/admin/certificates')
}

describe('관리자 인증서', () => {
  test('공용 와일드카드와 커스텀 LE 인증서를 상태·만료와 함께 나열한다', async () => {
    renderCerts()

    await screen.findByRole('heading', { name: '인증서' })
    const wildcard = (await screen.findByText('*.pickle.pnuops.com')).closest('tr')!
    expect(within(wildcard).getByText('플랫폼 와일드카드')).toBeInTheDocument()
    expect(within(wildcard).getByText('정상')).toBeInTheDocument()

    // 만료 임박(12일) 커스텀 인증서는 강조 배지를 붙인다.
    const soon = screen.getByText('shop.example.com').closest('tr')!
    expect(within(soon).getByText('만료 임박')).toBeInTheDocument()

    // 발급 실패 인증서는 오류 요약을 노출한다.
    const failed = screen.getByText('api.example.org').closest('tr')!
    expect(within(failed).getByText('발급 실패')).toBeInTheDocument()
    expect(within(failed).getByText(/rateLimited/)).toBeInTheDocument()
  })

  test('만료 임박 필터는 임박 인증서만 남긴다', async () => {
    const user = userEvent.setup()
    renderCerts()

    await screen.findByRole('heading', { name: '인증서' })
    await screen.findByText('*.pickle.pnuops.com')

    await user.click(screen.getByLabelText(/30일 이내 만료만/))
    expect(await screen.findByText('shop.example.com')).toBeInTheDocument()
    // 와일드카드(수천 일)·발급 실패(만료일 없음)는 제외된다.
    expect(screen.queryByText('*.pickle.pnuops.com')).not.toBeInTheDocument()
    expect(screen.queryByText('api.example.org')).not.toBeInTheDocument()
  })
})
