import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  problemResponse,
  refreshSuccessHandler,
  sysAdminUser,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

describe('알림 발송 이력', () => {
  test('SYS_ADMIN은 발송 로그와 실패 사유를 보고, FAILED만 재발송할 수 있다', async () => {
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/notification-log')

    await screen.findByRole('heading', { name: '알림 발송 이력' })
    const failedRow = (await screen.findByText('younghee.park@pusan.ac.kr')).closest('tr')!
    expect(within(failedRow).getByText('발송 실패')).toBeInTheDocument()
    expect(within(failedRow).getByText(/SMTP 연결 실패/)).toBeInTheDocument()
    expect(within(failedRow).getByRole('button', { name: '재발송' })).toBeInTheDocument()
    // SENT 행에는 재발송 버튼이 없다.
    const sentRow = screen.getByText('vm.create.done').closest('tr')!
    expect(within(sentRow).queryByRole('button', { name: '재발송' })).not.toBeInTheDocument()
  })

  test('재발송은 확인 모달을 거쳐 접수되고 상태가 발송 대기로 바뀐다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/notification-log')

    await screen.findByRole('heading', { name: '알림 발송 이력' })
    const failedRow = (await screen.findByText('younghee.park@pusan.ac.kr')).closest('tr')!
    await user.click(within(failedRow).getByRole('button', { name: '재발송' }))

    const dialog = await screen.findByRole('dialog', { name: '알림 재발송' })
    await user.click(within(dialog).getByRole('button', { name: '재발송' }))

    expect(
      await screen.findByText('알림 재발송을 접수했습니다. 잠시 후 발송 상태가 갱신됩니다.'),
    ).toBeInTheDocument()
    const updated = screen.getByText('younghee.park@pusan.ac.kr').closest('tr')!
    expect(within(updated).getByText('발송 대기')).toBeInTheDocument()
  })
})

describe('공지 보내기', () => {
  test('ORG_ADMIN에게는 전체 대상이 없고 자기 기관 워크스페이스만 고를 수 있다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin/announcements')

    await screen.findByRole('heading', { name: '공지 보내기' })
    expect(screen.queryByRole('radio', { name: '전체' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '우리 기관 전체' })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '특정 워크스페이스' }))
    // 자기 기관(org 1) 워크스페이스만 로드된다.
    expect(await screen.findByRole('option', { name: '캡스톤 3조 (4명)' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'AI 동아리 (5명)' })).not.toBeInTheDocument()
  })

  test('발송 한도 초과(429)면 문제 상세를 인라인 경고로 보여준다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    // 계약 v0.5.x: 작성자당 시간당 10건 초과 시 429 (Retry-After)
    server.use(
      http.post('*/api/v1/admin/announcements', () =>
        problemResponse({
          type: 'about:blank',
          title: '요청이 너무 많습니다',
          status: 429,
          detail: '시간당 공지 발송 한도(10건)를 초과했습니다. 잠시 후 다시 시도해 주세요.',
          instance: '/api/v1/admin/announcements',
          code: 'RATE_LIMITED',
        }),
      ),
    )
    renderApp('/admin/announcements')

    await screen.findByRole('heading', { name: '공지 보내기' })
    await user.type(screen.getByLabelText(/제목/), '한도 초과 테스트')
    await user.type(screen.getByLabelText(/내용/), '본문')
    await user.click(screen.getByRole('button', { name: '공지 발송' }))
    const dialog = await screen.findByRole('dialog', { name: '공지 발송 확인' })
    await user.click(within(dialog).getByRole('button', { name: '발송' }))

    expect(
      await screen.findByText(/시간당 공지 발송 한도\(10건\)를 초과했습니다/),
    ).toBeInTheDocument()
  })

  test('SYS_ADMIN 전체 공지는 확인 모달을 거쳐 발송되고 최근 목록에 나타난다', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
    renderApp('/admin/announcements')

    await screen.findByRole('heading', { name: '공지 보내기' })
    await user.type(screen.getByLabelText(/제목/), '8월 서비스 업데이트')
    await user.type(screen.getByLabelText(/내용/), '새 기능이 추가되었습니다.')
    // 기본 대상이 '전체'다.
    expect(screen.getByRole('radio', { name: '전체' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: '공지 발송' }))

    const dialog = await screen.findByRole('dialog', { name: '공지 발송 확인' })
    expect(within(dialog).getByText('전체 사용자')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '발송' }))

    expect(await screen.findByText(/공지를 발송했습니다\. 480명에게/)).toBeInTheDocument()
    // 폼이 초기화되고 최근 공지에 추가된다.
    await waitFor(() =>
      expect(screen.getByText('8월 서비스 업데이트')).toBeInTheDocument(),
    )
    expect(screen.getByLabelText(/제목/)).toHaveValue('')
  })
})
