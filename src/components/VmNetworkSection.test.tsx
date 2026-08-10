import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { AuthProvider } from '../auth/AuthProvider'
import { ReauthProvider } from '../auth/ReauthProvider'
import { orgManagerUser, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { vmDetailAs, vmStore } from '../test/msw/handlers/vms'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { ToastProvider } from './ui'
import { VmNetworkSection } from './VmNetworkSection'
import { uuid } from '../test/msw/ids'

/** VM 상세의 네트워크 탭을 연다 (기본: 일반 사용자 세션). */
function renderNetworkTab(
  vmId: string,
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
  vmId: string,
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

describe('VM 네트워크 탭 — 캠퍼스 IP', () => {
  test('일반 USER(OWNER)가 신청 폼을 보고 신청 → 상태 카드 → 취소까지 진행한다', async () => {
    const user = userEvent.setup()
    renderNetworkTab(uuid(57)) // web-lab: 워크스페이스 12 OWNER

    await screen.findByRole('heading', { name: 'web-lab' })
    // 개정된 안내: 교내 IP(10.x) 연결 + 기본 차단·신청 포트만 개방 + 공인 IP는 별도.
    expect(
      await screen.findByText(/승인되면 VM이 캠퍼스 네트워크의 교내 IP\(10\.x\)로 연결됩니다/),
    ).toBeInTheDocument()
    expect(screen.getByText(/신청한 포트만 개방됩니다/)).toBeInTheDocument()

    await user.type(
      await screen.findByLabelText('신청 목적'),
      '학과 실습 서버 연동 (교내망 고정 주소 필요)',
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

  test('참여자는 캠퍼스 IP 상태를 읽되 신청·취소는 할 수 없다', async () => {
    server.use(vmDetailAs(uuid(56), 'MEMBER'))
    renderNetworkTab(uuid(56))

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(
      await screen.findByText(/캠퍼스 IP 신청·취소는 이 VM의 소유자·편집자만/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '캠퍼스 IP 신청' })).not.toBeInTheDocument()
  })

  test('관리자 계층 세션에서도 판정은 VM이 내려준 권한을 따른다', async () => {
    // 콘솔은 세션 등급을 보지 않는다 — 픽스처 57은 편집 권한이 있는 VM이다.
    renderSection(uuid(57), 'access-org-manager', orgManagerUser)

    expect(await screen.findByRole('button', { name: '캠퍼스 IP 신청' })).toBeInTheDocument()
  })

  test('진행 중 신청이 있으면 폼 대신 상태 카드를 보여준다 (GRANTED 주소 노출)', async () => {
    server.use(
      http.get(`*/api/v1/vms/${uuid(57)}/campus-ip-requests`, () =>
        HttpResponse.json([
          {
            id: uuid(9),
            vmId: uuid(57),
            purpose: '연구 장비 연동',
            ports: [8443],
            status: 'GRANTED',
            grantedAddress: '10.20.30.40',
            adminNote: '캠퍼스 네트워크 연결 완료',
            requestedBy: 42,
            processedAt: '2026-07-10T15:00:00+09:00',
            createdAt: '2026-07-01T09:00:00+09:00',
          },
        ]),
      ),
    )
    renderNetworkTab(uuid(57))

    expect(await screen.findByText('할당됨')).toBeInTheDocument()
    expect(screen.getByText('10.20.30.40')).toBeInTheDocument()
    expect(screen.getByText(/캠퍼스 네트워크 연결 완료/)).toBeInTheDocument()
    // GRANTED는 사용자가 취소할 수 없고, 새 신청 폼도 없다.
    expect(screen.queryByRole('button', { name: '신청 취소' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '캠퍼스 IP 신청' })).not.toBeInTheDocument()
  })

  test('이미 활성 신청이 있으면 409를 안내하고 상태 카드로 전환한다', async () => {
    const user = userEvent.setup()
    // 폼을 그린 뒤(빈 이력) 제출 시점에 서버가 409를 돌려주는 경합 상황.
    let listCalls = 0
    server.use(
      http.post(`*/api/v1/vms/${uuid(57)}/campus-ip-requests`, () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: '이미 진행 중인 캠퍼스 IP 신청이 있습니다',
            status: 409,
            detail:
              '이 VM에는 진행 중인 교내 IP 신청이 이미 있습니다. 기존 신청이 끝난 뒤 다시 신청해 주세요.',
            code: 'CAMPUS_IP_REQUEST_EXISTS',
          },
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
      http.get(`*/api/v1/vms/${uuid(57)}/campus-ip-requests`, () => {
        listCalls += 1
        if (listCalls === 1) return HttpResponse.json([])
        return HttpResponse.json([
          {
            id: uuid(11),
            vmId: uuid(57),
            purpose: '다른 구성원이 먼저 신청함',
            ports: [80],
            status: 'REQUESTED',
            grantedAddress: null,
            adminNote: null,
            requestedBy: 57,
            processedAt: null,
            createdAt: '2026-07-11T09:00:00+09:00',
          },
        ])
      }),
    )
    renderNetworkTab(uuid(57))

    await user.type(await screen.findByLabelText('신청 목적'), '중복 신청 시도')
    await user.type(screen.getByLabelText('개방 포트'), '80')
    await user.click(screen.getByRole('button', { name: '캠퍼스 IP 신청' }))

    expect(
      await screen.findByText(/진행 중인 교내 IP 신청이 이미 있습니다/),
    ).toBeInTheDocument()
    // 무효화로 최신 이력을 다시 읽어 상태 카드로 전환된다.
    expect(await screen.findByText('신청됨')).toBeInTheDocument()
  })

  test('검토가 시작된 신청의 취소 거부(409)는 사유를 보여준다', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(`*/api/v1/vms/${uuid(57)}/campus-ip-requests`, () =>
        HttpResponse.json([
          {
            id: uuid(12),
            vmId: uuid(57),
            purpose: '연구 장비 연동',
            ports: [80],
            status: 'REQUESTED',
            grantedAddress: null,
            adminNote: null,
            requestedBy: 42,
            processedAt: null,
            createdAt: '2026-07-11T09:00:00+09:00',
          },
        ]),
      ),
      http.delete(`*/api/v1/vms/${uuid(57)}/campus-ip-requests/${uuid(12)}`, () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: '전환할 수 없는 상태입니다',
            status: 409,
            detail: '검토가 시작되기 전(REQUESTED)의 신청만 취소할 수 있습니다.',
            code: 'CAMPUS_IP_INVALID_TRANSITION',
          },
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    renderNetworkTab(uuid(57))

    await user.click(await screen.findByRole('button', { name: '신청 취소' }))
    // 서버 문구 전문이 아니라 안정된 조각으로 단정한다 (api 카피 변경에 견딤).
    expect(await screen.findByText(/검토가 시작되기 전/)).toBeInTheDocument()
  })
})
