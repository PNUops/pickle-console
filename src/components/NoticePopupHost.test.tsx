import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, test } from 'vitest'
import { refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { makeNotice, seedNotices } from '../test/msw/handlers/notices'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import {
  NOTICE_POPUP_DISMISSED_KEY,
  NOTICE_POPUP_SEEN_KEY,
} from '../lib/storage-keys'

/** 줄을 세울 팝업 넷 — 기대 순서는 고정 먼저, 그 안에서 게시 시작 최신순. */
function seedPopupQueue() {
  seedNotices([
    makeNotice({
      id: uuid(311),
      title: '최신 팝업',
      popup: true,
      startsAt: '2026-08-20T09:00:00+09:00',
    }),
    makeNotice({
      id: uuid(312),
      title: '고정 팝업',
      popup: true,
      pinned: true,
      startsAt: '2026-08-01T09:00:00+09:00',
    }),
    makeNotice({
      id: uuid(313),
      title: '중간 팝업',
      popup: true,
      startsAt: '2026-08-10T09:00:00+09:00',
    }),
    makeNotice({
      id: uuid(314),
      title: '넷째 팝업',
      popup: true,
      startsAt: '2026-08-05T09:00:00+09:00',
    }),
  ])
}

function seedSinglePopup(updatedAt: string) {
  seedNotices([
    makeNotice({
      id: uuid(320),
      title: '점검 팝업',
      body: '점검 안내 본문',
      popup: true,
      updatedAt,
    }),
  ])
}

describe('팝업 공지', () => {
  // 다시 보지 않기 기록은 localStorage에 남아 세션을 넘어간다 — 테스트 간에도
  // 넘어가므로 여기서 직접 지운다(setup.ts는 sessionStorage만 비운다).
  beforeEach(() => {
    localStorage.removeItem(NOTICE_POPUP_DISMISSED_KEY)
  })

  test('고정 먼저 최신순으로 하나씩 띄우고, 한 세션에 세 개까지만 보여준다', async () => {
    const user = userEvent.setup()
    seedPopupQueue()
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console')

    await screen.findByRole('dialog', { name: '고정 팝업' })
    await user.click(screen.getByRole('button', { name: '확인' }))

    await screen.findByRole('dialog', { name: '최신 팝업' })
    await user.click(screen.getByRole('button', { name: '확인' }))

    await screen.findByRole('dialog', { name: '중간 팝업' })
    await user.click(screen.getByRole('button', { name: '확인' }))

    // 넷째는 상한에 걸려 이 세션에서는 뜨지 않는다.
    expect(screen.queryByRole('dialog', { name: '넷째 팝업' })).not.toBeInTheDocument()
  })

  test('그냥 닫으면 이번 세션에만 기록한다', async () => {
    const user = userEvent.setup()
    seedSinglePopup('2026-08-01T09:00:00+09:00')
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console')

    await screen.findByRole('dialog', { name: '점검 팝업' })
    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(screen.queryByRole('dialog', { name: '점검 팝업' })).not.toBeInTheDocument()
    expect(JSON.parse(sessionStorage.getItem(NOTICE_POPUP_SEEN_KEY)!)).toEqual({
      [uuid(320)]: '2026-08-01T09:00:00+09:00',
    })
    expect(localStorage.getItem(NOTICE_POPUP_DISMISSED_KEY)).toBeNull()
  })

  test('다시 보지 않기는 브라우저에 남고, 공지를 고치면 다시 뜬다', async () => {
    const user = userEvent.setup()
    seedSinglePopup('2026-08-01T09:00:00+09:00')
    server.use(refreshSuccessHandler('access-user'))
    const first = renderApp('/console')

    await screen.findByRole('dialog', { name: '점검 팝업' })
    await user.click(screen.getByRole('button', { name: '다시 보지 않기' }))
    expect(JSON.parse(localStorage.getItem(NOTICE_POPUP_DISMISSED_KEY)!)).toEqual({
      [uuid(320)]: '2026-08-01T09:00:00+09:00',
    })
    first.unmount()

    // 같은 판이면 조용하다.
    const second = renderApp('/console')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('dialog', { name: '점검 팝업' })).not.toBeInTheDocument()
    second.unmount()

    // 본문을 고치면 updatedAt이 달라지고, 억제가 풀린다.
    seedSinglePopup('2026-08-25T09:00:00+09:00')
    renderApp('/console')
    expect(await screen.findByRole('dialog', { name: '점검 팝업' })).toBeInTheDocument()
  })

  test('관리자 콘솔에서도 뜬다', async () => {
    seedSinglePopup('2026-08-01T09:00:00+09:00')
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin')

    expect(await screen.findByRole('dialog', { name: '점검 팝업' })).toBeInTheDocument()
  })

  test('본문의 태그는 마크업이 아니라 글자로 나온다', async () => {
    // 서버는 본문을 손대지 않고 저장한다(그쪽이 맞다). 그래서 이 화면이 본문을
    // 마크업으로 그리는 순간 기관 관리자가 자기 기관 사람들에게 저장형 XSS를
    // 심을 수 있고, 팝업은 인증 셸에 달려 모든 세션에서 열린다. 지금 안전한 것은
    // 본문이 JSX 텍스트 자식이라 React가 이스케이프하기 때문이고, 줄바꿈은
    // whitespace-pre-line이 CSS로 살린다 — \n을 <br>로 바꾸지 않는다.
    // 이 테스트는 누군가 마크다운 렌더러를 끼울 때 울리라고 있다.
    seedNotices([
      makeNotice({
        id: uuid(316),
        title: '태그 섞인 공지',
        body: '<img src=x onerror="alert(1)">첫 줄\n<b>둘째 줄</b>',
        popup: true,
      }),
    ])
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console')

    const dialog = await screen.findByRole('dialog', { name: '태그 섞인 공지' })
    expect(dialog).toHaveTextContent('<img src=x onerror="alert(1)">첫 줄')
    expect(dialog).toHaveTextContent('<b>둘째 줄</b>')
    // 태그로 해석됐다면 이 요소들이 생긴다.
    expect(dialog.querySelector('img')).toBeNull()
    expect(dialog.querySelector('b')).toBeNull()
  })

  test('조회가 실패해도 아무 말 없이 넘어간다', async () => {
    server.use(refreshSuccessHandler('access-user'))
    server.use(http.get('*/api/v1/notices', () => HttpResponse.error()))
    renderApp('/console')

    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText(/공지사항을 불러오지 못했습니다/)).not.toBeInTheDocument()
  })
})
