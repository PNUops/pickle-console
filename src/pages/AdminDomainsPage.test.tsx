import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  refreshSuccessHandler,
  sysAdminUser,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderDomains(token = 'access-sys-admin', user = sysAdminUser) {
  server.use(refreshSuccessHandler(token, user))
  renderApp('/admin/domains')
}

describe('공개 서비스 — 도메인 탭', () => {
  test('도메인 상태·라우트·인증서 상태를 함께 나열한다', async () => {
    renderDomains()

    await screen.findByRole('heading', { name: '공개 서비스', level: 1 })
    const verifying = (await screen.findByText('demo.example.com')).closest('tr')!
    expect(within(verifying).getByText('검증 중')).toBeInTheDocument()
    expect(within(verifying).getByText('커스텀')).toBeInTheDocument()
    expect(within(verifying).getByText('적용 대기')).toBeInTheDocument()
  })

  test('행을 선택하면 드로어에 라우트 상세와 개입 작업이 열린다', async () => {
    const user = userEvent.setup()
    renderDomains()

    await user.click(await screen.findByRole('button', { name: 'ai-team.pusan.dev' }))
    const drawer = within(await screen.findByRole('dialog', { name: '도메인 상세' }))
    // 라우트 상세(포트·동기화)와 VM 교차 링크
    expect(await drawer.findByText('대상 포트')).toBeInTheDocument()
    expect(drawer.getByRole('link', { name: '상세' })).toBeInTheDocument()
    // 플랫폼 도메인이라 재검증은 없고 강제 해제·재적용만
    expect(drawer.queryByRole('button', { name: '재검증' })).not.toBeInTheDocument()
    expect(drawer.getByRole('button', { name: '강제 해제' })).toBeInTheDocument()
    expect(drawer.getByRole('button', { name: '재적용' })).toBeInTheDocument()
  })

  test('드로어에서 강제 해제는 fqdn 확인을 거쳐 목록에서 제거한다', async () => {
    const user = userEvent.setup()
    renderDomains()

    await user.click(await screen.findByRole('button', { name: 'demo.example.com' }))
    const drawer = await screen.findByRole('dialog', { name: '도메인 상세' })
    // 커스텀 도메인은 재검증도 가능
    expect(within(drawer).getByRole('button', { name: '재검증' })).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: '강제 해제' }))

    const confirm = await screen.findByRole('dialog', { name: '도메인 강제 해제' })
    const submit = within(confirm).getByRole('button', { name: '강제 해제' })
    expect(submit).toBeDisabled()
    await user.type(within(confirm).getByRole('textbox'), 'demo.example.com')
    await user.click(submit)

    expect(await screen.findByText(/강제 해제했습니다/)).toBeInTheDocument()
    expect(screen.queryByText('demo.example.com')).not.toBeInTheDocument()
  })

  test('드로어의 재적용은 접수 메시지를 보여준다 (기관 관리자 포함)', async () => {
    const user = userEvent.setup()
    renderDomains('access-org-admin', orgAdminUser)

    await user.click(await screen.findByRole('button', { name: 'shop.example.com' }))
    const drawer = within(await screen.findByRole('dialog', { name: '도메인 상세' }))
    // 적용 실패 라우트는 오류 요약을 함께 노출한다
    expect(await drawer.findByText(/nginx -t 실패/)).toBeInTheDocument()
    await user.click(drawer.getByRole('button', { name: '재적용' }))
    expect(await screen.findByText(/라우트 재적용을 접수했습니다/)).toBeInTheDocument()
  })

  test('검증 미완 도메인에는 재적용 액션이 보이지 않는다', async () => {
    const user = userEvent.setup()
    renderDomains()

    await user.click(await screen.findByRole('button', { name: 'demo.example.com' }))
    const drawer = within(await screen.findByRole('dialog', { name: '도메인 상세' }))
    expect(drawer.queryByRole('button', { name: '재적용' })).not.toBeInTheDocument()
  })

  test('예약 중인 이름은 목록에서 예약 배지와 만료 D-day로 구분된다', async () => {
    renderDomains()

    // 예약 중 행의 status는 ACTIVE 그대로다 — 배지가 없으면 라우트 없는
    // 평범한 ACTIVE 도메인과 구분되지 않는다.
    const reserved = (await screen.findByText('shop-old.pusan.dev')).closest('tr')!
    expect(within(reserved).getByText('연결됨')).toBeInTheDocument()
    expect(within(reserved).getByText('예약 중')).toBeInTheDocument()
    expect(within(reserved).getByText(/^D-/)).toBeInTheDocument()

    const serving = (await screen.findByText('ai-team.pusan.dev')).closest('tr')!
    expect(within(serving).queryByText('예약 중')).not.toBeInTheDocument()
  })

  test('예약 중 행의 드로어는 해제 시각·예약 만료와 강제 해제 의미를 보여준다', async () => {
    const user = userEvent.setup()
    renderDomains()

    await user.click(await screen.findByRole('button', { name: 'shop-old.pusan.dev' }))
    const drawer = within(await screen.findByRole('dialog', { name: '도메인 상세' }))
    expect(await drawer.findByText('해제 시각')).toBeInTheDocument()
    expect(drawer.getByText('예약 만료')).toBeInTheDocument()

    // 내릴 라우트가 없는 행이므로 확인 문구도 이름 회수만 말해야 한다.
    await user.click(drawer.getByRole('button', { name: '강제 해제' }))
    const confirm = within(await screen.findByRole('dialog', { name: '도메인 강제 해제' }))
    expect(confirm.getByText(/예약이 만료되기를 기다리지 않고/)).toBeInTheDocument()
  })

  test('종류 필터로 커스텀 도메인만 볼 수 있다', async () => {
    const user = userEvent.setup()
    renderDomains()

    await screen.findByRole('heading', { name: '공개 서비스', level: 1 })
    await screen.findByText('ai-team.pusan.dev')

    await user.selectOptions(screen.getByLabelText('종류 필터'), 'CUSTOM')
    expect(await screen.findByText('demo.example.com')).toBeInTheDocument()
    expect(screen.queryByText('ai-team.pusan.dev')).not.toBeInTheDocument()
  })
})

describe('공개 서비스 — 전체 재동기화·인증서 탭', () => {
  test('SYS_ADMIN은 헤더에서 전체 재동기화를 접수할 수 있다', async () => {
    const user = userEvent.setup()
    renderDomains()

    await screen.findByRole('heading', { name: '공개 서비스', level: 1 })
    await user.click(screen.getByRole('button', { name: /전체 재동기화/ }))
    expect(
      await screen.findByText(/라우트 전체 재동기화를 접수했습니다/),
    ).toBeInTheDocument()
  })

  test('ORG_ADMIN에게는 전체 재동기화 버튼이 없다', async () => {
    renderDomains('access-org-admin', orgAdminUser)

    await screen.findByRole('heading', { name: '공개 서비스', level: 1 })
    expect(screen.queryByRole('button', { name: /전체 재동기화/ })).not.toBeInTheDocument()
  })

  test('인증서 탭은 만료 임박 필터와 함께 인증서를 나열한다', async () => {
    const user = userEvent.setup()
    renderDomains()

    await screen.findByRole('heading', { name: '공개 서비스', level: 1 })
    await user.click(screen.getByRole('tab', { name: '인증서' }))

    expect(await screen.findByText('*.pusan.dev')).toBeInTheDocument()
    expect(screen.getByLabelText('30일 이내 만료만')).toBeInTheDocument()
  })
})
