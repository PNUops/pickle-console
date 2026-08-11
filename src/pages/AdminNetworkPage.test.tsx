import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { describe, expect, test } from 'vitest'
import { fetchAdminCampusIpRequests } from '../api/queries'
import {
  reauthGateHandlers,
  refreshSuccessHandler,
  sysAdminUser,
  sysManagerUser,
  USER_PASSWORD,
} from '../test/msw/handlers/auth'
import { RELAY_TOKEN_PLAINTEXT } from '../test/msw/handlers/network'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

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

  test('발급이 재인증을 요구하면 비밀번호 확인 모달을 거쳐 재시도된다', async () => {
    const user = userEvent.setup()
    // 서버가 X-Reauth-Token 없는 발급을 403 REAUTH_REQUIRED로 거절하는 상황.
    server.use(...reauthGateHandlers('POST /admin/relays/:relayId/token'))
    renderNetwork()

    await screen.findByText('relay-1')
    await user.click(screen.getByRole('button', { name: '토큰 재발급' }))
    const confirm = await screen.findByRole('dialog', { name: '토큰 재발급' })
    await user.click(within(confirm).getByRole('button', { name: '토큰 재발급' }))

    // fetch 계층이 403을 가로채 재인증 모달을 띄운다.
    const reauth = await screen.findByRole('dialog', { name: '비밀번호 확인' })
    await user.type(within(reauth).getByLabelText('비밀번호'), USER_PASSWORD)
    await user.click(within(reauth).getByRole('button', { name: '확인' }))

    // 원래 발급 요청이 헤더를 달고 재시도되어 토큰이 1회 표시된다.
    const result = await screen.findByRole('dialog', { name: '릴레이 토큰 발급 완료' })
    expect(within(result).getByText(RELAY_TOKEN_PLAINTEXT)).toBeInTheDocument()
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

    // 성공 피드백은 토스트 — 상태 필터로 행이 빠져 드로어가 닫혀도 남는다.
    expect(await screen.findByText(/포트 매핑을 정지했습니다/)).toBeInTheDocument()
    // 목록 재조회로 드로어의 상태 배지도 정지됨으로 바뀐다.
    expect(await within(drawer).findByText('정지됨')).toBeInTheDocument()
    // 정지된 매핑은 재개 버튼을 노출한다.
    expect(within(drawer).getByRole('button', { name: '재개' })).toBeInTheDocument()
  })

  // 매핑을 만든 사람도 정지한 사람도 예전에는 id만 있었다. 관리자 화면에서 id는 UUID라
  // 아무것도 알려주지 않아 생성자 자리가 '—'로 비어 있었고, 정지는 사람이 했는지조차
  // 구분되지 않았다. 이제 응답이 이름을 실어 준다.
  test('드로어는 매핑을 만든 사람과 정지한 사람을 이름으로 밝힌다', async () => {
    const user = userEvent.setup()
    renderNetwork('forwardings')

    // 정지된 매핑만 남겨 같은 VM의 활성 매핑과 행이 겹치지 않게 한다.
    await user.click(await screen.findByRole('button', { name: '정지됨' }))
    await user.click(await screen.findByRole('button', { name: 'algo-judge' }))
    const drawer = await screen.findByRole('dialog', { name: '포트 매핑 상세' })

    const creator = within(drawer).getByText('생성자').closest('div')!
    expect(within(creator).getByText('김철수')).toBeInTheDocument()
    expect(within(drawer).getByText(/과도한 트래픽 발생 \(정지: 이시스템\)/)).toBeInTheDocument()
    expect(within(drawer).queryByText(/자동 정지/)).not.toBeInTheDocument()
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

  test('SYS_ADMIN은 가드를 저장할 수 있다 (빈칸=null 기본값, 0=해제 payload)', async () => {
    const user = userEvent.setup()
    // 전송 본문을 캡처해 null(기본값 복귀) vs 0(가드 해제) 의미론을 단정한다.
    let captured: unknown
    server.use(
      http.patch('*/api/v1/admin/port-mappings/:mappingId/guards', async ({ request }) => {
        captured = await request.clone().json()
        return undefined // 기본 핸들러로 통과
      }),
    )
    renderNetwork('forwardings')

    await user.click(await screen.findByRole('button', { name: 'expiring-api' }))
    const drawer = await screen.findByRole('dialog', { name: '포트 매핑 상세' })
    expect(within(drawer).getByText('빈칸 = 릴레이 기본값, 0 = 해당 가드 해제.')).toBeInTheDocument()

    await user.type(within(drawer).getByLabelText('동시 연결 상한'), '2048')
    await user.type(within(drawer).getByLabelText('출발지별 초당 신규'), '0')
    await user.click(within(drawer).getByRole('button', { name: '가드 저장' }))
    expect(await screen.findByText(/연결 가드를 조정했습니다/)).toBeInTheDocument()
    expect(captured).toEqual({
      ctMax: 2048,
      newConnRate: null,
      newConnBurst: null,
      perSourceRate: 0,
      perSourceBurst: null,
    })
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

    // APPROVED → 할당: 주소 없이 누르면 클라이언트 검증이 막는다.
    const grant = await within(drawer).findByRole('button', { name: '할당' })
    await user.click(grant)
    expect(
      await within(drawer).findByText('올바른 IPv4 주소를 입력해 주세요.'),
    ).toBeInTheDocument()

    // 캠퍼스 대역(10.0.0.0/8) 밖 주소도 왕복 없이 막는다.
    const address = within(drawer).getByLabelText(/연결된 교내 IP/)
    await user.type(address, '203.0.113.9')
    await user.click(grant)
    expect(
      await within(drawer).findByText('교내 IP는 10.0.0.0/8 대역의 주소여야 합니다.'),
    ).toBeInTheDocument()

    await user.clear(address)
    await user.type(address, '10.20.30.40')
    await user.click(grant)
    expect(await screen.findByText(/'할당됨' 상태로 전환했습니다/)).toBeInTheDocument()
    expect(await within(drawer).findByText('10.20.30.40')).toBeInTheDocument()
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

  test('목록 API는 계약의 vmId 필터를 지원한다', async () => {
    const filtered = await fetchAdminCampusIpRequests({ vmId: uuid(61) })
    expect(filtered.content).toHaveLength(1)
    expect(filtered.content[0].vmId).toBe(uuid(61))

    const all = await fetchAdminCampusIpRequests()
    expect(all.content.length).toBeGreaterThan(1)
  })
})
