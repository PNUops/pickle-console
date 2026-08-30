import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderDashboard() {
  server.use(refreshSuccessHandler('access-user'))
  renderApp('/console')
}

describe('콘솔 대시보드 — 합성 지표·목록', () => {
  test('지표 타일이 리소스·신청·알림 수를 보여준다', async () => {
    renderDashboard()

    await screen.findByRole('heading', { name: '대시보드' })
    // 타일은 값("n개")까지 담으므로 그것으로 식별한다.
    await waitFor(() => {
      expect(
        screen
          .getAllByRole('link', { name: /내 리소스/ })
          .some((el) => /개/.test(el.textContent ?? '')),
      ).toBe(true)
    })
    expect(screen.getByRole('link', { name: '대기 중 신청' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '읽지 않은 알림' })).toHaveTextContent('2건')
    expect(screen.getByRole('link', { name: /내 리소스/ })).toHaveTextContent(/LLM API 키/)
    expect(
      screen
        .getAllByRole('link', { name: '리소스 신청' })
        .some((link) => link.getAttribute('href') === '/console/requests/new'),
    ).toBe(true)
  })

  test('내 리소스 카드가 종류를 가리지 않고 목록과 상세 링크를 보여준다', async () => {
    renderDashboard()

    await screen.findByRole('heading', { name: '대시보드' })
    // 인벤토리는 종류를 섞어 최신순으로 내려오고, 카드는 그 순서를 그대로 그린다.
    expect(await screen.findByRole('link', { name: 'algo-hint-writer' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'demo-web' })).toBeInTheDocument()
    // 바로가기는 종류가 정한다 — 실행 중 VM은 웹 터미널을 달고, 키는 달지 않는다.
    expect(screen.getAllByRole('button', { name: '웹 터미널' }).length).toBeGreaterThanOrEqual(1)
    // "모두 보기"는 리소스·진행 중 신청 카드에 각각 있다 — 리소스 목록 링크만 확인.
    expect(
      screen
        .getAllByRole('link', { name: '모두 보기 →' })
        .some((el) => el.getAttribute('href') === '/console/resources'),
    ).toBe(true)
  })

  test('공지사항 카드가 상위 공지와 게시판 링크를 보여준다', async () => {
    renderDashboard()

    await screen.findByRole('heading', { name: '대시보드' })
    expect(await screen.findByRole('heading', { name: '공지사항' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /데이터센터 정기 점검 안내/ }),
    ).toHaveAttribute('href', `/console/notices/${uuid(201)}`)
    expect(
      screen
        .getAllByRole('link', { name: '모두 보기 →' })
        .some((el) => el.getAttribute('href') === '/console/notices'),
    ).toBe(true)
  })

  test('공지가 없으면 카드째 나오지 않는다', async () => {
    // 카드가 없다는 단언은 답이 도착한 뒤라야 뜻이 있다 — 도착 전에 재면 빈 상태를
    // 숨기는 조건을 지워도 통과하는, 물지 않는 테스트가 된다.
    let answered = false
    server.use(
      http.get('*/api/v1/notices', ({ request }) => {
        const size = new URL(request.url).searchParams.get('size')
        const empty = { content: [], page: 0, size: Number(size ?? 20), totalElements: 0, totalPages: 1 }
        if (size === '3') answered = true
        return HttpResponse.json(empty, { status: 200 })
      }),
    )
    renderDashboard()

    await waitFor(() => expect(answered).toBe(true))
    expect(screen.queryByRole('heading', { name: '공지사항' })).not.toBeInTheDocument()
  })

  test('최근 알림 카드가 알림 제목을 보여준다', async () => {
    renderDashboard()

    await screen.findByRole('heading', { name: '대시보드' })
    expect(await screen.findByRole('heading', { name: '최근 알림' })).toBeInTheDocument()
    expect(await screen.findByText('VM 생성 완료')).toBeInTheDocument()
  })
})
