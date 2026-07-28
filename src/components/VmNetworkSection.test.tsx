import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { AuthProvider } from '../auth/AuthProvider'
import { ReauthProvider } from '../auth/ReauthProvider'
import { orgManagerUser, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { RELAY_PUBLIC_HOST } from '../test/msw/handlers/network'
import { vmStore } from '../test/msw/handlers/vms'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { ToastProvider } from './ui'
import { VmNetworkSection } from './VmNetworkSection'

/** VM 상세의 네트워크 탭을 연다 (기본: 일반 사용자 세션). */
function renderNetworkTab(
  vmId: number,
  token = 'access-user',
  user?: Parameters<typeof refreshSuccessHandler>[1],
) {
  server.use(refreshSuccessHandler(token, user))
  renderApp(`/console/vms/${vmId}?tab=network`)
}

/**
 * 섹션 단독 렌더 — /console 라우트는 USER 전용(RequireRole)이라 관리자 계층
 * 세션의 캠퍼스 IP 게이트는 섹션을 직접 마운트해 검증한다.
 */
function renderSection(
  vmId: number,
  token: string,
  user: Parameters<typeof refreshSuccessHandler>[1],
) {
  server.use(refreshSuccessHandler(token, user))
  const vm = vmStore.find((v) => v.id === vmId)!
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <ReauthProvider>
              <VmNetworkSection vm={vm} />
            </ReauthProvider>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('VM 네트워크 탭 — 포트포워딩', () => {
  test('MEMBER는 목록·상태 배지를 읽기 전용으로 본다', async () => {
    renderNetworkTab(56) // algo-judge: 그룹 15 — 로그인 사용자는 MEMBER

    await screen.findByRole('heading', { name: 'algo-judge' })
    // 활성 매핑 + 정지된 매핑이 함께 나열된다.
    expect(await screen.findByText(`${RELAY_PUBLIC_HOST}:12345`)).toBeInTheDocument()
    expect(screen.getByText('8080/TCP')).toBeInTheDocument()
    expect(screen.getByText(`${RELAY_PUBLIC_HOST}:13001`)).toBeInTheDocument()
    expect(screen.getByText('정지됨')).toBeInTheDocument()
    // 읽기 전용: 생성 폼도 삭제 버튼도 없다.
    expect(
      screen.getByText(/포트포워딩 생성·삭제는 그룹의 소유자·편집자만/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '포트포워딩 만들기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
    // SSH 로컬 포워딩 안내가 함께 보인다.
    expect(
      screen.getByText('본인만 접속한다면 SSH 로컬 포워딩으로 충분합니다'),
    ).toBeInTheDocument()
  })

  test('OWNER가 만들면 대기 → 폴링으로 활성에 수렴한다', async () => {
    const user = userEvent.setup()
    renderNetworkTab(45) // expiring-api: 그룹 12 OWNER, RUNNING + IP

    await screen.findByRole('heading', { name: 'expiring-api' })
    const port = await screen.findByLabelText('대상 포트')
    await user.type(port, '8080')
    await user.click(screen.getByRole('button', { name: '포트포워딩 만들기' }))

    // 공인 포트는 자동 할당된다 (mock: 15000부터) — 접수 직후 반영 대기.
    const row = (await screen.findByText(`${RELAY_PUBLIC_HOST}:15000`)).closest('li')!
    expect(within(row).getByText('대기')).toBeInTheDocument()
    // 폴링(테스트 50ms)으로 릴레이 수렴을 반영해 활성으로 바뀐다.
    await within(row).findByText('활성')
  })

  test('EDITOR도 생성 폼을 보고 매핑을 삭제할 수 있다', async () => {
    const user = userEvent.setup()
    // 그룹 12 역할을 EDITOR로 바꿔 EDITOR 게이트를 확인한다.
    server.use(
      http.get('*/api/v1/groups/12', () =>
        HttpResponse.json({
          id: 12,
          kind: 'PROJECT',
          name: '캡스톤 3조',
          slug: 'capstone-team3',
          description: null,
          myRole: 'EDITOR',
          createdAt: '2026-07-01T10:12:00+09:00',
          members: [],
        }),
      ),
    )
    renderNetworkTab(45)

    await screen.findByRole('heading', { name: 'expiring-api' })
    expect(await screen.findByRole('button', { name: '포트포워딩 만들기' })).toBeInTheDocument()

    const row = (await screen.findByText(`${RELAY_PUBLIC_HOST}:14000`)).closest('li')!
    await user.click(within(row).getByRole('button', { name: '삭제' }))
    expect(await screen.findByText(/포트포워딩 삭제를 접수했습니다/)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByText(`${RELAY_PUBLIC_HOST}:14000`)).not.toBeInTheDocument(),
    )
  })

  test('대상 포트 범위 밖 입력은 왕복 없이 필드 오류로 막는다', async () => {
    const user = userEvent.setup()
    renderNetworkTab(45)

    await screen.findByRole('heading', { name: 'expiring-api' })
    const port = await screen.findByLabelText('대상 포트')
    await user.type(port, '70000')
    await user.click(screen.getByRole('button', { name: '포트포워딩 만들기' }))
    expect(await screen.findByText('포트는 1–65535 범위여야 합니다.')).toBeInTheDocument()
  })
})

describe('VM 네트워크 탭 — 캠퍼스 IP 절', () => {
  test('일반 USER에게는 캠퍼스 IP 절이 렌더링되지 않는다', async () => {
    renderNetworkTab(45)

    await screen.findByRole('heading', { name: 'expiring-api' })
    await screen.findByText(`${RELAY_PUBLIC_HOST}:14000`)
    expect(screen.queryByText('캠퍼스 IP')).not.toBeInTheDocument()
    expect(screen.queryByText(/정보전산원/)).not.toBeInTheDocument()
  })

  test('ORG_MANAGER는 신청 폼을 보고 신청 → 상태 카드 → 취소까지 진행한다', async () => {
    const user = userEvent.setup()
    renderSection(57, 'access-org-manager', orgManagerUser) // web-lab: 그룹 12

    // 의무 안내 문구: 정보전산원 절차 + 기본 차단·신청 포트만 개방.
    expect(
      await screen.findByText(/캠퍼스 IP는 정보전산원 교내 IP 신청 절차를 거쳐 할당되며/),
    ).toBeInTheDocument()

    await user.type(
      await screen.findByLabelText('신청 목적'),
      '학과 실습 서버 외부 연동 (교내망 고정 주소 필요)',
    )
    await user.type(screen.getByLabelText('개방 포트'), '443, 80, 443')
    await user.click(screen.getByRole('button', { name: '캠퍼스 IP 신청' }))

    // 신청 접수 → 상태 카드 (신청됨) + 정규화된 포트 목록.
    expect(await screen.findByText('신청됨')).toBeInTheDocument()
    expect(screen.getByText('80, 443')).toBeInTheDocument()

    // REQUESTED 상태에서만 취소할 수 있다.
    await user.click(screen.getByRole('button', { name: '신청 취소' }))
    expect(await screen.findByRole('button', { name: '캠퍼스 IP 신청' })).toBeInTheDocument()
  })

  test('진행 중 신청이 있으면 폼 대신 상태 카드를 보여준다 (GRANTED 주소 노출)', async () => {
    server.use(
      http.get('*/api/v1/vms/57/campus-ip-requests', () =>
        HttpResponse.json([
          {
            id: 9,
            vmId: 57,
            purpose: '연구 장비 연동',
            ports: [8443],
            status: 'GRANTED',
            grantedAddress: '198.51.100.20',
            adminNote: '정보전산원 절차 완료',
            requestedBy: 8,
            processedAt: '2026-07-10T15:00:00+09:00',
            createdAt: '2026-07-01T09:00:00+09:00',
          },
        ]),
      ),
    )
    renderSection(57, 'access-org-manager', orgManagerUser)

    expect(await screen.findByText('할당됨')).toBeInTheDocument()
    expect(screen.getByText('198.51.100.20')).toBeInTheDocument()
    expect(screen.getByText(/정보전산원 절차 완료/)).toBeInTheDocument()
    // GRANTED는 사용자가 취소할 수 없고, 새 신청 폼도 없다.
    expect(screen.queryByRole('button', { name: '신청 취소' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '캠퍼스 IP 신청' })).not.toBeInTheDocument()
  })
})
