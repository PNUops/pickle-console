import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderDashboard() {
  server.use(refreshSuccessHandler('access-user'))
  renderApp('/console')
}

describe('콘솔 대시보드 — SSH 키 유도 배너', () => {
  test('VM이 있고 SSH 키가 없으면 등록 배너를 보여준다', async () => {
    server.use(http.get('*/api/v1/me/ssh-keys', () => HttpResponse.json([])))
    renderDashboard()

    await screen.findByRole('heading', { name: '대시보드' })
    expect(await screen.findByText('SSH 키를 등록해 주세요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /SSH 키 등록하기/ })).toBeInTheDocument()
  })

  test('배너는 닫을 수 있다', async () => {
    const user = userEvent.setup()
    server.use(http.get('*/api/v1/me/ssh-keys', () => HttpResponse.json([])))
    renderDashboard()

    await screen.findByText('SSH 키를 등록해 주세요')
    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(screen.queryByText('SSH 키를 등록해 주세요')).not.toBeInTheDocument()
  })

  test('SSH 키가 이미 있으면 배너를 노출하지 않는다', async () => {
    renderDashboard()

    await screen.findByRole('heading', { name: '대시보드' })
    // 기본 픽스처에는 키가 2개 있으므로 배너가 없다.
    expect(screen.queryByText('SSH 키를 등록해 주세요')).not.toBeInTheDocument()
  })
})

describe('콘솔 대시보드 — 합성 지표·목록', () => {
  test('지표 타일이 VM·신청·알림 수를 보여준다', async () => {
    renderDashboard()

    await screen.findByRole('heading', { name: '대시보드' })
    // "내 VM"은 사이드바 링크와 이름이 겹치므로 타일(값 "n대" 포함)으로 식별한다.
    // findAll은 사이드바 링크만으로도 조기 해결되므로 waitFor로 타일 등장을 기다린다.
    await waitFor(() => {
      expect(
        screen
          .getAllByRole('link', { name: '내 VM' })
          .some((el) => /대/.test(el.textContent ?? '')),
      ).toBe(true)
    })
    expect(screen.getByRole('link', { name: '대기 중 신청' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '읽지 않은 알림' })).toHaveTextContent('2건')
  })

  test('내 VM 카드가 목록과 상세 링크를 보여준다', async () => {
    renderDashboard()

    await screen.findByRole('heading', { name: '대시보드' })
    // 실행 중 VM은 웹 터미널 바로가기가 함께 보인다.
    expect(await screen.findByRole('link', { name: 'algo-judge' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '웹 터미널' }).length).toBeGreaterThanOrEqual(1)
    // "모두 보기"는 내 VM·진행 중 신청 카드에 각각 있다 — VM 목록 링크만 확인.
    expect(
      screen
        .getAllByRole('link', { name: '모두 보기 →' })
        .some((el) => el.getAttribute('href') === '/console/vms'),
    ).toBe(true)
  })

  test('최근 알림 카드가 알림 제목을 보여준다', async () => {
    renderDashboard()

    await screen.findByRole('heading', { name: '대시보드' })
    expect(await screen.findByRole('heading', { name: '최근 알림' })).toBeInTheDocument()
    expect(await screen.findByText('VM 생성 완료')).toBeInTheDocument()
  })
})
