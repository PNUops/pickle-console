import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
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

describe('프로필 안내', () => {
  beforeEach(() => {
    // 세션 복원으로 로그인 상태를 만든다. withEmptyProfile 이 /me 를 덮으므로
    // 순서가 중요하다.
    server.use(refreshSuccessHandler('access-user'))
    withEmptyProfile()
    sessionStorage.clear()
  })

  test('프로필이 비어 있으면 콘솔 위에 안내가 뜬다', async () => {
    renderApp('/console')
    expect(
      await screen.findByRole('heading', { name: '직책과 소속 학과를 입력해 주세요' }),
    ).toBeInTheDocument()
    // 게이트가 아니다. 셸은 뒤에 그대로 있다.
    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })

  test('닫으면 콘솔을 그대로 쓸 수 있다', async () => {
    const user = userEvent.setup()
    renderApp('/console')
    await screen.findByRole('heading', { name: '직책과 소속 학과를 입력해 주세요' })

    await user.click(screen.getByRole('button', { name: '나중에 입력' }))

    expect(
      screen.queryByRole('heading', { name: '직책과 소속 학과를 입력해 주세요' }),
    ).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })

  test('한 번 닫으면 이 세션에서 다시 뜨지 않는다', async () => {
    const user = userEvent.setup()
    renderApp('/console')
    await screen.findByRole('heading', { name: '직책과 소속 학과를 입력해 주세요' })
    await user.click(screen.getByRole('button', { name: '나중에 입력' }))

    // 다른 화면으로 갔다 와도 마찬가지다. 라우팅마다 다시 물으면 닫기가 닫기가
    // 아니다.
    await user.click(screen.getByRole('link', { name: '내 신청' }))
    await screen.findByRole('heading', { name: '내 신청' })
    expect(
      screen.queryByRole('heading', { name: '직책과 소속 학과를 입력해 주세요' }),
    ).not.toBeInTheDocument()
  })

  test('저장하면 안내가 사라진다', async () => {
    const user = userEvent.setup()
    renderApp('/console')
    await screen.findByRole('heading', { name: '직책과 소속 학과를 입력해 주세요' })

    await screen.findByRole('option', { name: '학부생' })
    await user.selectOptions(screen.getByLabelText('직책'), 'PROFESSOR')
    await user.selectOptions(screen.getByLabelText('소속'), 'COMPUTER_SCIENCE')

    // 저장 후의 /me 는 채워진 프로필을 돌려준다.
    server.use(http.get('*/api/v1/me', () => HttpResponse.json(regularProfile, { status: 200 })))
    server.use(
      http.put('*/api/v1/me/profile', () => HttpResponse.json(regularProfile, { status: 200 })),
    )
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: '직책과 소속 학과를 입력해 주세요' }),
      ).not.toBeInTheDocument(),
    )
  })

  test('직책을 비학생으로 바꾸면 학번 입력이 사라진다', async () => {
    const user = userEvent.setup()
    renderApp('/console')
    await screen.findByRole('heading', { name: '직책과 소속 학과를 입력해 주세요' })
    await screen.findByRole('option', { name: '학부생' })

    await user.selectOptions(screen.getByLabelText('직책'), 'STUDENT_UNDERGRAD')
    expect(screen.getByLabelText('학번')).toBeInTheDocument()

    // 남겨 두면 교수 계정에 학번이 딸려 가고, 값이 형식에 안 맞으면 화면에 없는
    // 필드에 대한 422를 받게 된다.
    await user.selectOptions(screen.getByLabelText('직책'), 'PROFESSOR')
    expect(screen.queryByLabelText('학번')).not.toBeInTheDocument()
  })
})
