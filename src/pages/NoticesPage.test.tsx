import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { describe, expect, test } from 'vitest'
import { orgAdminUser, problemResponse, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { makeNotice, seedNotices } from '../test/msw/handlers/notices'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

describe('공지사항 공개 목록', () => {
  test('익명 방문자에게는 게시 중인 전역 공개 공지만 보인다', async () => {
    renderApp('/notices')

    expect(await screen.findByRole('link', { name: /데이터센터 정기 점검 안내/ })).toBeInTheDocument()
    // 로그인 사용자 대상·기관 공지·게시 종료분은 서버가 걸러 준다.
    expect(screen.queryByText('콘솔 기능 업데이트')).not.toBeInTheDocument()
    expect(screen.queryByText('기관 전용 안내')).not.toBeInTheDocument()
    expect(screen.queryByText('지난 점검 공지')).not.toBeInTheDocument()
  })

  test('로그인한 기관 사용자에게는 자기 기관 공지까지 보인다', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/notices')

    expect(await screen.findByRole('link', { name: /기관 전용 안내/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /콘솔 기능 업데이트/ })).toBeInTheDocument()
  })

  test('공지가 없으면 빈 상태를 안내한다', async () => {
    seedNotices([])
    renderApp('/notices')

    expect(await screen.findByText('등록된 공지사항이 없습니다.')).toBeInTheDocument()
  })

  test('고정 공지가 먼저 온다', async () => {
    seedNotices([
      makeNotice({ id: uuid(301), title: '최신 일반 공지', startsAt: '2026-08-20T09:00:00+09:00' }),
      makeNotice({
        id: uuid(302),
        title: '고정 공지',
        pinned: true,
        startsAt: '2026-08-01T09:00:00+09:00',
      }),
    ])
    renderApp('/notices')

    await screen.findByRole('link', { name: /고정 공지/ })
    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('고정 공지')
    expect(rows[1]).toHaveTextContent('최신 일반 공지')
  })
})

describe('공지사항 상세', () => {
  test('본문과 첨부 이미지를 보여주고 목록으로 돌아갈 수 있다', async () => {
    const user = userEvent.setup()
    renderApp('/notices')

    await user.click(await screen.findByRole('link', { name: /데이터센터 정기 점검 안내/ }))

    expect(
      await screen.findByRole('heading', { name: '데이터센터 정기 점검 안내' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/작업 중에는 콘솔 접속이 제한됩니다/)).toBeInTheDocument()
    const image = screen.getByRole('img', { name: 'maintenance.png' })
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).toHaveAttribute(
      'src',
      expect.stringContaining(`/notices/${uuid(201)}/images/${uuid(211)}`),
    )
  })

  test('없는 공지는 오류를 알린다', async () => {
    server.use(
      http.get('*/api/v1/notices/:noticeId', () =>
        problemResponse({
          type: 'about:blank',
          title: '리소스를 찾을 수 없습니다',
          status: 404,
          detail: '해당 공지가 존재하지 않습니다.',
          code: 'RESOURCE_NOT_FOUND',
        }),
      ),
    )
    renderApp(`/notices/${uuid(999)}`)

    expect(await screen.findByText('해당 공지가 존재하지 않습니다.')).toBeInTheDocument()
  })
})
