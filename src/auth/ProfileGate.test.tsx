import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import { server } from '../test/msw/server'
import { http, HttpResponse } from 'msw'
import { refreshSuccessHandler, regularProfile } from '../test/msw/handlers/auth'
import { renderApp } from '../test/render'

/** 프로필이 비어 있는 계정. V89 이전에 만들어진 모든 계정이 이 상태다. */
function withEmptyProfile() {
  server.use(
    http.get('*/api/v1/me', () =>
      HttpResponse.json(
        {
          ...regularProfile,
          position: undefined,
          studentNo: undefined,
          departmentCode: undefined,
          departmentName: undefined,
          profileComplete: false,
        },
        { status: 200 },
      ),
    ),
  )
}

describe('프로필 게이트', () => {
  beforeEach(() => {
    // 세션 복원으로 로그인 상태를 만든다. withEmptyProfile 이 /me 를 덮으므로
    // 순서가 중요하다.
    server.use(refreshSuccessHandler('access-user'))
    withEmptyProfile()
  })

  test('프로필이 비어 있으면 콘솔 대신 입력 화면이 뜬다', async () => {
    renderApp('/console')
    expect(
      await screen.findByRole('heading', { name: '소속 정보를 입력해 주세요' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '대시보드' })).not.toBeInTheDocument()
  })

  test('저장하면 게이트가 풀린다', async () => {
    const user = userEvent.setup()
    renderApp('/console')
    await screen.findByRole('heading', { name: '소속 정보를 입력해 주세요' })

    await screen.findByRole('option', { name: '학부생' })
    await user.selectOptions(screen.getByLabelText('직책'), 'PROFESSOR')
    await user.selectOptions(screen.getByLabelText('소속'), 'COMPUTER_SCIENCE')

    // 저장 후의 /me 는 채워진 프로필을 돌려준다.
    server.use(http.get('*/api/v1/me', () => HttpResponse.json(regularProfile, { status: 200 })))
    server.use(
      http.put('*/api/v1/me/profile', () => HttpResponse.json(regularProfile, { status: 200 })),
    )
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })

  test('갇히지 않도록 로그아웃 길이 있다', async () => {
    renderApp('/console')
    await screen.findByRole('heading', { name: '소속 정보를 입력해 주세요' })
    // 게이트가 셸 전체를 대신하므로 여기서 나갈 수 없으면 폼을 완료할 수 없는 사람이
    // 갇힌다.
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument()
  })
})
