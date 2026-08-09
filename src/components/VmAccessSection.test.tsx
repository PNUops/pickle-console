import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { vmDetailAs } from '../test/msw/handlers/vms'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

/** VM 상세의 접근 탭을 연다 (기본 픽스처: 로그인 사용자가 자원 소유자). */
function renderAccessTab(vmId: number) {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(`/console/vms/${vmId}?tab=access`)
}

/** '접근 권한' 카드 요소 — 이름이 헤더·폼과 겹치므로 조회를 여기로 좁힌다. */
async function accessCard(): Promise<HTMLElement> {
  const title = await screen.findByText(/접근 권한 \(\d+건\)/)
  return title.closest('div')!.parentElement as HTMLElement
}

/** 목록에서 이 이름이 있는 행(li)을 찾는다. */
async function grantRow(name: string): Promise<HTMLElement> {
  const card = await accessCard()
  const row = within(card)
    .getAllByRole('listitem')
    .find((item) => within(item).queryByText(name))
  expect(row, `접근 목록에 '${name}' 행이 없다`).toBeDefined()
  return row!
}

describe('VM 접근 탭 — 노출 조건', () => {
  test('접근 권한을 관리할 수 있을 때만 탭이 보인다', async () => {
    renderAccessTab(56)

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.getByRole('tab', { name: '접근' })).toBeInTheDocument()
    expect(await screen.findByText(/접근 권한 \(3건\)/)).toBeInTheDocument()
  })

  test('관리 권한이 없으면 탭이 없고 딥링크는 개요로 되돌아간다', async () => {
    // 편집자는 설정까지는 바꾸지만 누가 들어올지는 정하지 못한다.
    server.use(vmDetailAs(56, 'EDITOR'))
    renderAccessTab(56)

    await screen.findByRole('heading', { name: 'algo-judge' })
    expect(screen.queryByRole('tab', { name: '접근' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '개요' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('VM 접근 탭 — 목록', () => {
  test('사용자 항목과 그룹 전체 항목을 등급과 함께 나열한다', async () => {
    renderAccessTab(56)

    await screen.findByRole('heading', { name: 'algo-judge' })
    const myRow = await grantRow('홍길동')
    expect(within(myRow).getByRole('combobox')).toHaveValue('OWNER')

    const groupRow = await grantRow('그룹 전체')
    expect(within(groupRow).getByText(/이 VM을 소유한 그룹의 구성원 전원/)).toBeInTheDocument()
    expect(within(groupRow).getByRole('combobox')).toHaveValue('VIEWER')
  })

  test('그룹 전체 항목에는 소유자·편집자 등급을 고를 수 없다', async () => {
    renderAccessTab(56)

    await screen.findByRole('heading', { name: 'algo-judge' })
    const groupRow = await grantRow('그룹 전체')
    const select = within(groupRow).getByRole('combobox')
    expect(within(select).getByRole('option', { name: '참여자' })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: '열람자' })).toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: '소유자' })).not.toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: '편집자' })).not.toBeInTheDocument()
  })
})

describe('VM 접근 탭 — 부여·변경·회수', () => {
  test('그룹 구성원에게 등급을 골라 부여하면 목록에 나타난다', async () => {
    const user = userEvent.setup()
    renderAccessTab(57) // web-lab: 그룹 12, 목록에는 나(소유자)만 있다

    await screen.findByRole('heading', { name: 'web-lab' })
    expect(await screen.findByText(/접근 권한 \(1건\)/)).toBeInTheDocument()

    // 후보 목록은 접근 목록 응답이 알려 준 그룹을 다시 물어 채워진다 — 두 번째
    // 질의라 먼저 도착을 기다린다.
    await screen.findByRole('option', { name: /김철수/ })
    await user.selectOptions(screen.getByLabelText('대상'), '57')
    await user.selectOptions(screen.getByLabelText('등급'), 'EDITOR')
    await user.click(screen.getByRole('button', { name: '부여' }))

    expect(await screen.findByText(/접근 권한 \(2건\)/)).toBeInTheDocument()
    const added = await grantRow('김철수')
    expect(within(added).getByRole('combobox')).toHaveValue('EDITOR')
  })

  test('이미 목록에 있는 사람은 부여 대상에 나오지 않는다', async () => {
    renderAccessTab(56)

    await screen.findByRole('heading', { name: 'algo-judge' })
    const target = await screen.findByLabelText('대상')
    // 그룹 15의 구성원은 나와 김철수뿐이고 둘 다 이미 목록에 있다.
    expect(within(target).queryByRole('option', { name: /김철수/ })).not.toBeInTheDocument()
    // 그룹 전체 항목도 이미 있으므로 다시 만들 수 없다.
    expect(within(target).queryByRole('option', { name: '그룹 전체' })).not.toBeInTheDocument()
  })

  test('등급을 바꾸면 그 자리에서 반영된다', async () => {
    const user = userEvent.setup()
    renderAccessTab(56)

    await screen.findByRole('heading', { name: 'algo-judge' })
    const row = await grantRow('김철수')
    await user.selectOptions(within(row).getByRole('combobox'), 'EDITOR')

    await waitFor(async () =>
      expect(within(await grantRow('김철수')).getByRole('combobox')).toHaveValue('EDITOR'),
    )
  })

  test('회수 모달은 회수가 되돌리지 못하는 것을 먼저 알리고, 확인하면 목록에서 사라진다', async () => {
    const user = userEvent.setup()
    renderAccessTab(56)

    await screen.findByRole('heading', { name: 'algo-judge' })
    const row = await grantRow('김철수')
    await user.click(within(row).getByRole('button', { name: '회수' }))

    const dialog = await screen.findByRole('dialog', { name: '접근 권한 회수' })
    expect(
      within(dialog).getByText(/이미 열람한 초기 비밀번호는 그대로 남습니다/),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(/이미 열려 있는 SSH 세션은 끊기지 않습니다/),
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '회수' }))
    expect(await screen.findByText(/접근 권한 \(2건\)/)).toBeInTheDocument()
    const card = await accessCard()
    expect(within(card).queryByText('김철수')).not.toBeInTheDocument()
  })
})
