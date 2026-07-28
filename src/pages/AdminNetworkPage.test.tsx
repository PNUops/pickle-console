import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import {
  refreshSuccessHandler,
  sysAdminUser,
  sysManagerUser,
} from '../test/msw/handlers/auth'
import { RELAY_TOKEN_PLAINTEXT } from '../test/msw/handlers/network'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderNetwork(tab = '', token = 'access-sys-admin', user = sysAdminUser) {
  server.use(refreshSuccessHandler(token, user))
  renderApp(`/admin/network${tab ? `?tab=${tab}` : ''}`)
}

describe('네트워크 — 릴레이 탭', () => {
  test('릴레이별 상태·동기화 세대·대역 사용률을 보여준다', async () => {
    renderNetwork()

    await screen.findByRole('heading', { name: '네트워크', level: 1 })
    // 정상 릴레이
    const healthy = (await screen.findByText('relay-1')).closest('div')!.parentElement!
      .parentElement as HTMLElement
    expect(within(healthy).getByText('정상')).toBeInTheDocument()
    expect(within(healthy).getByText('동기화: gen 42/42')).toBeInTheDocument()
    expect(within(healthy).getByText('203.0.113.10')).toBeInTheDocument()

    // 이상 릴레이: 접촉 두절 + 적용 지연 + 공개 호스트 미설정 + 적용 실패 오류.
    const degraded = screen.getByText('relay-2').closest('div')!.parentElement!
      .parentElement as HTMLElement
    expect(within(degraded).getByText('접촉 두절')).toBeInTheDocument()
    expect(within(degraded).getByText('적용 지연')).toBeInTheDocument()
    expect(within(degraded).getByText('토큰 미발급')).toBeInTheDocument()
    expect(within(degraded).getByText('동기화: gen 5/8')).toBeInTheDocument()
    expect(within(degraded).getByText('미설정')).toBeInTheDocument()
    expect(within(degraded).getByText('87%')).toBeInTheDocument()
    expect(within(degraded).getByText(/nft 적용 실패/)).toBeInTheDocument()
  })

  test('SYS_MANAGER에게 토큰 발급은 비활성 + 권한 안내가 보인다', async () => {
    renderNetwork('', 'access-sys-manager', sysManagerUser)

    await screen.findByText('relay-1')
    expect(screen.getByRole('button', { name: '토큰 재발급' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '토큰 발급' })).toBeDisabled()
    expect(
      screen.getAllByText('토큰 발급은 시스템 관리자만 수행할 수 있습니다.').length,
    ).toBeGreaterThan(0)
  })

  test('SYS_ADMIN 재발급: 무효화 경고 확인 후 평문 토큰을 1회만 보여준다', async () => {
    const user = userEvent.setup()
    renderNetwork()

    await screen.findByText('relay-1')
    await user.click(screen.getByRole('button', { name: '토큰 재발급' }))

    const confirm = await screen.findByRole('dialog', { name: '토큰 재발급' })
    expect(
      within(confirm).getByText(/재발급 즉시 이전 토큰이 무효화됩니다/),
    ).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: '토큰 재발급' }))

    const result = await screen.findByRole('dialog', { name: '릴레이 토큰 발급 완료' })
    expect(within(result).getByText('이 토큰은 다시 볼 수 없습니다')).toBeInTheDocument()
    expect(within(result).getByText(RELAY_TOKEN_PLAINTEXT)).toBeInTheDocument()
    expect(within(result).getByRole('button', { name: '복사' })).toBeInTheDocument()

    // 닫으면 평문은 화면에서 사라진다 (다시 볼 수 없음).
    await user.click(within(result).getByRole('button', { name: '확인했습니다' }))
    await waitFor(() =>
      expect(screen.queryByText(RELAY_TOKEN_PLAINTEXT)).not.toBeInTheDocument(),
    )
  })
})

describe('네트워크 — 포트포워딩 탭', () => {
  test('행 선택 → 드로어에서 사유와 함께 정지하고 목록에 반영된다', async () => {
    const user = userEvent.setup()
    renderNetwork('forwardings')

    await user.click(await screen.findByRole('button', { name: 'expiring-api' }))
    const drawer = await screen.findByRole('dialog', { name: '포트 매핑 상세' })
    expect(within(drawer).getByText(':14000 → 3000/TCP')).toBeInTheDocument()

    await user.click(within(drawer).getByRole('button', { name: '정지' }))
    const modal = await screen.findByRole('dialog', { name: '포트 매핑 정지' })
    const submit = within(modal).getByRole('button', { name: '정지' })
    expect(submit).toBeDisabled() // 사유 필수
    await user.type(within(modal).getByLabelText(/정지 사유/), '과도한 트래픽 발생')
    await user.click(submit)

    expect(await within(drawer).findByText(/포트 매핑을 정지했습니다/)).toBeInTheDocument()
    // 목록 재조회로 드로어의 상태 배지도 정지됨으로 바뀐다.
    expect(await within(drawer).findByText('정지됨')).toBeInTheDocument()
    // 정지된 매핑은 재개 버튼을 노출한다.
    expect(within(drawer).getByRole('button', { name: '재개' })).toBeInTheDocument()
  })

  test('가드 조정은 SYS_ADMIN 전용 — SYS_MANAGER는 비활성 + 안내', async () => {
    const user = userEvent.setup()
    renderNetwork('forwardings', 'access-sys-manager', sysManagerUser)

    await user.click(await screen.findByRole('button', { name: 'expiring-api' }))
    const drawer = await screen.findByRole('dialog', { name: '포트 매핑 상세' })
    expect(
      within(drawer).getByText('연결 가드 조정은 시스템 관리자만 수행할 수 있습니다.'),
    ).toBeInTheDocument()
    expect(within(drawer).getByLabelText('동시 연결 상한')).toBeDisabled()
    expect(within(drawer).getByRole('button', { name: '가드 저장' })).toBeDisabled()
  })

  test('SYS_ADMIN은 가드를 저장할 수 있다 (빈칸=기본값, 0=해제)', async () => {
    const user = userEvent.setup()
    renderNetwork('forwardings')

    await user.click(await screen.findByRole('button', { name: 'expiring-api' }))
    const drawer = await screen.findByRole('dialog', { name: '포트 매핑 상세' })
    expect(within(drawer).getByText('빈칸 = 릴레이 기본값, 0 = 해당 가드 해제.')).toBeInTheDocument()

    await user.type(within(drawer).getByLabelText('동시 연결 상한'), '2048')
    await user.type(within(drawer).getByLabelText('출발지별 초당 신규'), '0')
    await user.click(within(drawer).getByRole('button', { name: '가드 저장' }))
    expect(await within(drawer).findByText(/연결 가드를 조정했습니다/)).toBeInTheDocument()
  })
})

describe('네트워크 — 캠퍼스 IP 탭', () => {
  test('SYS_ADMIN은 승인 → 할당(IPv4 필수) 전환을 진행한다', async () => {
    const user = userEvent.setup()
    renderNetwork('campus')

    await user.click(await screen.findByRole('button', { name: 'shop-app' }))
    const drawer = await screen.findByRole('dialog', { name: '캠퍼스 IP 신청 상세' })
    expect(within(drawer).getByText(/학과 실습 서버 외부 연동/)).toBeInTheDocument()
    expect(within(drawer).getByText('80, 443')).toBeInTheDocument()

    // REQUESTED → 승인
    await user.click(within(drawer).getByRole('button', { name: '승인' }))
    expect(await screen.findByText(/'승인됨' 상태로 전환했습니다/)).toBeInTheDocument()

    // APPROVED → 할당: IPv4 없이 누르면 클라이언트 검증이 막는다.
    const grant = await within(drawer).findByRole('button', { name: '할당' })
    await user.click(grant)
    expect(
      await within(drawer).findByText('올바른 IPv4 주소를 입력해 주세요.'),
    ).toBeInTheDocument()

    await user.type(within(drawer).getByLabelText(/부여된 캠퍼스 IP/), '198.51.100.30')
    await user.click(grant)
    expect(await screen.findByText(/'할당됨' 상태로 전환했습니다/)).toBeInTheDocument()
    expect(await within(drawer).findByText('198.51.100.30')).toBeInTheDocument()
    // GRANTED → 회수만 가능하다.
    expect(await within(drawer).findByRole('button', { name: '회수' })).toBeInTheDocument()
  })

  test('SYS_MANAGER는 전환 버튼이 비활성 + 권한 안내를 본다', async () => {
    const user = userEvent.setup()
    renderNetwork('campus', 'access-sys-manager', sysManagerUser)

    await user.click(await screen.findByRole('button', { name: 'shop-app' }))
    const drawer = await screen.findByRole('dialog', { name: '캠퍼스 IP 신청 상세' })
    expect(
      within(drawer).getByText(/캠퍼스 IP 신청 처리.*시스템 관리자만/),
    ).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: '승인' })).toBeDisabled()
    expect(within(drawer).getByRole('button', { name: '반려' })).toBeDisabled()
  })

  test('상태 필터로 부여된 신청만 볼 수 있다', async () => {
    const user = userEvent.setup()
    renderNetwork('campus')

    await screen.findByRole('button', { name: 'shop-app' })
    await user.click(screen.getByRole('button', { name: '할당됨' }))
    expect(await screen.findByRole('button', { name: 'ai-train' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'shop-app' })).not.toBeInTheDocument()
  })
})
