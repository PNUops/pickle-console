import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { describe, expect, test } from 'vitest'
import { HttpResponse } from 'msw'
import { problemResponse, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { makeNotice, noticeImage, seedNotices } from '../test/msw/handlers/notices'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { currentPath, renderApp } from '../test/render'

describe('공지사항 게시판', () => {
  test('로그인하지 않으면 로그인 화면으로 보낸다', async () => {
    // 게시판은 콘솔 안에 있다 — 익명 방문자가 공지를 만나는 자리는 랜딩·로그인
    // 화면의 팝업이지 이 목록이 아니다.
    renderApp('/console/notices')

    await screen.findByRole('heading', { name: '로그인' })
    expect(currentPath()).toBe('/login')
  })

  test('게시 중인 공지를 목록에 세운다', async () => {
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/notices')

    expect(
      await screen.findByRole('link', { name: /데이터센터 정기 점검 안내/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /콘솔 기능 업데이트/ })).toBeInTheDocument()
    // 게시 기간이 끝난 것은 서버가 걸러 준다.
    expect(screen.queryByText('지난 점검 공지')).not.toBeInTheDocument()
  })

  test('공지가 없으면 빈 상태를 안내한다', async () => {
    seedNotices([])
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/notices')

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
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/notices')

    const pinned = await screen.findByRole('link', { name: /고정 공지/ })
    // 콘솔 셸의 내비게이션도 목록이므로 공지 목록을 그 링크에서 거슬러 잡는다.
    const rows = within(pinned.closest('ul')!).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('고정 공지')
    expect(rows[1]).toHaveTextContent('최신 일반 공지')
  })
})

describe('공지사항 상세', () => {
  test('본문과 첨부 이미지를 보여주고 목록으로 돌아갈 수 있다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/notices')

    await user.click(await screen.findByRole('link', { name: /데이터센터 정기 점검 안내/ }))

    expect(
      await screen.findByRole('heading', { name: '데이터센터 정기 점검 안내' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/작업 중에는 콘솔 접속이 제한됩니다/)).toBeInTheDocument()
    const image = screen.getByRole('img', { name: 'maintenance.png' })
    expect(image).toHaveAttribute('loading', 'lazy')

    await user.click(screen.getByRole('link', { name: '← 공지사항 목록' }))
    expect(currentPath()).toBe('/console/notices')
  })

  test('로그인해야 보이는 공지의 이미지는 자격을 실어 받아 온다', async () => {
    // 이 API는 순수 Bearer다 — <img src>는 헤더를 싣지 않으므로 서버는 익명으로
    // 읽고 404를 준다. blob: 주소가 나온다는 것은 인증된 경로로 받아 왔다는 뜻이고,
    // 맨 <img src>로 되돌아가면 이 단언이 깨진다.
    seedNotices([
      makeNotice({
        id: uuid(341),
        title: '로그인 사용자 공지',
        images: [noticeImage(uuid(341), 342, 'members-only.png')],
      }),
    ])
    server.use(refreshSuccessHandler('access-user'))
    renderApp(`/console/notices/${uuid(341)}`)

    const image = await screen.findByRole('img', { name: 'members-only.png' })
    expect(image.getAttribute('src')).toMatch(/^blob:/)
  })

  test('이미지를 받지 못해도 본문은 그대로 남는다', async () => {
    seedNotices([
      makeNotice({
        id: uuid(343),
        title: '이미지가 깨진 공지',
        body: '본문은 읽을 수 있어야 한다.',
        images: [noticeImage(uuid(343), 344, 'gone.png')],
      }),
    ])
    server.use(refreshSuccessHandler('access-user'))
    server.use(
      http.get('*/api/v1/notices/:noticeId/images/:imageId', () =>
        HttpResponse.json(null, { status: 404 }),
      ),
    )
    renderApp(`/console/notices/${uuid(343)}`)

    expect(await screen.findByText('이미지를 불러오지 못했습니다.')).toBeInTheDocument()
    expect(screen.getByText('본문은 읽을 수 있어야 한다.')).toBeInTheDocument()
  })

  test('없는 공지는 오류를 알린다', async () => {
    server.use(refreshSuccessHandler('access-user'))
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
    renderApp(`/console/notices/${uuid(999)}`)

    expect(await screen.findByText('해당 공지가 존재하지 않습니다.')).toBeInTheDocument()
  })
})
