import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler, regularProfile, regularUser } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

function renderAccount() {
  server.use(refreshSuccessHandler('access-user', regularUser))
  renderApp('/console/account')
}

describe('계정 설정 — 프로필', () => {
  test('저장된 값이 한 줄씩 보인다', async () => {
    renderAccount()
    await screen.findByRole('heading', { name: '계정 설정' })

    // 소속 학과는 서버가 코드를 풀어 보낸 이름이고, 직책은 카탈로그가 도착해야
    // 라벨이 된다.
    expect(await screen.findByText('학부생')).toBeInTheDocument()
    expect(screen.getByText('정보컴퓨터공학부')).toBeInTheDocument()
    expect(screen.getByText('202012345')).toBeInTheDocument()
  })

  test('변경을 열면 저장된 값이 채워져 있고 학번이 지워지지 않는다', async () => {
    const user = userEvent.setup()
    renderAccount()
    await screen.findByRole('heading', { name: '계정 설정' })

    await user.click(screen.getAllByRole('button', { name: '변경' })[0])
    await screen.findByRole('heading', { name: '프로필 변경' })

    // 카탈로그가 도착하기 전에는 requiresStudentNo 가 false 라, 미리 채운 학번을
    // 지우는 효과가 그 사이에 돌면 값이 사라진다. ProfileFields 의 로드 가드가
    // 막는 자리이고, 이 화면이 값을 미리 채우는 첫 사용처다.
    await screen.findByRole('option', { name: '학부생' })
    await waitFor(() => expect(screen.getByLabelText('학번')).toHaveValue('202012345'))
    expect(screen.getByLabelText('직책')).toHaveValue('STUDENT_UNDERGRAD')
    expect(screen.getByLabelText('소속')).toHaveValue('COMPUTER_SCIENCE')
  })

  test('이름을 바꾸면 저장된다', async () => {
    const user = userEvent.setup()
    let sent: unknown = null
    server.use(
      http.put('*/api/v1/me/profile', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ...regularProfile, name: '새 이름' }, { status: 200 })
      }),
    )
    renderAccount()
    await screen.findByRole('heading', { name: '계정 설정' })

    await user.click(screen.getAllByRole('button', { name: '변경' })[0])
    await screen.findByRole('heading', { name: '프로필 변경' })
    await screen.findByRole('option', { name: '학부생' })

    await user.clear(screen.getByLabelText('이름'))
    await user.type(screen.getByLabelText('이름'), '새 이름')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(sent).toMatchObject({ name: '새 이름' }))
  })
})
