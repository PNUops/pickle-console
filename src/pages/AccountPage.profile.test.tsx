import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import {
  legacyStaffProfile,
  refreshSuccessHandler,
  regularProfile,
  regularUser,
} from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

/** 「이름」 행의 「변경」. 같은 이름의 버튼이 비밀번호 행에도 있어 행으로 좁힌다. */
function nameRowButton(): HTMLElement {
  const row = screen.getByText('이름', { selector: 'p' }).closest<HTMLElement>('div.space-y-2')!
  return within(row).getByRole('button', { name: '변경' })
}

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

  test('저장된 세 값은 입력칸이 아니라 잠김으로 보인다', async () => {
    const user = userEvent.setup()
    renderAccount()
    await screen.findByRole('heading', { name: '계정 설정' })

    // 잠긴 셋은 채울 것이 없으므로 「입력」 버튼도 없다. 값과 잠김 표시는 행에
    // 함께 서고, 그것을 보려고 창을 열 필요가 없다.
    expect(screen.getAllByText('변경 불가')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: '입력' })).not.toBeInTheDocument()

    await user.click(nameRowButton())
    const dialog = await screen.findByRole('dialog', { name: '이름 변경' })

    // 이름 창은 이름만 준다. 세 값은 저장돼 있어 서버가 422로 거절하므로, 화면이
    // 입력칸을 주면 그 거절을 사용자가 눌러서 알게 된다.
    expect(within(dialog).getByLabelText('이름')).toHaveValue('홍길동')
    expect(screen.queryByLabelText('직책')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('학번')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('소속 학과')).not.toBeInTheDocument()
  })

  test('이름만 보내고 잠긴 값은 본문에 담지 않는다', async () => {
    const user = userEvent.setup()
    let sent: Record<string, unknown> | null = null
    server.use(
      http.put('*/api/v1/me/profile', async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...regularProfile, name: '새 이름' }, { status: 200 })
      }),
    )
    renderAccount()
    await screen.findByRole('heading', { name: '계정 설정' })

    await user.click(nameRowButton())
    await screen.findByRole('heading', { name: '이름 변경' })

    await user.clear(screen.getByLabelText('이름'))
    await user.type(screen.getByLabelText('이름'), '새 이름')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(sent).toMatchObject({ name: '새 이름' }))
    // 잠긴 필드를 실으면 서버가 잠금 규칙으로 판정한다. 같은 값이면 통과하지만,
    // 아예 보내지 않는 것이 그 판정과 한 번 덜 부딪힌다.
    expect(sent).not.toHaveProperty('position')
    expect(sent).not.toHaveProperty('studentNo')
    expect(sent).not.toHaveProperty('departmentCode')
    expect(sent).not.toHaveProperty('departmentOther')
  })

  test('학과 코드를 든 교직원도 이름을 바꿀 수 있다', async () => {
    // v0.46.0 이전에 프로필을 채운 계정의 모양이고 라이브에 실존한다. 새 모델대로
    // "교직원이니 코드는 없다"고 판단해 departmentCode 를 null 로 보내면 잠금과
    // 조합 규칙에 이중으로 걸려 이름만 바꾸는 저장까지 422가 된다.
    const user = userEvent.setup()
    const legacy = { ...regularProfile, ...legacyStaffProfile }
    let sent: Record<string, unknown> | null = null
    server.use(
      http.get('*/api/v1/me', () => HttpResponse.json(legacy, { status: 200 })),
      http.put('*/api/v1/me/profile', async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...legacy, name: '연구원 새 이름' }, { status: 200 })
      }),
    )
    renderAccount()
    await screen.findByRole('heading', { name: '계정 설정' })

    await user.click(nameRowButton())
    await screen.findByRole('heading', { name: '이름 변경' })
    await user.clear(screen.getByLabelText('이름'))
    await user.type(screen.getByLabelText('이름'), '연구원 새 이름')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(sent).toMatchObject({ name: '연구원 새 이름' }))
    expect(sent).not.toHaveProperty('departmentCode')
    expect(sent).not.toHaveProperty('departmentOther')
  })

  test('프로필이 미완성인 계정은 계정 화면 대신 게이트를 만난다', async () => {
    // Filling the remaining fields later used to happen here, after the prompt
    // was dismissed. The gate now meets the account first and starts from the
    // stored values, so the field-level fill is pinned in ProfileGate.test.tsx
    // ("반쯤 채운 계정"). What this pins is that the account screen is not
    // reachable around it.
    const halfFilled = {
      ...regularProfile,
      position: 'PROFESSOR' as const,
      studentNo: null,
      departmentCode: null,
      departmentName: null,
      departmentOther: null,
      profileComplete: false,
    }
    server.use(http.get('*/api/v1/me', () => HttpResponse.json(halfFilled, { status: 200 })))
    renderAccount()
    expect(
      await screen.findByRole('heading', { name: '직책과 소속을 입력해 주세요' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '계정 설정' })).not.toBeInTheDocument()
  })
})
