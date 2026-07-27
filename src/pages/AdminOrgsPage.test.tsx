import { screen, within } from '@testing-library/react'
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
    expect(await screen.findByText('cse-lab')).toBeInTheDocument()
    expect(screen.getAllByText('테스트 기관').length).toBeGreaterThan(0)
    // 계약 v0.3.x: OrgSummary.status를 상태 배지로 표시한다.
    const row = screen.getByText('cse-lab').closest('tr')!
    expect(within(row).getByText('활성')).toBeInTheDocument()
  })
})

describe('기관 생성/수정', () => {
  test('중복 slug로 만들면 slug 필드 오류를 보여준다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await screen.findByRole('heading', { name: '기관 관리' })
    await user.click(screen.getByRole('button', { name: '기관 만들기' }))
    const dialog = await screen.findByRole('dialog', { name: '기관 만들기' })
    await user.type(within(dialog).getByLabelText('기관 이름'), '중복 테스트 기관')
    await user.type(within(dialog).getByLabelText('slug'), 'cse-lab')
    await user.click(within(dialog).getByRole('button', { name: '만들기' }))

    expect(
      await within(dialog).findByText("'cse-lab'은(는) 이미 다른 기관이 사용 중입니다."),
    ).toBeInTheDocument()
  })

  test('새 기관을 만들면 목록에 추가된다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await screen.findByRole('heading', { name: '기관 관리' })
    await user.click(screen.getByRole('button', { name: '기관 만들기' }))
    const dialog = await screen.findByRole('dialog', { name: '기관 만들기' })
    await user.type(within(dialog).getByLabelText('기관 이름'), 'AI융합교육원')
    await user.type(within(dialog).getByLabelText('slug'), 'ai-edu')
    await user.click(within(dialog).getByRole('button', { name: '만들기' }))

    // 목록 테이블에 새 기관이 나타난다. (역할 변경은 사용자 관리 상세로 이동)
    expect(await screen.findAllByText('AI융합교육원')).not.toHaveLength(0)
    expect(screen.getByText('ai-edu')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
