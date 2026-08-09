import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderWorkspaces() {
  server.use(refreshSuccessHandler('access-user'))
  renderApp('/console/workspaces')
}

async function openCreateModal() {
  const user = userEvent.setup()
  await screen.findByRole('heading', { name: '내 워크스페이스' })
  await user.click(screen.getByRole('button', { name: '새 워크스페이스 만들기' }))
  return { user, dialog: screen.getByRole('dialog', { name: '새 워크스페이스 만들기' }) }
}

describe('내 워크스페이스 목록', () => {
  test('워크스페이스 종류·역할 배지와 함께 내 워크스페이스를 나열한다', async () => {
    renderWorkspaces()

    const row = (await screen.findByRole('link', { name: '캡스톤 3조' })).closest('tr')!
    expect(within(row).getByText('프로젝트')).toBeInTheDocument()
    expect(within(row).getByText('소유자')).toBeInTheDocument()
    expect(within(row).getByText('4명')).toBeInTheDocument()

    const personalRow = screen.getByRole('link', { name: '홍길동' }).closest('tr')!
    expect(within(personalRow).getByText('개인')).toBeInTheDocument()

    const teamRow = screen.getByRole('link', { name: '알고리즘 스터디' }).closest('tr')!
    expect(within(teamRow).getByText('팀')).toBeInTheDocument()
    expect(within(teamRow).getByText('구성원')).toBeInTheDocument()
  })
})

describe('워크스페이스 생성', () => {
  test('이름을 비우면 한국어 오류를 보여준다', async () => {
    renderWorkspaces()
    const { user, dialog } = await openCreateModal()

    await user.click(within(dialog).getByRole('button', { name: '만들기' }))

    expect(
      within(dialog).getByText('워크스페이스 이름을 입력해 주세요.'),
    ).toBeInTheDocument()
  })

  test('같은 이름을 다시 써도 만들 수 있다 (이름은 키가 아니다)', async () => {
    renderWorkspaces()
    const { user, dialog } = await openCreateModal()

    await user.type(within(dialog).getByLabelText('워크스페이스 이름'), '캡스톤 3조')
    await user.click(within(dialog).getByRole('button', { name: '만들기' }))

    expect(
      await screen.findByRole('heading', { name: '캡스톤 3조' }),
    ).toBeInTheDocument()
  })

  test('생성에 성공하면 새 워크스페이스 상세 페이지로 이동한다', async () => {
    renderWorkspaces()
    const { user, dialog } = await openCreateModal()

    await user.selectOptions(within(dialog).getByLabelText('종류'), 'PROJECT')
    await user.type(within(dialog).getByLabelText('워크스페이스 이름'), '졸업과제 7조')
    await user.type(within(dialog).getByLabelText('설명'), '2026-2 졸업과제 7조')
    await user.click(within(dialog).getByRole('button', { name: '만들기' }))

    expect(
      await screen.findByRole('heading', { name: '졸업과제 7조' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/2026-2 졸업과제 7조/)).toBeInTheDocument()
  })
})
