import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderGroups() {
  server.use(refreshSuccessHandler('access-student'))
  renderApp('/console/groups')
}

async function openCreateModal() {
  const user = userEvent.setup()
  await screen.findByRole('heading', { name: '내 그룹' })
  await user.click(screen.getByRole('button', { name: '새 그룹 만들기' }))
  return { user, dialog: screen.getByRole('dialog', { name: '새 그룹 만들기' }) }
}

describe('내 그룹 목록', () => {
  test('그룹 종류·역할 배지와 함께 내 그룹을 나열한다', async () => {
    renderGroups()

    const row = (await screen.findByRole('link', { name: '캡스톤 3조' })).closest('tr')!
    expect(within(row).getByText('프로젝트')).toBeInTheDocument()
    expect(within(row).getByText('소유자')).toBeInTheDocument()
    expect(within(row).getByText('4명')).toBeInTheDocument()

    const personalRow = screen.getByRole('link', { name: '홍길동' }).closest('tr')!
    expect(within(personalRow).getByText('개인')).toBeInTheDocument()

    const teamRow = screen.getByRole('link', { name: '알고리즘 스터디' }).closest('tr')!
    expect(within(teamRow).getByText('팀')).toBeInTheDocument()
    expect(within(teamRow).getByText('참여자')).toBeInTheDocument()
  })
})

describe('그룹 생성', () => {
  test('slug 형식이 잘못되면 한국어 오류를 보여준다', async () => {
    renderGroups()
    const { user, dialog } = await openCreateModal()

    await user.type(within(dialog).getByLabelText('그룹 이름'), '새 팀')
    await user.type(within(dialog).getByLabelText('slug'), 'Bad Slug!')
    await user.click(within(dialog).getByRole('button', { name: '만들기' }))

    expect(
      within(dialog).getByText(/slug는 소문자·숫자·하이픈만 사용해/),
    ).toBeInTheDocument()
  })

  test('slug가 중복되면 서버의 GROUP_SLUG_DUPLICATE 메시지를 slug 필드에 보여준다', async () => {
    renderGroups()
    const { user, dialog } = await openCreateModal()

    await user.type(within(dialog).getByLabelText('그룹 이름'), '중복 팀')
    await user.type(within(dialog).getByLabelText('slug'), 'capstone-team3')
    await user.click(within(dialog).getByRole('button', { name: '만들기' }))

    expect(
      await within(dialog).findByText(
        "'capstone-team3'은(는) 이미 다른 그룹이 사용 중입니다.",
      ),
    ).toBeInTheDocument()
  })

  test('생성에 성공하면 새 그룹 상세 페이지로 이동한다', async () => {
    renderGroups()
    const { user, dialog } = await openCreateModal()

    await user.selectOptions(within(dialog).getByLabelText('종류'), 'PROJECT')
    await user.type(within(dialog).getByLabelText('그룹 이름'), '졸업과제 7조')
    await user.type(within(dialog).getByLabelText('slug'), 'grad-team7')
    await user.type(within(dialog).getByLabelText('설명'), '2026-2 졸업과제 7조')
    await user.click(within(dialog).getByRole('button', { name: '만들기' }))

    expect(
      await screen.findByRole('heading', { name: '졸업과제 7조' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/grad-team7/)).toBeInTheDocument()
  })
})
