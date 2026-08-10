import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import {
  orgAdminUser,
  refreshSuccessHandler,
  sysAdminUser,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderAsSysAdmin(path = '/admin/orgs') {
  server.use(refreshSuccessHandler('access-sys-admin', sysAdminUser))
  renderApp(path)
}

describe('기관 관리 — 접근 제어', () => {
  test('ORG_ADMIN이 /admin/orgs에 접근하면 관리자 홈으로 돌려보내고 메뉴도 숨긴다', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin/orgs')

    expect(
      await screen.findByRole('heading', { name: '관리자 대시보드' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '기관 관리' })).not.toBeInTheDocument()
  })

  test('SYS_ADMIN은 기관 목록과 기관 관리 메뉴를 본다', async () => {
    renderAsSysAdmin()

    expect(await screen.findByRole('heading', { name: '기관 관리' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '기관 관리' })).toBeInTheDocument()
    expect(
      await screen.findByText('정보컴퓨터공학부 실습지원센터'),
    ).toBeInTheDocument()
    const row = screen.getByText('정보컴퓨터공학부 실습지원센터').closest('tr')!
    expect(within(row).getByText('활성')).toBeInTheDocument()
    // hidden 기관에는 숨김 배지가 붙는다 (관리자 목록은 hidden 포함)
    const hiddenRow = screen.getByText('테스트 기관').closest('tr')!
    expect(within(hiddenRow).getByText('숨김')).toBeInTheDocument()
  })
})

describe('기관 비활성화·숨김 토글', () => {
  test('수정 모달에서 상태와 숨김을 바꾸면 목록 배지가 갱신된다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await screen.findByRole('heading', { name: '기관 관리' })
    const row = (await screen.findByText('정보컴퓨터공학부 실습지원센터')).closest('tr')!
    await user.click(within(row).getByRole('button', { name: '수정' }))

    const dialog = await screen.findByRole('dialog', { name: '기관 수정' })
    // 의미론 안내가 함께 보인다
    expect(
      within(dialog).getByText(/신규 VM 신청 대상에서만 제외/),
    ).toBeInTheDocument()
    await user.selectOptions(within(dialog).getByLabelText('기관 상태'), 'DISABLED')
    await user.click(within(dialog).getByLabelText('일반 사용자에게 숨김'))
    await user.click(within(dialog).getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const updated = screen.getByText('정보컴퓨터공학부 실습지원센터').closest('tr')!
      expect(within(updated).getByText('비활성')).toBeInTheDocument()
      expect(within(updated).getByText('숨김')).toBeInTheDocument()
    })
  })
})

describe('기관 생성/수정', () => {
  test('새 기관을 만들면 목록에 추가된다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await screen.findByRole('heading', { name: '기관 관리' })
    await user.click(screen.getByRole('button', { name: '기관 만들기' }))
    const dialog = await screen.findByRole('dialog', { name: '기관 만들기' })
    await user.type(within(dialog).getByLabelText('기관 이름'), 'AI융합교육원')
    await user.click(within(dialog).getByRole('button', { name: '만들기' }))

    // 목록 테이블에 새 기관이 나타난다. (역할 변경은 사용자 관리 상세로 이동)
    expect(await screen.findAllByText('AI융합교육원')).not.toHaveLength(0)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
