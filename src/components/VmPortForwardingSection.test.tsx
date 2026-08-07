import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { RELAY_PUBLIC_HOST } from '../test/msw/handlers/network'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

/** VM 상세의 도메인·포트 탭을 연다 (기본: 일반 사용자 세션). */
function renderPublishTab(
  vmId: number,
  token = 'access-user',
  user?: Parameters<typeof refreshSuccessHandler>[1],
) {
  server.use(refreshSuccessHandler(token, user))
  renderApp(`/console/vms/${vmId}?tab=publish`)
}

describe('VM 도메인·포트 탭 — 포트포워딩', () => {
  test('MEMBER는 목록·상태 배지를 읽기 전용으로 본다', async () => {
    renderPublishTab(56) // algo-judge: 그룹 15 — 로그인 사용자는 MEMBER

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
    renderPublishTab(45) // expiring-api: 그룹 12 OWNER, RUNNING + IP

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
    renderPublishTab(45)

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
    renderPublishTab(45)

    await screen.findByRole('heading', { name: 'expiring-api' })
    const port = await screen.findByLabelText('대상 포트')
    await user.type(port, '70000')
    await user.click(screen.getByRole('button', { name: '포트포워딩 만들기' }))
    expect(await screen.findByText('포트는 1–65535 범위여야 합니다.')).toBeInTheDocument()
  })

  test('적용 실패 매핑은 실패 배지를 보이고 완만한 폴링으로 회복을 반영한다', async () => {
    // 첫 응답은 FAILED, 이후 응답은 ACTIVE — 실패만 남아도 느린 폴링이
    // 계속되어 관리자 개입 후 회복이 화면에 반영됨을 확인한다.
    let calls = 0
    server.use(
      http.get('*/api/v1/vms/56/port-forwardings', () => {
        calls += 1
        return HttpResponse.json([
          {
            id: 900,
            proto: 'TCP',
            publicHost: RELAY_PUBLIC_HOST,
            publicPort: 16000,
            targetPort: 9000,
            status: 'ACTIVE',
            applyState: calls < 2 ? 'FAILED' : 'ACTIVE',
            createdAt: '2026-07-11T10:00:00+09:00',
          },
        ])
      }),
    )
    renderPublishTab(56)

    expect(await screen.findByText('실패')).toBeInTheDocument()
    // 느린 폴링 주기(테스트 250ms) 후 회복이 반영된다.
    expect(await screen.findByText('활성')).toBeInTheDocument()
  })

  test('폼에 자리가 없는 서버 필드 오류도 요약 목록으로 노출된다', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/api/v1/vms/45/port-forwardings', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: '입력값이 올바르지 않습니다',
            status: 422,
            detail: '요청 값을 확인해 주세요.',
            code: 'VALIDATION_FAILED',
            errors: [{ field: 'relayId', message: '사용 가능한 릴레이가 없습니다.' }],
          },
          { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    renderPublishTab(45)

    await screen.findByRole('heading', { name: 'expiring-api' })
    await user.type(await screen.findByLabelText('대상 포트'), '8080')
    await user.click(screen.getByRole('button', { name: '포트포워딩 만들기' }))
    // relayId는 폼에 표시 자리가 없다 — 요약 Alert 목록으로 노출돼야 한다.
    expect(
      await screen.findByText(/relayId: 사용 가능한 릴레이가 없습니다\./),
    ).toBeInTheDocument()
  })
})
