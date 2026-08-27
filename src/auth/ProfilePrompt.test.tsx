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
      await screen.findByRole('heading', { name: '직책과 소속을 입력해 주세요' }),
    ).toBeInTheDocument()
    // 게이트가 아니다. 셸은 뒤에 그대로 있다.
    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })

  test('닫으면 콘솔을 그대로 쓸 수 있다', async () => {
    const user = userEvent.setup()
    renderApp('/console')
    await screen.findByRole('heading', { name: '직책과 소속을 입력해 주세요' })

    await user.click(screen.getByRole('button', { name: '나중에 입력' }))

    expect(
      screen.queryByRole('heading', { name: '직책과 소속을 입력해 주세요' }),
    ).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })

  test('한 번 닫으면 이 세션에서 다시 뜨지 않는다', async () => {
    const user = userEvent.setup()
    renderApp('/console')
    await screen.findByRole('heading', { name: '직책과 소속을 입력해 주세요' })
    await user.click(screen.getByRole('button', { name: '나중에 입력' }))

    // 다른 화면으로 갔다 와도 마찬가지다. 라우팅마다 다시 물으면 닫기가 닫기가
    // 아니다.
    await user.click(screen.getByRole('link', { name: '내 신청' }))
    await screen.findByRole('heading', { name: '내 신청' })
    expect(
      screen.queryByRole('heading', { name: '직책과 소속을 입력해 주세요' }),
    ).not.toBeInTheDocument()
  })

  test('저장하면 안내가 사라진다', async () => {
    const user = userEvent.setup()
    renderApp('/console')
    await screen.findByRole('heading', { name: '직책과 소속을 입력해 주세요' })

    await screen.findByRole('option', { name: '학부생' })
    await user.selectOptions(screen.getByLabelText('직책'), 'PROFESSOR')
    // 교수의 소속은 자유 입력이다. 연구소나 부서는 어느 학과 목록에도 없다.
    await user.type(screen.getByLabelText('소속'), '정보컴퓨터공학부')

    // 저장 후의 /me 는 채워진 프로필을 돌려준다.
    server.use(http.get('*/api/v1/me', () => HttpResponse.json(regularProfile, { status: 200 })))
    server.use(
      http.put('*/api/v1/me/profile', () => HttpResponse.json(regularProfile, { status: 200 })),
    )
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: '직책과 소속을 입력해 주세요' }),
      ).not.toBeInTheDocument(),
    )
  })

  test('직책을 비학생으로 바꾸면 학번 입력이 사라진다', async () => {
    const user = userEvent.setup()
    renderApp('/console')
    await screen.findByRole('heading', { name: '직책과 소속을 입력해 주세요' })
    await screen.findByRole('option', { name: '학부생' })

    await user.selectOptions(screen.getByLabelText('직책'), 'STUDENT_UNDERGRAD')
    expect(screen.getByLabelText('학번')).toBeInTheDocument()

    // 남겨 두면 교수 계정에 학번이 딸려 가고, 값이 형식에 안 맞으면 화면에 없는
    // 필드에 대한 422를 받게 된다.
    await user.selectOptions(screen.getByLabelText('직책'), 'PROFESSOR')
    expect(screen.queryByLabelText('학번')).not.toBeInTheDocument()
  })

  test('직책이 소속의 모양을 정한다', async () => {
    const user = userEvent.setup()
    renderApp('/console')
    await screen.findByRole('heading', { name: '직책과 소속을 입력해 주세요' })
    await screen.findByRole('option', { name: '학부생' })

    // 직책 전에는 소속을 묻지 않는다. 먼저 물으면 고른 뒤에 칸이 바뀌면서 방금 쓴
    // 값이 버려진다.
    expect(screen.queryByLabelText('소속 학과')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('소속')).not.toBeInTheDocument()

    // 학생은 카탈로그에서 고른다.
    await user.selectOptions(screen.getByLabelText('직책'), 'STUDENT_UNDERGRAD')
    expect(screen.getByLabelText('소속 학과')).toBeInTheDocument()
    expect(screen.queryByLabelText('소속')).not.toBeInTheDocument()

    // 교수는 직접 쓴다. 연구소나 부서는 어느 학과 목록에도 없다.
    await user.selectOptions(screen.getByLabelText('직책'), 'PROFESSOR')
    expect(screen.getByLabelText('소속')).toBeInTheDocument()
    expect(screen.queryByLabelText('소속 학과')).not.toBeInTheDocument()
  })

  test('목록에 없는 학과를 고른 학생에게 직접 입력이 함께 나온다', async () => {
    const user = userEvent.setup()
    renderApp('/console')
    await screen.findByRole('heading', { name: '직책과 소속을 입력해 주세요' })
    await screen.findByRole('option', { name: '학부생' })

    await user.selectOptions(screen.getByLabelText('직책'), 'STUDENT_UNDERGRAD')
    expect(screen.queryByLabelText('소속 학과 직접 입력')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('소속 학과'), 'OTHER')
    expect(screen.getByLabelText('소속 학과 직접 입력')).toBeInTheDocument()
  })

  test('직책을 바꾸면 다른 모양의 소속이 전송 본문에서 사라진다', async () => {
    // 화면에서 사라진 값이 상태에 남으면 그대로 저장되고 잠금이 그것을 영구화한다.
    // 학부생으로 학과를 고른 뒤 교수로 바꾸면 보이는 소속은 빈 칸인데 학과 코드가
    // 저장되고, 그 뒤 진짜 소속을 자유 입력으로 넣으려 하면 조합 규칙에 걸린다.
    const user = userEvent.setup()
    let sent: Record<string, unknown> | null = null
    server.use(
      http.put('*/api/v1/me/profile', async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(regularProfile, { status: 200 })
      }),
    )
    renderApp('/console')
    await screen.findByRole('heading', { name: '직책과 소속을 입력해 주세요' })
    await screen.findByRole('option', { name: '학부생' })

    await user.selectOptions(screen.getByLabelText('직책'), 'STUDENT_UNDERGRAD')
    await user.selectOptions(screen.getByLabelText('소속 학과'), 'COMPUTER_SCIENCE')
    await user.selectOptions(screen.getByLabelText('직책'), 'PROFESSOR')

    // 저장 버튼이 열려 있으면 안 된다. 소속이 비었으니까.
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()

    await user.type(screen.getByLabelText('소속'), '부설연구소')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(sent).toMatchObject({ departmentOther: '부설연구소' }))
    expect(sent).not.toHaveProperty('departmentCode')
  })

  test('기타를 고르고 직접 입력을 비우면 저장할 수 없다', async () => {
    // 카탈로그의 OTHER 는 「목록에 없다」는 표시일 뿐 소속이 아니다. 서버에는 이 규칙이
    // 없어서(V94 의 CHECK 도 자유 입력이 비는 것을 허용한다) 통과하고, 잠금 때문에
    // 소속이 「기타」라는 무의미한 값으로 굳는다.
    const user = userEvent.setup()
    renderApp('/console')
    await screen.findByRole('heading', { name: '직책과 소속을 입력해 주세요' })
    await screen.findByRole('option', { name: '학부생' })

    await user.selectOptions(screen.getByLabelText('직책'), 'STUDENT_UNDERGRAD')
    await user.type(screen.getByLabelText('학번'), '202012345')
    await user.selectOptions(screen.getByLabelText('소속 학과'), 'OTHER')
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()

    await user.type(screen.getByLabelText('소속 학과 직접 입력'), '융합학부')
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
  })

  test('반쯤 채운 계정에는 저장된 값이 채워져 있고 잠긴 칸은 입력칸이 아니다', async () => {
    // 안내가 빈 폼으로 시작하면 손대지 않은 칸이 비우기로 전송되어 잠금 422가 나고,
    // 그 오류는 사용자가 건드리지도 않은 필드를 가리킨다.
    const halfFilled = {
      ...regularProfile,
      position: 'STUDENT_UNDERGRAD' as const,
      studentNo: '202012345',
      departmentCode: null,
      departmentName: null,
      departmentOther: null,
      profileComplete: false,
    }
    const user = userEvent.setup()
    let sent: Record<string, unknown> | null = null
    server.use(
      http.get('*/api/v1/me', () => HttpResponse.json(halfFilled, { status: 200 })),
      http.put('*/api/v1/me/profile', async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(regularProfile, { status: 200 })
      }),
    )
    renderApp('/console')
    await screen.findByRole('heading', { name: '직책과 소속을 입력해 주세요' })
    // 직책이 잠겨 Select 가 없으므로 카탈로그 도착은 소속 쪽에서 기다린다.
    await screen.findByRole('option', { name: '정보컴퓨터공학부' })

    // 직책과 학번은 잠겼다. 입력칸이 아니라 값과 사유가 보인다.
    expect(screen.queryByLabelText('직책')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('학번')).not.toBeInTheDocument()
    expect(screen.getByText('202012345')).toBeInTheDocument()

    // 남은 것은 소속뿐이고, 학생이므로 카탈로그에서 고른다.
    await user.selectOptions(screen.getByLabelText('소속 학과'), 'COMPUTER_SCIENCE')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(sent).toMatchObject({ departmentCode: 'COMPUTER_SCIENCE' }))
    // 잠긴 값을 실으면 서버가 잠금 규칙으로 판정한다. 보내지 않는 것이 옳다.
    expect(sent).not.toHaveProperty('position')
    expect(sent).not.toHaveProperty('studentNo')
  })

  test('저장 뒤에는 못 바꾼다는 것을 먼저 말한다', async () => {
    renderApp('/console')
    await screen.findByRole('heading', { name: '직책과 소속을 입력해 주세요' })

    // 이것을 말하지 않으면 화면 자체가 함정이다. 여기서 고른 값은 본인이 되돌릴 수
    // 없고, 되돌리는 데 사람이 필요하다는 것을 고르기 전에 알아야 한다.
    expect(screen.getByText(/직접 바꿀 수 없습니다/)).toBeInTheDocument()
  })
})
