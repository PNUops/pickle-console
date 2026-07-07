import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderGroup(groupId: number) {
  server.use(refreshSuccessHandler('access-student'))
  renderApp(`/console/groups/${groupId}`)
}

describe('그룹 상세 — 역할별 UI', () => {
  test('OWNER는 정보 수정·멤버 추가·역할 변경·제거 UI를 본다', async () => {
    renderGroup(12)
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    expect(screen.getByRole('button', { name: '정보 수정' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '멤버 추가' })).toBeInTheDocument()
    expect(screen.getByLabelText('김철수 역할 변경')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '제거' })).toHaveLength(3)
    expect(screen.getByRole('button', { name: '그룹 나가기' })).toBeInTheDocument()
  })

  test('MEMBER는 읽기 전용으로 보고 나가기만 할 수 있다', async () => {
    renderGroup(15)
    await screen.findByRole('heading', { name: '알고리즘 스터디' })

    expect(screen.queryByRole('button', { name: '정보 수정' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '멤버 추가' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/역할 변경/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '제거' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '그룹 나가기' })).toBeInTheDocument()
  })

  test('PERSONAL 그룹은 안내 문구와 함께 멤버 관리가 비활성화된다', async () => {
    renderGroup(7)
    await screen.findByRole('heading', { name: '홍길동' })

    expect(
      screen.getByText(/개인 그룹은 회원 가입 시 자동으로 생성되는 그룹/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '멤버 추가' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '그룹 나가기' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/역할 변경/)).not.toBeInTheDocument()
  })
})

describe('그룹 상세 — 멤버 관리', () => {
  test('소유권 이전은 이메일 입력으로 확인한 뒤에만 실행된다', async () => {
    const user = userEvent.setup()
    renderGroup(12)
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    await user.selectOptions(screen.getByLabelText('김철수 역할 변경'), 'OWNER')

    const dialog = await screen.findByRole('dialog', { name: '소유권 이전' })
    expect(within(dialog).getByText(/정말 소유권을 이전하시겠습니까/)).toBeInTheDocument()
    const confirmButton = within(dialog).getByRole('button', { name: '소유권 이전' })
    expect(confirmButton).toBeDisabled()

    await user.type(
      within(dialog).getByLabelText('확인 이메일'),
      'cheolsu.kim@pusan.ac.kr',
    )
    expect(confirmButton).toBeEnabled()
    await user.click(confirmButton)

    // 이전 후에는 내가 OWNER가 아니므로 관리 UI가 사라지고 역할 배지만 남는다.
    await waitFor(() =>
      expect(screen.queryByLabelText('김철수 역할 변경')).not.toBeInTheDocument(),
    )
    const cheolsuRow = screen.getByText('김철수').closest('tr')!
    expect(within(cheolsuRow).getByText('소유자')).toBeInTheDocument()
    const myRow = screen.getByText('(나)').closest('tr')!
    expect(within(myRow).getByText('관리자')).toBeInTheDocument()
  })

  test('이메일로 멤버를 추가하고, 미가입 이메일이면 안내를 보여준다', async () => {
    const user = userEvent.setup()
    renderGroup(12)
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    await user.type(screen.getByLabelText('이메일'), 'nobody@pusan.ac.kr')
    await user.click(screen.getByRole('button', { name: '추가' }))
    expect(
      await screen.findByText('해당 이메일로 가입된 사용자가 없습니다. 가입 후 다시 시도해 주세요.'),
    ).toBeInTheDocument()

    await user.clear(screen.getByLabelText('이메일'))
    await user.type(screen.getByLabelText('이메일'), 'sujin.choi@pusan.ac.kr')
    await user.click(screen.getByRole('button', { name: '추가' }))
    expect(await screen.findByText('최수진')).toBeInTheDocument()
  })

  test('유일한 OWNER가 나가려 하면 409 안내를 보여준다', async () => {
    const user = userEvent.setup()
    renderGroup(12)
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    await user.click(screen.getByRole('button', { name: '그룹 나가기' }))
    const dialog = await screen.findByRole('dialog', { name: '그룹 나가기' })
    await user.click(within(dialog).getByRole('button', { name: '나가기' }))

    expect(
      await screen.findByText('소유권을 다른 멤버에게 이전한 뒤 다시 시도해 주세요.'),
    ).toBeInTheDocument()
  })

  test('멤버는 그룹을 나가면 그룹 목록으로 이동한다', async () => {
    const user = userEvent.setup()
    renderGroup(15)
    await screen.findByRole('heading', { name: '알고리즘 스터디' })

    await user.click(screen.getByRole('button', { name: '그룹 나가기' }))
    const dialog = await screen.findByRole('dialog', { name: '그룹 나가기' })
    await user.click(within(dialog).getByRole('button', { name: '나가기' }))

    expect(await screen.findByRole('heading', { name: '내 그룹' })).toBeInTheDocument()
    expect(screen.queryByText('알고리즘 스터디')).not.toBeInTheDocument()
  })
})
