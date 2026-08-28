import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { refreshSuccessHandler, sysAdminUser } from '../test/msw/handlers/auth'
import { makeNotice, noticeImage, seedNotices } from '../test/msw/handlers/notices'
import { uuid } from '../test/msw/ids'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import {
  NOTICE_POPUP_DISMISSED_KEY,
  NOTICE_POPUP_SEEN_KEY,
} from '../lib/storage-keys'

// jsdom에는 WebGL이 없고 three 청크 로드는 무의미하게 느리다 — 정적 목업으로 대체.
vi.mock('../pages/landing/HeroVisual', () => ({ HeroVisual: () => null }))

/** 조회가 끝나고도 아무것도 뜨지 않는다는 것을 확인하기 위한 짧은 유예. */
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 50))
}

/** 팝업 넷. 목록이 고정 먼저 최신순으로 주므로 화면에는 그 반대로 놓인다. */
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

  test('팝업이 전부 동시에 뜨고, 오래된 것부터 놓인다', async () => {
    seedPopupQueue()
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console')

    await screen.findByRole('dialog', { name: '고정 팝업' })
    // 상한이 없으므로 넷째까지 전부 선다. 목록은 고정 먼저 최신순으로 오는데
    // 호스트가 그것을 뒤집으므로, 고정 아닌 것들이 오래된 순으로 앞에 놓이고
    // 고정 공지가 마지막 자리를 받는다 — 마지막이 곧 맨 위에 포개지는 자리다.
    expect(
      screen.getAllByRole('dialog').map((dialog) => dialog.getAttribute('aria-label')),
    ).toEqual(['넷째 팝업', '중간 팝업', '최신 팝업', '고정 팝업'])
  })

  test('하나를 닫아도 나머지는 그대로 남는다', async () => {
    const user = userEvent.setup()
    seedPopupQueue()
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console')

    const pinned = await screen.findByRole('dialog', { name: '고정 팝업' })
    await user.click(within(pinned).getByRole('button', { name: '확인' }))

    expect(screen.queryByRole('dialog', { name: '고정 팝업' })).not.toBeInTheDocument()
    // 순차 표시로 되돌아가면 여기서 운다 — 그때는 남는 것이 하나뿐이다.
    expect(screen.getAllByRole('dialog')).toHaveLength(3)
  })

  test('줄이 차면 다음 줄로 접고 그 줄을 들여쓴다, 좌표는 화면 안에 머문다', async () => {
    seedPopupQueue()
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console')

    await screen.findByRole('dialog', { name: '고정 팝업' })
    const slots = screen
      .getAllByRole('dialog')
      .map((dialog) => ({
        left: Number.parseInt((dialog as HTMLElement).style.left, 10),
        top: Number.parseInt((dialog as HTMLElement).style.top, 10),
      }))

    // jsdom 기본 폭 1024에서는 한 줄에 셋이 들어간다. 셋은 같은 높이에
    // 가로로 이어 붙고, 넷째는 다음 줄로 접히며 그 줄이 오른쪽으로 들여쓰인다.
    expect(slots.slice(0, 3).map((slot) => slot.top)).toEqual([0, 0, 0])
    expect(slots[0].left).toBeLessThan(slots[1].left)
    expect(slots[1].left).toBeLessThan(slots[2].left)
    expect(slots[3].top).toBeGreaterThan(0)
    // 다음 줄은 첫 줄보다 들여쓰인다. 이게 빠지면 그냥 격자다.
    expect(slots[3].left).toBeGreaterThan(slots[0].left)

    // clamp 가 빠지면 넷째가 오른쪽 밖으로 나가 아무도 못 본다.
    const maxLeft = window.innerWidth - 320 - 16
    for (const slot of slots) expect(slot.left).toBeLessThanOrEqual(maxLeft)
  })

  test('모달이 아니다 — 뒤를 덮지도 잠그지도 않는다', async () => {
    seedPopupQueue()
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console')

    const pinned = await screen.findByRole('dialog', { name: '고정 팝업' })

    // jsdom 에는 레이아웃이 없어 「뒤 버튼이 실제로 눌리는가」는 잴 수 없다 —
    // 오버레이가 있어도 클릭은 통과한다. 그래서 차단을 만드는 것들이 없다는
    // 것을 직접 잰다. 셋 중 하나라도 되살아나면 뒤가 다시 막힌다.
    expect(document.querySelector('[aria-modal="true"]')).toBeNull()
    expect(document.body.style.overflow).not.toBe('hidden')
    expect(pinned.parentElement).toHaveClass('pointer-events-none')
    expect(pinned).toHaveClass('pointer-events-auto')
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

  test('익명 방문자에게도 랜딩에서 뜨고, 공개 이미지는 주소 그대로 받는다', async () => {
    // 장애 공지가 가장 필요한 사람은 아직 로그인하지 못한 사람이다. 세션이 없으면
    // 이미지는 맨 <img src>로 남는다 — 익명이 보는 것은 공개 공지뿐이라 자격이
    // 필요 없고, 그 편이 브라우저의 평범한 캐시를 그대로 쓴다.
    seedNotices([
      makeNotice({
        id: uuid(321),
        title: '전면 점검 안내',
        popup: true,
        images: [noticeImage(uuid(321), 322, 'outage.png')],
      }),
    ])
    // 랜딩 청크는 lazy — 병렬 워커가 CPU를 나눠 쓰는 동안 기본 대기로는 모자란다.
    renderApp('/')

    expect(
      await screen.findByRole('dialog', { name: '전면 점검 안내' }, { timeout: 15_000 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'outage.png' })).toHaveAttribute(
      'src',
      `/api/v1/notices/${uuid(321)}/images/${uuid(322)}`,
    )
  })

  test('로그인 화면에서도 익명 방문자에게 뜬다', async () => {
    seedNotices([makeNotice({ id: uuid(323), title: '로그인 불가 안내', popup: true })])
    renderApp('/login')

    expect(await screen.findByRole('dialog', { name: '로그인 불가 안내' })).toBeInTheDocument()
  })

  test('회원가입 화면에도 뜬다', async () => {
    seedNotices([makeNotice({ id: uuid(325), title: '가입 중단 안내', popup: true })])
    renderApp('/signup')

    expect(await screen.findByRole('dialog', { name: '가입 중단 안내' })).toBeInTheDocument()
  })

  test('통과만 하는 인증 화면에서는 끼어들지 않는다', async () => {
    // 비밀번호 재설정·구글 콜백 같은 화면은 머무는 자리가 아니라 지나는 자리다.
    // 모달은 포커스를 가두고 body 스크롤을 잠그므로 진행 중인 흐름을 막는다.
    //
    // 「모달이 없다」만 재면 응답이 늦어도 통과하는, 물지 않는 단언이 된다 —
    // 호스트가 아예 안 달렸으면 조회 자체가 나가지 않으므로 그것을 함께 잰다.
    let asked = false
    server.use(
      http.get('*/api/v1/notices', () => {
        asked = true
        return HttpResponse.json(
          { content: [], page: 0, size: 20, totalElements: 0, totalPages: 1 },
          { status: 200 },
        )
      }),
    )
    renderApp('/reset-password?token=reset-token')

    await screen.findByRole('heading', { name: '새 비밀번호 설정' })
    await settle()
    expect(asked).toBe(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('이미 로그인한 사람이 랜딩을 열면 익명으로 묻지 않는다', async () => {
    // 랜딩과 인증 화면은 인증 셸 밖이라 세션 복원이 끝나기 전에 마운트된다. 복원은
    // 로그인과 달리 캐시를 비우지 않으므로, 여기서 익명으로 물으면 그 답이 콘솔의
    // 팝업까지 staleTime 동안 물들인다.
    //
    // 「무엇이 보이나」가 아니라 「자격을 싣고 물었나」를 잰다. 보이는 것으로 재려면
    // 로그인해야만 보이는 공지가 있어야 하는데, 그 조합은 노출 축이 달라지면
    // 사라진다. 나가는 요청의 헤더는 그 축과 무관하게 같은 것을 고정한다.
    //
    // 게시판·대시보드로는 이 핀을 대신할 수 없다 — RequireRole이 복원 중에는
    // 스피너를 그려 그 화면들이 아예 마운트되지 않으므로, 함정이 닿지 않는다.
    const authorizations: (string | null)[] = []
    server.use(
      http.get('*/api/v1/notices', ({ request }) => {
        authorizations.push(request.headers.get('Authorization'))
        return HttpResponse.json(
          { content: [], page: 0, size: 20, totalElements: 0, totalPages: 1 },
          { status: 200 },
        )
      }),
    )
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/')

    await screen.findByRole('heading', { name: /서비스가 시작되는 곳/ }, { timeout: 15_000 })
    await waitFor(() => expect(authorizations.length).toBeGreaterThan(0))
    expect(authorizations.every((header) => header?.startsWith('Bearer '))).toBe(true)
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
