import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { renderApp, currentPath } from '../test/render'
import { server } from '../test/msw/server'
import { usageAlertFixture } from '../test/usage-alert-fixture'

function gate() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

function listFixture(axis: 'TOKEN' | 'CREDIT' = 'TOKEN') {
  const notification = usageAlertFixture(axis)
  server.use(http.get('*/api/v1/notifications', ({ request }) => HttpResponse.json({
    content: [notification], page: 0, size: Number(new URL(request.url).searchParams.get('size') ?? 20), totalElements: 1, totalPages: 1,
  })))
  return notification
}

function normalPage() {
  server.use(refreshSuccessHandler('access-user'))
  return renderApp('/console/notifications')
}

test('token notification displays the concise server body without adding internal details', async () => {
  const notification = listFixture('TOKEN')
  normalPage()
  const body = await screen.findByText(notification.body, { normalizer: (text) => text })
  expect(body.textContent).toBe(notification.body)
  expect(body.textContent).toBe('공유 실습 키의 일일 토큰 한도를 80% 이상 사용했어요.')
  expect(body).toHaveClass('whitespace-pre-wrap', '[overflow-wrap:anywhere]')
  expect(body).not.toHaveClass('truncate')
  expect(screen.queryByText(/서버 평가 시각|관측 당시 한도|전송과 관측/)).not.toBeInTheDocument()
  expect(Object.keys(notification)).toHaveLength(8)
})

test('credit notification displays the server period without deriving a browser threshold', async () => {
  const notification = listFixture('CREDIT')
  normalPage()
  const body = await screen.findByText(notification.body, { normalizer: (text) => text })
  expect(body.textContent).toBe(notification.body)
  expect(body.textContent).toBe('공유 실습 키의 월간 금액 한도를 모두 사용했어요.')
  expect(screen.queryByText(/관측 잔여|BYOK|서버 평가 시각/)).not.toBeInTheDocument()
})

test('usage notification waits for the current ordinary read before navigating', async () => {
  const notification = listFixture()
  const pending = gate()
  let requested = false
  server.use(http.post('*/api/v1/notifications/:id/read', async () => {
    requested = true
    await pending.promise
    return HttpResponse.json({ type: 'about:blank', title: '찾을 수 없습니다', status: 404,
      code: 'RESOURCE_NOT_FOUND', detail: '현재 알림을 읽을 수 없습니다.' }, { status: 404 })
  }))
  normalPage()
  await userEvent.click(await screen.findByText(notification.title))
  try {
    await waitFor(() => expect(requested).toBe(true))
    expect(currentPath()).toBe('/console/notifications')
  } finally { pending.release() }
  await screen.findByText('현재 알림을 읽을 수 없습니다.')
  expect(currentPath()).toBe('/console/notifications')
})



test('a successful current usage read opens only its ordinary key detail', async () => {
  const notification = listFixture()
  server.use(http.post('*/api/v1/notifications/:id/read', () => HttpResponse.json({ ...notification, readAt: '2026-11-01T17:00:00Z' })))
  normalPage()
  await userEvent.click(await screen.findByText(notification.title))
  await screen.findByRole('heading', { name: 'capstone-chatbot' })
  expect(currentPath()).toBe(notification.linkPath)
})
