import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { server } from '../test/msw/server'
import { refreshSuccessHandler, orgAdminUser } from '../test/msw/handlers/auth'
import { renderApp } from '../test/render'

describe('라우트 가드', () => {
  test('비로그인 사용자가 /console에 접근하면 로그인 페이지로 보낸다', async () => {
    renderApp('/console')

    expect(await screen.findByRole('heading', { name: '로그인' })).toBeInTheDocument()
  })

  test('세션이 복원된 학생은 /console 대시보드를 본다', async () => {
    server.use(refreshSuccessHandler('access-student'))
    renderApp('/console')

    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })

  test('학생이 /admin에 접근하면 /console로 돌려보낸다', async () => {
    server.use(refreshSuccessHandler('access-student'))
    renderApp('/admin')

    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })

  test('기관 관리자가 /console에 접근하면 /admin으로 돌려보낸다', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/console')

    expect(
      await screen.findByRole('heading', { name: '관리자 대시보드' }),
    ).toBeInTheDocument()
  })
})
