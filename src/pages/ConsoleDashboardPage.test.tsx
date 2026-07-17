import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderDashboard() {
  server.use(refreshSuccessHandler('access-student'))
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
