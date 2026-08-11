import { screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { asLlmKeyGrantManager } from '../test/msw/handlers/llm-keys'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

function renderKeys(path = '/console/llm-keys') {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(path)
}

describe('내 LLM API 키 목록', () => {
  test('키를 상태·앞부분·마지막 사용과 함께 나열한다', async () => {
    renderKeys()

    const activeRow = (
      await screen.findByRole('link', { name: 'capstone-chatbot' })
    ).closest('tr')!
    expect(within(activeRow).getByText('활성')).toBeInTheDocument()
    expect(within(activeRow).getByText('pk-llm-3f9a')).toBeInTheDocument()
    expect(within(activeRow).getByText('캡스톤 3조')).toBeInTheDocument()
  })

  test('발급 전 키는 폐기된 키와 다른 상태로 나온다', async () => {
    renderKeys()

    const pendingRow = (
      await screen.findByRole('link', { name: 'algo-hint-writer' })
    ).closest('tr')!
    // 폐기와 다른 이야기다 — 아직 비밀이 없을 뿐, 상세로 들어가 발급할 수 있다.
    expect(within(pendingRow).getByText('발급 전')).toBeInTheDocument()
    expect(within(pendingRow).getByText('사용 기록 없음')).toBeInTheDocument()

    const revokedRow = (
      await screen.findByRole('link', { name: 'leaked-demo-key' })
    ).closest('tr')!
    expect(within(revokedRow).getByText('폐기됨')).toBeInTheDocument()
  })

  test('접근 권한이 없는 키는 이름·상태만 나오고 누구에게 요청할지 알려 준다', async () => {
    renderKeys()

    const limitedRow = (await screen.findByText('db-lab-grader')).closest('tr')!
    expect(screen.queryByRole('link', { name: 'db-lab-grader' })).not.toBeInTheDocument()
    expect(within(limitedRow).getByText('활성')).toBeInTheDocument()
    // 값이 0이거나 빈 것이 아니라 필드가 없는 것이다.
    expect(within(limitedRow).getAllByText('—').length).toBeGreaterThan(0)
    expect(
      within(limitedRow).getByText(/접근 권한이 없습니다 — 김철수 님에게 요청하세요/),
    ).toBeInTheDocument()
    expect(
      within(limitedRow).queryByRole('link', { name: '접근 권한 관리' }),
    ).not.toBeInTheDocument()
  })

  test('워크스페이스 소유자는 안을 못 봐도 제한 행에서 접근 권한 관리로 갈 수 있다', async () => {
    asLlmKeyGrantManager(uuid(72))
    renderKeys()

    const limitedRow = (await screen.findByText('db-lab-grader')).closest('tr')!
    const manage = within(limitedRow).getByRole('link', { name: '접근 권한 관리' })
    expect(manage).toHaveAttribute('href', `/console/llm-keys/${uuid(72)}/access`)
    expect(screen.queryByRole('link', { name: 'db-lab-grader' })).not.toBeInTheDocument()
  })

  test('워크스페이스 범위 주소는 그 워크스페이스의 키만 보여 준다', async () => {
    renderKeys(`/console/${uuid(15)}/llm-keys`)

    expect(await screen.findByRole('link', { name: 'algo-hint-writer' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'capstone-chatbot' })).not.toBeInTheDocument()
  })
})

describe('LLM API 키 접근 권한 화면', () => {
  test('키 상세가 막혀 있어도 열린다', async () => {
    // 상세를 부르면 403이라, 화면이 상세에 기대면 관리 경로가 통째로 닫힌다.
    asLlmKeyGrantManager(uuid(72))
    renderKeys(`/console/llm-keys/${uuid(72)}/access`)

    expect(await screen.findByRole('heading', { name: 'db-lab-grader' })).toBeInTheDocument()
    expect(screen.getByText(/데이터베이스 실습 소유/)).toBeInTheDocument()
    expect(await screen.findByText(/접근 권한 \(/)).toBeInTheDocument()
    // 회수 안내는 키의 것이어야 한다 — VM 비밀번호 이야기가 나오면 거짓말이다.
    expect(screen.getByText(/이 LLM API 키에는 아래 목록에 있는 사람만/)).toBeInTheDocument()
  })
})
