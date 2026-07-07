import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { userPatchBodies } from '../test/msw/handlers/admin'
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
    expect(screen.getAllByText('SW교육센터').length).toBeGreaterThan(0)
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

    // 목록 테이블과 관리 기관 선택지 양쪽에 새 기관이 나타난다.
    expect(await screen.findAllByText('AI융합교육원')).not.toHaveLength(0)
    expect(screen.getByText('ai-edu')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('사용자 역할 관리', () => {
  test('기관 관리자 역할인데 기관을 고르지 않으면 제출하지 않고 오류를 보여준다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await screen.findByRole('heading', { name: '기관 관리' })
    await user.type(screen.getByLabelText('사용자 ID'), '57')
    await user.selectOptions(screen.getByLabelText('역할'), 'ORG_ADMIN')
    await user.click(screen.getByRole('button', { name: '역할 변경' }))

    expect(
      screen.getByText('기관 관리자는 관리할 기관을 선택해야 합니다.'),
    ).toBeInTheDocument()
    expect(userPatchBodies).toHaveLength(0)
  })

  test('기관을 지정해 역할을 변경하면 성공 안내를 보여준다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await screen.findByRole('heading', { name: '기관 관리' })
    await user.type(screen.getByLabelText('사용자 ID'), '57')
    await user.selectOptions(screen.getByLabelText('역할'), 'ORG_ADMIN')
    await user.selectOptions(screen.getByLabelText('관리 기관'), '1')
    await user.click(screen.getByRole('button', { name: '역할 변경' }))

    expect(
      await screen.findByText(/김철수.*기관 관리자.*변경했습니다/),
    ).toBeInTheDocument()
    expect(userPatchBodies).toEqual([
      { userId: 57, body: { role: 'ORG_ADMIN', orgId: 1 } },
    ])
  })

  test('없는 사용자면 404 안내를 보여준다', async () => {
    const user = userEvent.setup()
    renderAsSysAdmin()

    await screen.findByRole('heading', { name: '기관 관리' })
    await user.type(screen.getByLabelText('사용자 ID'), '9999')
    await user.click(screen.getByRole('button', { name: '역할 변경' }))

    expect(
      await screen.findByText('해당 ID의 사용자가 존재하지 않습니다.'),
    ).toBeInTheDocument()
  })
})
