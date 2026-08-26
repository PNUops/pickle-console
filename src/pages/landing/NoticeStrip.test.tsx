import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { makeNotice, seedNotices } from '../../test/msw/handlers/notices'
import { uuid } from '../../test/msw/ids'
import { server } from '../../test/msw/server'
import { NoticeStrip } from './NoticeStrip'

/** 랜딩 전체(three.js 포함)를 끌어오지 않고 이 한 줄만 그린다. */
function renderStrip() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <NoticeStrip />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

/** 조회가 끝나고도 아무것도 그리지 않는다는 것을 확인하기 위한 짧은 유예. */
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 50))
}

describe('랜딩·로그인 공지 한 줄', () => {
  test('고정된 공개 공지의 제목과 자세히 보기 링크를 세운다', async () => {
    seedNotices([makeNotice({ id: uuid(331), title: '전면 점검 안내', pinned: true })])
    renderStrip()

    expect(await screen.findByText('전면 점검 안내')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '자세히 보기' })).toHaveAttribute(
      'href',
      `/notices/${uuid(331)}`,
    )
  })

  test('고정도 팝업도 아닌 공지는 건너뛴다', async () => {
    seedNotices([
      makeNotice({ id: uuid(332), title: '평범한 새 공지', startsAt: '2026-08-20T09:00:00+09:00' }),
      makeNotice({
        id: uuid(333),
        title: '팝업 공지',
        popup: true,
        startsAt: '2026-08-01T09:00:00+09:00',
      }),
    ])
    renderStrip()

    expect(await screen.findByText('팝업 공지')).toBeInTheDocument()
    expect(screen.queryByText('평범한 새 공지')).not.toBeInTheDocument()
  })

  test('닫으면 사라지고 이번 세션 동안 다시 나타나지 않는다', async () => {
    const user = userEvent.setup()
    seedNotices([makeNotice({ id: uuid(334), title: '장애 안내', popup: true })])
    const first = renderStrip()

    await screen.findByText('장애 안내')
    await user.click(screen.getByRole('button', { name: '공지 닫기' }))
    expect(screen.queryByText('장애 안내')).not.toBeInTheDocument()
    first.unmount()

    const second = renderStrip()
    await settle()
    expect(second.container).toBeEmptyDOMElement()
  })

  test('조회가 실패해도 첫 화면을 막지 않는다', async () => {
    server.use(http.get('*/api/v1/notices', () => HttpResponse.error()))
    const { container } = renderStrip()

    await settle()
    expect(container).toBeEmptyDOMElement()
  })
})
