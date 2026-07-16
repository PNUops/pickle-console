import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { server } from '../test/msw/server'
import {
  refreshSuccessHandler,
  orgAdminUser,
  studentBUser,
  USER_PASSWORD,
} from '../test/msw/handlers/auth'
import { vmRequestStore } from '../test/msw/handlers/vm-requests'
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

describe('계정 전환 시 캐시 격리', () => {
  test('로그아웃 후 다른 계정으로 로그인하면 이전 계정의 캐시 데이터가 보이지 않는다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-student'))
    renderApp('/console/requests')

    // A(홍길동) 세션: 신청 목록이 캐시에 올라간다.
    expect(
      await screen.findByRole('link', { name: '캡스톤 프로젝트 백엔드 서버 운영' }),
    ).toBeInTheDocument()

    // 로그아웃 → 로그인 화면.
    await user.click(screen.getByRole('button', { name: /홍길동/ }))
    await user.click(screen.getByRole('menuitem', { name: '로그아웃' }))
    await screen.findByRole('heading', { name: '로그인' })

    // 로그아웃 사이 서버 데이터가 바뀐 상황을 재현 (B에게는 신청이 없다).
    vmRequestStore.splice(0, vmRequestStore.length)

    // B(박영희)로 로그인.
    await user.type(screen.getByLabelText('이메일'), studentBUser.email)
    await user.type(screen.getByLabelText('비밀번호'), USER_PASSWORD)
    await user.click(screen.getByRole('button', { name: '로그인' }))
    await screen.findByRole('heading', { name: '대시보드' })

    // 내 신청 목록 진입 직후에도 A의 캐시가 렌더링되지 않아야 한다.
    await user.click(screen.getByRole('link', { name: '내 신청' }))
    await screen.findByRole('heading', { name: '내 신청' })
    expect(
      screen.queryByRole('link', { name: '캡스톤 프로젝트 백엔드 서버 운영' }),
    ).not.toBeInTheDocument()
    expect(await screen.findByText('표시할 신청이 없습니다.')).toBeInTheDocument()
  })
})
