import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { refreshSuccessHandler } from '../test/msw/handlers/auth'
import { rosterResolveCalls } from '../test/msw/handlers/workspaces'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

function renderWorkspace(workspaceId: string) {
  server.use(refreshSuccessHandler('access-user'))
  renderApp(`/console/workspaces/${workspaceId}`)
}

describe('워크스페이스 상세 — 역할별 UI', () => {
  test('OWNER는 정보 수정·구성원 초대·역할 변경·제거 UI를 본다', async () => {
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    expect(await screen.findByRole('heading', { name: '리소스', level: 2 })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'capstone-team3-api' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'capstone-chatbot' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '정보 수정' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '구성원 초대' })).toBeInTheDocument()
    expect(screen.getByLabelText('김철수 역할 변경')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '제거' })).toHaveLength(3)
    expect(screen.getByRole('button', { name: '워크스페이스 나가기' })).toBeInTheDocument()
  })

  test('MEMBER는 읽기 전용으로 보고 나가기만 할 수 있다', async () => {
    renderWorkspace(uuid(15))
    await screen.findByRole('heading', { name: '알고리즘 스터디' })

    expect(screen.queryByRole('button', { name: '정보 수정' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '구성원 초대' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /대기 중인 초대/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/역할 변경/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '제거' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '워크스페이스 나가기' })).toBeInTheDocument()
  })

  test('나가기는 구성원 표 옆이 아니라 자기 카드에 선다', async () => {
    // 다시 초대받아야 돌아올 수 있는 동작이라 파괴적 카드의 자리다. 같은 페이지의
    // 「워크스페이스 삭제」가 그 모양을 정해 뒀고, 이쪽은 소유자가 아니어도 선다.
    renderWorkspace(uuid(15))
    await screen.findByRole('heading', { name: '알고리즘 스터디' })

    const heading = screen.getByRole('heading', { name: '워크스페이스 나가기' })
    const card = heading.closest<HTMLElement>('div[class*="rounded"]')!
    expect(within(card).getByRole('button', { name: '워크스페이스 나가기' })).toBeInTheDocument()
    const members = screen
      .getByRole('heading', { name: /구성원 \(/ })
      .closest<HTMLElement>('div[class*="rounded"]')!
    expect(
      within(members).queryByRole('button', { name: '워크스페이스 나가기' }),
    ).not.toBeInTheDocument()
  })

  test('PERSONAL 워크스페이스는 안내 문구와 함께 구성원 관리가 비활성화된다', async () => {
    renderWorkspace(uuid(7))
    await screen.findByRole('heading', { name: '홍길동' })

    expect(
      screen.getByText(/개인 워크스페이스는 구성원을 추가하거나 역할을 변경할 수 없습니다/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '구성원 초대' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /대기 중인 초대/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '워크스페이스 나가기' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/역할 변경/)).not.toBeInTheDocument()
  })
})

describe('workspace detail: kind', () => {
  test('an owner reclassifies the workspace from 정보 수정', async () => {
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    await user.click(screen.getByRole('button', { name: '정보 수정' }))
    const dialog = await screen.findByRole('dialog', { name: '워크스페이스 정보 수정' })
    await user.selectOptions(within(dialog).getByLabelText('유형'), 'COURSE')
    await user.click(within(dialog).getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(screen.getByText('교과')).toBeInTheDocument()
    })
  })

  test('a personal workspace offers no kind select', async () => {
    const user = userEvent.setup()
    renderWorkspace(uuid(7))
    await screen.findByRole('heading', { name: '홍길동' })

    await user.click(screen.getByRole('button', { name: '정보 수정' }))
    const dialog = await screen.findByRole('dialog', { name: '워크스페이스 정보 수정' })
    expect(within(dialog).queryByLabelText('유형')).not.toBeInTheDocument()
  })

  test('an unknown kind renders its raw value rather than a blank', async () => {
    // 서버가 콘솔보다 먼저 배포되면 실제로 일어나는 일이다.
    server.use(
      http.get('*/api/v1/workspaces/:workspaceId', () =>
        HttpResponse.json({
          id: uuid(12),
          kind: 'SOMETHING_NEW',
          name: '캡스톤 3조',
          description: null,
          myRole: 'OWNER',
          members: [],
          createdAt: '2026-07-01T10:12:00+09:00',
        }),
      ),
    )
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    expect(screen.getByText('SOMETHING_NEW')).toBeInTheDocument()
  })
})

describe('워크스페이스 상세 — 구성원 관리', () => {
  test('소유자 지정은 이메일 입력으로 확인한 뒤에만 실행된다', async () => {
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    await user.selectOptions(screen.getByLabelText('김철수 역할 변경'), 'OWNER')

    const dialog = await screen.findByRole('dialog', { name: '소유자 지정' })
    expect(within(dialog).getByText(/님을 소유자로 지정합니다/)).toBeInTheDocument()
    const confirmButton = within(dialog).getByRole('button', { name: '소유자로 지정' })
    expect(confirmButton).toBeDisabled()

    await user.type(
      within(dialog).getByLabelText('확인 이메일'),
      'cheolsu.kim@pusan.ac.kr',
    )
    expect(confirmButton).toBeEnabled()
    await user.click(confirmButton)

    // 소유자는 여러 명일 수 있다 — 지정해도 내 소유자 권한은 그대로다.
    await waitFor(() =>
      expect(screen.getByLabelText('김철수 역할 변경')).toHaveValue('OWNER'),
    )
    const myRow = screen.getByText('(나)').closest('tr')!
    expect(within(myRow).getByText('소유자')).toBeInTheDocument()
    // 내가 여전히 소유자이므로 관리 UI도 남는다.
    expect(screen.getByRole('heading', { name: '구성원 초대' })).toBeInTheDocument()
  })

  test('유일한 OWNER가 나가려 하면 409 안내를 보여준다', async () => {
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    await user.click(screen.getByRole('button', { name: '워크스페이스 나가기' }))
    const dialog = await screen.findByRole('dialog', { name: '워크스페이스 나가기' })
    await user.click(within(dialog).getByRole('button', { name: '나가기' }))

    expect(
      await screen.findByText('소유권을 다른 구성원에게 이전한 뒤 다시 시도해 주세요.'),
    ).toBeInTheDocument()
  })

  test('구성원은 워크스페이스를 나가면 워크스페이스 목록으로 이동한다', async () => {
    const user = userEvent.setup()
    renderWorkspace(uuid(15))
    await screen.findByRole('heading', { name: '알고리즘 스터디' })

    await user.click(screen.getByRole('button', { name: '워크스페이스 나가기' }))
    const dialog = await screen.findByRole('dialog', { name: '워크스페이스 나가기' })
    await user.click(within(dialog).getByRole('button', { name: '나가기' }))

    expect(await screen.findByRole('heading', { name: '내 워크스페이스' })).toBeInTheDocument()
    expect(screen.queryByText('알고리즘 스터디')).not.toBeInTheDocument()
  })
})

describe('workspace detail: invitations', () => {
  const inviteField = () => screen.getByLabelText(/이메일 또는 학번/)

  test('each line gets its own outcome, in the order it was typed', async () => {
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    await user.type(
      inviteField(),
      [
        'sujin.choi@pusan.ac.kr',
        '',
        'newcomer@pusan.ac.kr',
        'cheolsu.kim@pusan.ac.kr',
        'jiwoo.han@pusan.ac.kr',
        'newcomer@pusan.ac.kr',
        '202312345',
      ].join('{Enter}'),
    )
    await user.click(screen.getByRole('button', { name: '초대' }))

    const results = await screen.findByRole('region', { name: '초대 결과' })
    const rows = within(results).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      'sujin.choi@pusan.ac.kr구성원으로 추가됨',
      'newcomer@pusan.ac.kr초대함, 가입하면 자동으로 구성원이 됩니다',
      'cheolsu.kim@pusan.ac.kr이미 구성원',
      'jiwoo.han@pusan.ac.kr이미 초대함',
      'newcomer@pusan.ac.kr같은 입력이 두 번 있음',
      '202312345이미 구성원',
    ])
    expect(inviteField()).toHaveValue('')

    // The member list and the pending list are both refetched.
    const members = screen.getByRole('heading', { name: /구성원 \(/ }).closest('div[class*="rounded"]')!
    expect(await within(members as HTMLElement).findByText('최수진')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '대기 중인 초대 (2건)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'newcomer@pusan.ac.kr 초대 취소' })).toBeInTheDocument()
  })

  test('the request sends a line with @ as an email and anything else as a student number', async () => {
    let sent: unknown = null
    server.use(
      http.post('*/api/v1/workspaces/:workspaceId/invitations', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ results: [] })
      }),
    )
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    await user.type(inviteField(), '  a@pusan.ac.kr  {Enter}{Enter}   {Enter}202399999')
    await user.click(screen.getByRole('button', { name: '초대' }))

    await waitFor(() =>
      expect(sent).toEqual({ entries: [{ email: 'a@pusan.ac.kr' }, { studentNo: '202399999' }] }),
    )
  })

  test('an empty field is refused before any request', async () => {
    let calls = 0
    server.use(
      http.post('*/api/v1/workspaces/:workspaceId/invitations', () => {
        calls += 1
        return HttpResponse.json({ results: [] })
      }),
    )
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    await user.click(screen.getByRole('button', { name: '초대' }))
    expect(
      await screen.findByText('초대할 사람의 이메일이나 학번을 입력해 주세요.'),
    ).toBeInTheDocument()
    expect(calls).toBe(0)
  })

  test('a line with no student number is named and nothing is sent', async () => {
    let calls = 0
    server.use(
      http.post('*/api/v1/workspaces/:workspaceId/invitations', () => {
        calls += 1
        return HttpResponse.json({ results: [] })
      }),
    )
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    await user.click(inviteField())
    await user.paste('1\t정보컴퓨터공학부\t202399999\t김학생\n2\t정보컴퓨터공학부\t이름만')
    await user.click(screen.getByRole('button', { name: '초대' }))

    expect(await screen.findByText('2번째 줄 (2 정보컴퓨터공학부 이름만): 학번을 찾지 못했습니다.')).toBeInTheDocument()
    expect(calls).toBe(0)
  })

  test('attendance rows send only the student number', async () => {
    let sent: unknown = null
    server.use(
      http.post('*/api/v1/workspaces/:workspaceId/invitations', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ results: [] })
      }),
    )
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    await user.click(inviteField())
    await user.paste('번호\t학과\t학번\t이름\r\n1\t정보컴퓨터공학부\t202399999\t김학생\r\n')
    await user.click(screen.getByRole('button', { name: '초대' }))

    await waitFor(() => expect(sent).toEqual({ entries: [{ studentNo: '202399999' }] }))
  })

  test('more than 200 lines go in consecutive calls of at most 200', async () => {
    const sizes: number[] = []
    server.use(
      http.post('*/api/v1/workspaces/:workspaceId/invitations', async ({ request }) => {
        const body = (await request.json()) as { entries: { email: string }[] }
        sizes.push(body.entries.length)
        return HttpResponse.json({
          results: body.entries.map((entry) => ({ email: entry.email, outcome: 'INVITED' })),
        })
      }),
    )
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    const lines = Array.from({ length: 201 }, (_, i) => `user${i}@pusan.ac.kr`).join('\n')
    await user.click(inviteField())
    await user.paste(lines)
    await user.click(screen.getByRole('button', { name: '초대' }))

    const results = await screen.findByRole('region', { name: '초대 결과' })
    expect(within(results).getAllByRole('listitem')).toHaveLength(201)
    expect(sizes).toEqual([200, 1])
    expect(inviteField()).toHaveValue('')
  })

  test('a 429 stops the run and leaves only the unsent lines in the field', async () => {
    let calls = 0
    server.use(
      http.post('*/api/v1/workspaces/:workspaceId/invitations', async ({ request }) => {
        calls += 1
        if (calls > 1) {
          return HttpResponse.json(
            {
              type: 'about:blank',
              title: '요청이 너무 많습니다',
              status: 429,
              detail: '초대 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
              code: 'RATE_LIMITED',
            },
            { status: 429, headers: { 'Content-Type': 'application/problem+json' } },
          )
        }
        const body = (await request.json()) as { entries: { email: string }[] }
        return HttpResponse.json({
          results: body.entries.map((entry) => ({ email: entry.email, outcome: 'INVITED' })),
        })
      }),
    )
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    const lines = Array.from({ length: 401 }, (_, i) => `user${i}@pusan.ac.kr`).join('\n')
    await user.click(inviteField())
    await user.paste(lines)
    await user.click(screen.getByRole('button', { name: '초대' }))

    expect(
      await screen.findByText('초대 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument()
    const results = screen.getByRole('region', { name: '초대 결과' })
    expect(within(results).getAllByRole('listitem')).toHaveLength(200)
    expect(calls).toBe(2)
    // What was sent leaves the field, so sending again starts from line 201.
    expect(inviteField()).toHaveValue(lines.split('\n').slice(200).join('\n'))
  })

  test('a network failure in a later call keeps the earlier results', async () => {
    let calls = 0
    server.use(
      http.post('*/api/v1/workspaces/:workspaceId/invitations', async ({ request }) => {
        calls += 1
        if (calls > 1) return HttpResponse.error()
        const body = (await request.json()) as { entries: { email: string }[] }
        return HttpResponse.json({
          results: body.entries.map((entry) => ({ email: entry.email, outcome: 'INVITED' })),
        })
      }),
    )
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    const lines = Array.from({ length: 201 }, (_, i) => `user${i}@pusan.ac.kr`).join('\n')
    await user.click(inviteField())
    await user.paste(lines)
    await user.click(screen.getByRole('button', { name: '초대' }))

    expect(await screen.findByText('구성원을 초대하지 못했습니다.')).toBeInTheDocument()
    const results = screen.getByRole('region', { name: '초대 결과' })
    expect(within(results).getAllByRole('listitem')).toHaveLength(200)
    expect(inviteField()).toHaveValue('user200@pusan.ac.kr')
  })

  test('more than 500 people get a notice of the hourly limit but are not refused', async () => {
    let calls = 0
    server.use(
      http.post('*/api/v1/workspaces/:workspaceId/invitations', async ({ request }) => {
        calls += 1
        const body = (await request.json()) as { entries: { email: string }[] }
        return HttpResponse.json({
          results: body.entries.map((entry) => ({ email: entry.email, outcome: 'INVITED' })),
        })
      }),
    )
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    await user.click(inviteField())
    await user.paste(Array.from({ length: 500 }, (_, i) => `user${i}@pusan.ac.kr`).join('\n'))
    const notice = '한 시간에 500명까지 초대할 수 있습니다. 나머지는 한 시간 뒤에 보내 주세요.'
    expect(screen.queryByText(notice)).not.toBeInTheDocument()
    await user.type(inviteField(), '{Enter}late@pusan.ac.kr')
    expect(screen.getByText(notice)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '초대' }))
    await screen.findByRole('region', { name: '초대 결과' })
    expect(calls).toBe(3)
  })

  test('a 422 in a later call names the line in what is left of the field', async () => {
    let calls = 0
    server.use(
      http.post('*/api/v1/workspaces/:workspaceId/invitations', async ({ request }) => {
        calls += 1
        const body = (await request.json()) as { entries: { email: string }[] }
        if (calls === 1) {
          return HttpResponse.json({
            results: body.entries.map((entry) => ({ email: entry.email, outcome: 'INVITED' })),
          })
        }
        return HttpResponse.json(
          {
            type: 'about:blank',
            title: '입력값을 확인해 주세요',
            status: 422,
            detail: '요청 값을 확인해 주세요.',
            code: 'VALIDATION_FAILED',
            errors: [{ field: 'entries[0].email', message: '이메일 형식이 아닙니다.' }],
          },
          { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
        )
      }),
    )
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    const lines = Array.from({ length: 201 }, (_, i) => `user${i}@pusan.ac.kr`).join('\n')
    await user.click(inviteField())
    await user.paste(lines)
    await user.click(screen.getByRole('button', { name: '초대' }))

    expect(
      await screen.findByText('1번째 줄 (user200@pusan.ac.kr): 이메일 형식이 아닙니다.'),
    ).toBeInTheDocument()
  })

  test('the preview resolves student numbers in calls of at most 500 and lists every line', async () => {
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    const numbers = Array.from({ length: 501 }, (_, i) => String(202300000 + i))
    numbers[0] = '202312345'
    numbers[1] = '202312346'
    await user.click(inviteField())
    await user.paste([...numbers, 'someone@pusan.ac.kr', '202312345', 'x'].join('\n'))
    await user.click(screen.getByRole('button', { name: '미리보기' }))

    const table = await screen.findByRole('table', { name: '명단 미리보기' })
    expect(rosterResolveCalls.map((call) => call.studentNos.length)).toEqual([500, 2])
    expect(rosterResolveCalls[0].orgId).toBeNull()
    expect(within(table).getByRole('columnheader', { name: '이메일 또는 학번' })).toBeInTheDocument()
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(1 + 504)
    expect(within(rows[1]).getByText('구성원')).toBeInTheDocument()
    expect(within(rows[1]).getByText('이영희')).toBeInTheDocument()
    expect(within(rows[2]).getByText('가입한 계정')).toBeInTheDocument()
    // Only a member's account is named.
    expect(within(rows[2]).queryByText('최수진')).not.toBeInTheDocument()
    expect(within(rows[3]).getByText('새 초대')).toBeInTheDocument()
    expect(within(rows[502]).getByText('이메일')).toBeInTheDocument()
    // A repeat is marked here, not sent again in a later call.
    expect(within(rows[503]).getByText('중복')).toBeInTheDocument()
    expect(within(rows[504]).getByText('형식 오류')).toBeInTheDocument()
    expect(
      screen.getByText('구성원 1명, 가입한 계정 1명, 새 초대 499명, 형식 오류 1명, 중복 1명, 이메일 1명'),
    ).toHaveAttribute('role', 'status')

    // Editing the text drops a preview made from the old one.
    await user.type(inviteField(), '{Enter}202399999')
    expect(screen.queryByRole('table', { name: '명단 미리보기' })).not.toBeInTheDocument()
  })

  test('a 429 from the preview shows the server message', async () => {
    server.use(
      http.post('*/api/v1/workspaces/:workspaceId/roster/resolve', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: '요청이 너무 많습니다',
            status: 429,
            detail: '명단 확인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
            code: 'RATE_LIMITED',
          },
          { status: 429, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    await user.type(inviteField(), '202399999')
    await user.click(screen.getByRole('button', { name: '미리보기' }))

    expect(
      await screen.findByText('명단 확인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: '명단 미리보기' })).not.toBeInTheDocument()
  })

  test('a 429 shows the server message', async () => {
    server.use(
      http.post('*/api/v1/workspaces/:workspaceId/invitations', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: '요청이 너무 많습니다',
            status: 429,
            detail: '초대 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
            code: 'RATE_LIMITED',
          },
          { status: 429, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    await user.type(inviteField(), 'someone@pusan.ac.kr')
    await user.click(screen.getByRole('button', { name: '초대' }))

    expect(
      await screen.findByText('초대 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '초대 결과' })).not.toBeInTheDocument()
  })

  test('a 422 names the line the owner typed, not the request index', async () => {
    server.use(
      http.post('*/api/v1/workspaces/:workspaceId/invitations', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: '입력값을 확인해 주세요',
            status: 422,
            detail: '요청 값을 확인해 주세요.',
            code: 'VALIDATION_FAILED',
            errors: [{ field: 'entries[1].studentNo', message: '학번 형식이 아닙니다.' }],
          },
          { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    // Entry 1 is on line 3: the blank line 2 is not sent.
    await user.type(inviteField(), 'a@pusan.ac.kr{enter}{enter}x')
    await user.click(screen.getByRole('button', { name: '초대' }))

    expect(await screen.findByText('3번째 줄 (x): 학번 형식이 아닙니다.')).toBeInTheDocument()
  })

  test('an outcome this build does not know renders its raw value', async () => {
    server.use(
      http.post('*/api/v1/workspaces/:workspaceId/invitations', () =>
        HttpResponse.json({ results: [{ email: 'x@pusan.ac.kr', outcome: 'SOMETHING_NEW' }] }),
      ),
    )
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    await user.type(inviteField(), 'x@pusan.ac.kr')
    await user.click(screen.getByRole('button', { name: '초대' }))

    const results = await screen.findByRole('region', { name: '초대 결과' })
    expect(within(results).getByText('SOMETHING_NEW')).toBeInTheDocument()
  })

  test('pending invitations show who invited and when, and cancel after a confirm', async () => {
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '대기 중인 초대 (1건)' })

    const row = screen.getByText('jiwoo.han@pusan.ac.kr').closest('tr')!
    expect(within(row).getByText('2026-09-20 14:30')).toBeInTheDocument()
    expect(within(row).getByText('홍길동')).toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: 'jiwoo.han@pusan.ac.kr 초대 취소' }))
    const dialog = await screen.findByRole('dialog', { name: '초대 취소' })
    expect(within(dialog).getByText('jiwoo.han@pusan.ac.kr 초대를 취소합니다.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '초대 취소' }))

    expect(await screen.findByText('대기 중인 초대가 없습니다.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '대기 중인 초대 (0건)' })).toBeInTheDocument()
  })
})

describe('워크스페이스 상세 — 워크스페이스 삭제', () => {
  test('OWNER는 워크스페이스 삭제 카드를 본다', async () => {
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })
    expect(screen.getByRole('heading', { name: '워크스페이스 삭제' })).toBeInTheDocument()
  })

  test('PERSONAL 워크스페이스에는 삭제 카드가 없다', async () => {
    renderWorkspace(uuid(7))
    await screen.findByRole('heading', { name: '홍길동' })
    expect(screen.queryByRole('heading', { name: '워크스페이스 삭제' })).not.toBeInTheDocument()
  })

  test('MEMBER에게는 삭제 카드가 없다', async () => {
    renderWorkspace(uuid(15))
    await screen.findByRole('heading', { name: '알고리즘 스터디' })
    expect(screen.queryByRole('heading', { name: '워크스페이스 삭제' })).not.toBeInTheDocument()
  })

  test('이름을 정확히 입력해야 삭제되고, 이후 워크스페이스 목록으로 이동한다', async () => {
    const user = userEvent.setup()
    renderWorkspace(uuid(12))
    await screen.findByRole('heading', { name: '캡스톤 3조' })

    await user.click(screen.getByRole('button', { name: '워크스페이스 삭제' }))
    const dialog = await screen.findByRole('dialog', { name: '워크스페이스 삭제' })
    const confirm = within(dialog).getByRole('button', { name: '워크스페이스 삭제' })
    expect(confirm).toBeDisabled()

    await user.type(within(dialog).getByRole('textbox'), '캡스톤 3조')
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    expect(await screen.findByRole('heading', { name: '내 워크스페이스' })).toBeInTheDocument()
  })
})
