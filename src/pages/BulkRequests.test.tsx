import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { http, HttpResponse } from 'msw'
import type { components } from '../api/schema'
import { adminRequestStore, retriedRecipients } from '../test/msw/handlers/admin'
import {
  orgAdminUser,
  orgViewerUser,
  refreshSuccessHandler,
  regularUser,
} from '../test/msw/handlers/auth'
import { createdRequestBodies, requestStore } from '../test/msw/handlers/requests'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'
import { uuid } from '../test/msw/ids'

type User = ReturnType<typeof userEvent.setup>
type RequestDetail = components['schemas']['RequestDetailResponse']
type Recipient = components['schemas']['RequestRecipientResponse']

async function fillResourceStep(user: User) {
  await user.type(await screen.findByLabelText('이름'), '실습 서버')
  await user.click(screen.getByRole('radio', { name: 'Ubuntu' }))
  await user.click(screen.getByRole('radio', { name: /컴퓨팅 최적화/ }))
  await user.click(screen.getByRole('button', { name: '다음' }))
}

function recipientsFieldset() {
  return screen.getByRole('group', { name: /대상자/ })
}

describe('bulk request wizard for a workspace owner', () => {
  test('lists members and pending invitations and sends the chosen ones', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/requests/new?kind=VM')

    await fillResourceStep(user)
    await user.click(await screen.findByRole('radio', { name: '캡스톤 3조' }))
    await user.click(screen.getByRole('radio', { name: '정보컴퓨터공학부 실습지원센터' }))
    await user.type(screen.getByLabelText('사용 목적'), '실습 수업 서버')
    await user.click(screen.getByRole('radio', { name: /이번 학기/ }))

    const group = await waitFor(() => recipientsFieldset())
    expect(within(group).getByText('고르지 않으면 본인에게 신청합니다.')).toBeInTheDocument()
    await user.click(await within(group).findByRole('checkbox', { name: /김철수/ }))
    await user.click(await within(group).findByRole('checkbox', { name: /jiwoo\.han@pusan\.ac\.kr/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(
      await screen.findByText('2명 (김철수, jiwoo.han@pusan.ac.kr)'),
    ).toBeInTheDocument()
    // Each VM gets a generated name, so the host name is neither asked nor listed.
    expect(screen.queryByText('호스트 이름')).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: '수정' })[0])
    await screen.findByLabelText('이름')
    expect(screen.queryByLabelText('호스트 이름')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다음' }))
    await user.click(await screen.findByRole('button', { name: '다음' }))

    await user.click(await screen.findByRole('button', { name: '신청 제출' }))
    expect(await screen.findByText('신청이 접수되었습니다')).toBeInTheDocument()
    const body = createdRequestBodies.at(-1)!
    expect(body.recipients).toEqual([{ userId: uuid(57) }, { invitationId: uuid(3101) }])
    expect(body.vm?.desiredSlug).toBeNull()
    expect(body.approval).toBeUndefined()
  })

  test('a request with no one chosen carries no recipients', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/requests/new?kind=VM')

    await fillResourceStep(user)
    await user.click(await screen.findByRole('radio', { name: '캡스톤 3조' }))
    await user.click(screen.getByRole('radio', { name: '정보컴퓨터공학부 실습지원센터' }))
    await user.type(screen.getByLabelText('사용 목적'), '실습 수업 서버')
    await user.click(screen.getByRole('radio', { name: /이번 학기/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))
    await user.click(await screen.findByRole('button', { name: '신청 제출' }))

    await screen.findByText('신청이 접수되었습니다')
    expect(createdRequestBodies.at(-1)).not.toHaveProperty('recipients')
  })

  test('a plain member who approves nowhere is not offered recipients', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-user'))
    renderApp('/console/requests/new?kind=VM')

    await fillResourceStep(user)
    await user.click(await screen.findByRole('radio', { name: '데이터베이스 실습' }))
    await user.click(screen.getByRole('radio', { name: '정보컴퓨터공학부 실습지원센터' }))
    expect(screen.queryByRole('group', { name: /대상자/ })).not.toBeInTheDocument()
  })
})

describe('bulk request from the administration area', () => {
  test('the requests page offers the entry to approvers only', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    const first = renderApp('/admin/requests')
    expect(await screen.findByRole('link', { name: '새 신청' })).toHaveAttribute(
      'href',
      expect.stringContaining('/admin/requests/new'),
    )
    first.unmount()

    server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
    renderApp('/admin/requests')
    await screen.findByRole('heading', { name: '승인 대기' })
    expect(screen.queryByRole('link', { name: '새 신청' })).not.toBeInTheDocument()
  })

  test('the picker offers only the kinds that can be filed for several people', async () => {
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp('/admin/requests/new')

    expect(await screen.findByRole('radio', { name: /가상머신/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /LLM API 키/ })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /도메인/ })).not.toBeInTheDocument()
  })

  test('an approver can also name people who were invited but have not joined', async () => {
    const user = userEvent.setup()
    server.use(
      refreshSuccessHandler('access-org-admin', orgAdminUser),
      http.get('*/api/v1/admin/workspaces/:workspaceId/invitations', () =>
        HttpResponse.json([
          {
            id: uuid(77),
            email: 'newcomer@pusan.ac.kr',
            role: 'MEMBER',
            invitedAt: '2026-09-27T00:00:00Z',
            invitedBy: { id: uuid(1), name: '초대한 사람' },
          },
        ]),
      ),
    )
    renderApp(`/admin/requests/new?kind=VM&org=${uuid(1)}`)

    await fillResourceStep(user)
    await user.click(await screen.findByRole('radio', { name: '정보컴퓨터공학부 실습지원센터' }))
    await user.click(await screen.findByRole('radio', { name: '캡스톤 3조' }))

    const group = await waitFor(() => recipientsFieldset())
    expect(await within(group).findByRole('checkbox', { name: /newcomer@pusan.ac.kr/ })).toBeInTheDocument()
  })

  test('submits for chosen members and approves in the same step', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp(`/admin/requests/new?kind=VM&org=${uuid(1)}`)

    await fillResourceStep(user)
    await user.click(await screen.findByRole('radio', { name: '정보컴퓨터공학부 실습지원센터' }))
    // Only organisations this account decides for are offered.
    expect(screen.queryByRole('radio', { name: '테스트 기관' })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('radio', { name: '캡스톤 3조' }))
    await user.type(screen.getByLabelText('사용 목적'), '실습 수업 서버')
    await user.click(screen.getByRole('radio', { name: /이번 학기/ }))

    const group = await waitFor(() => recipientsFieldset())
    expect(await within(group).findByRole('checkbox', { name: /홍길동/ })).toBeInTheDocument()
    // A withdrawn account can receive nothing.
    expect(within(group).queryByRole('checkbox', { name: /박탈퇴/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(await screen.findByText('대상자를 한 명 이상 선택해 주세요.')).toBeInTheDocument()

    await user.click(within(recipientsFieldset()).getByRole('checkbox', { name: /홍길동/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(await screen.findByRole('heading', { name: '승인 내용' })).toBeInTheDocument()
    expect(await screen.findByLabelText('vCPU')).toHaveValue(2)
    expect(screen.queryByLabelText('호스트 이름 확정')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '제출하고 승인' }))
    const dialog = await screen.findByRole('dialog', { name: '신청 승인' })
    await user.click(within(dialog).getByRole('button', { name: '제출하고 승인' }))

    expect(await screen.findByText('신청을 승인했습니다')).toBeInTheDocument()
    const body = createdRequestBodies.at(-1)!
    expect(body.recipients).toEqual([{ userId: uuid(42) }])
    expect(body.approval?.vm?.grantedVcpu).toBe(2)
    expect(body.approval?.vm?.grantedSlug).toBeNull()
    expect(body.approval?.grantedStartDate).toBeTruthy()
  })

  test('an LLM key request reaches the same approval form', async () => {
    const user = userEvent.setup()
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp(`/admin/requests/new?kind=LLM_API_KEY&org=${uuid(1)}`)

    await user.type(await screen.findByLabelText('이름'), '실습 키')
    await user.click(screen.getByRole('checkbox', { name: /Pickle LLM/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))
    await user.click(await screen.findByRole('radio', { name: '정보컴퓨터공학부 실습지원센터' }))
    await user.click(await screen.findByRole('radio', { name: '캡스톤 3조' }))
    await user.type(screen.getByLabelText('사용 목적'), '실습 수업')
    await user.click(screen.getByRole('radio', { name: /이번 학기/ }))
    await user.click(await within(await waitFor(() => recipientsFieldset())).findByRole('checkbox', { name: /전체 선택/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(await screen.findByRole('heading', { name: '승인 내용' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '제출하고 승인' }))
    const dialog = await screen.findByRole('dialog', { name: '신청 승인' })
    await user.click(within(dialog).getByRole('button', { name: '제출하고 승인' }))

    expect(await screen.findByText('신청을 승인했습니다')).toBeInTheDocument()
    const body = createdRequestBodies.at(-1)!
    expect(body.type).toBe('LLM_API_KEY')
    expect(body.recipients).toEqual([{ userId: uuid(42) }])
    expect(body.approval).toBeTruthy()
  })
})

function recipient(overrides: Partial<Recipient> & Pick<Recipient, 'id' | 'status'>): Recipient {
  return { userId: null, name: null, invitee: null, resourceId: null, reason: null, ...overrides }
}

function bulkRequest(base: RequestDetail, overrides: Partial<RequestDetail>): RequestDetail {
  return {
    ...base,
    status: 'APPROVED',
    review: {
      reviewerId: orgAdminUser.id,
      reviewerName: orgAdminUser.name,
      decision: 'APPROVE',
      comment: null,
      grantedStartDate: '2026-09-01',
      grantedEndDate: '2026-12-20',
      decidedAt: '2026-09-01T10:00:00+09:00',
    },
    ...overrides,
  }
}

const RECIPIENTS: Recipient[] = [
  recipient({ id: uuid(9001), userId: uuid(57), name: '김철수', status: 'CREATED', resourceId: uuid(8801) }),
  recipient({ id: uuid(9002), userId: uuid(58), name: '이영희', status: 'FAILED', reason: '기관 용량이 부족합니다.' }),
  recipient({ id: uuid(9003), invitee: 'jiwoo.han@pusan.ac.kr', status: 'PENDING_JOIN' }),
  recipient({
    id: uuid(9004),
    userId: uuid(59),
    name: '박민수',
    status: 'SOMETHING_NEW' as Recipient['status'],
  }),
]

describe('recipients on the administrator request detail', () => {
  test('shows each person, links the created resource and retries a failure', async () => {
    const user = userEvent.setup()
    adminRequestStore.push(
      bulkRequest(adminRequestStore[0], { id: uuid(299), recipients: RECIPIENTS.map((r) => ({ ...r })) }),
    )
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp(`/admin/requests/${uuid(299)}`)

    const table = await screen.findByRole('table', { name: '대상자' })
    const rows = within(table).getAllByRole('row')
    expect(within(rows[1]).getByText('생성됨')).toBeInTheDocument()
    expect(within(rows[1]).getByRole('link', { name: '상세 보기' })).toHaveAttribute(
      'href',
      `/admin/vms/${uuid(8801)}?org=${uuid(1)}`,
    )
    expect(within(rows[2]).getByText('실패')).toBeInTheDocument()
    expect(within(rows[2]).getByText('기관 용량이 부족합니다.')).toBeInTheDocument()
    expect(within(rows[3]).getByText('jiwoo.han@pusan.ac.kr')).toBeInTheDocument()
    expect(within(rows[3]).getByText('가입 대기')).toBeInTheDocument()
    // A value this build does not know shows as itself.
    expect(within(rows[4]).getByText('SOMETHING_NEW')).toBeInTheDocument()

    const retry = within(table).getAllByRole('button', { name: '다시 시도' })
    expect(retry).toHaveLength(1)
    await user.click(retry[0])
    await waitFor(() =>
      expect(retriedRecipients).toEqual([{ requestId: uuid(299), recipientId: uuid(9002) }]),
    )
    expect(await within(table).findByText('생성 대기')).toBeInTheDocument()
  })

  test('a viewer sees the table without the retry action', async () => {
    adminRequestStore.push(
      bulkRequest(adminRequestStore[0], { id: uuid(299), recipients: RECIPIENTS.map((r) => ({ ...r })) }),
    )
    server.use(refreshSuccessHandler('access-org-viewer', orgViewerUser))
    renderApp(`/admin/requests/${uuid(299)}`)

    const table = await screen.findByRole('table', { name: '대상자' })
    expect(within(table).getByText('실패')).toBeInTheDocument()
    expect(within(table).queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
  })

  test('approving a bulk VM request settles no single host name', async () => {
    adminRequestStore.push({
      ...adminRequestStore[0],
      id: uuid(298),
      recipients: [recipient({ id: uuid(9101), userId: uuid(57), name: '김철수', status: 'QUEUED' })],
    })
    server.use(refreshSuccessHandler('access-org-admin', orgAdminUser))
    renderApp(`/admin/requests/${uuid(298)}`)

    expect(await screen.findByLabelText('vCPU')).toBeInTheDocument()
    expect(screen.queryByLabelText('호스트 이름 확정')).not.toBeInTheDocument()
  })
})

describe('recipients on the applicant request detail', () => {
  test('links only the viewer own resource and offers no retry', async () => {
    requestStore.push(
      bulkRequest(requestStore[0], {
        id: uuid(399),
        recipients: [
          recipient({ id: uuid(9201), userId: regularUser.id, name: regularUser.name, status: 'CREATED', resourceId: uuid(8802) }),
          recipient({ id: uuid(9202), userId: uuid(57), name: '김철수', status: 'CREATED', resourceId: uuid(8803) }),
          recipient({ id: uuid(9203), userId: uuid(58), name: '이영희', status: 'FAILED', reason: '기관 용량이 부족합니다.' }),
        ],
      }),
    )
    server.use(refreshSuccessHandler('access-user'))
    renderApp(`/console/requests/${uuid(399)}`)

    const table = await screen.findByRole('table', { name: '대상자' })
    const links = within(table).getAllByRole('link', { name: '상세 보기' })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', `/console/vms/${uuid(8802)}`)
    expect(within(table).queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
  })

  test('an ordinary request shows no recipients table', async () => {
    server.use(refreshSuccessHandler('access-user'))
    renderApp(`/console/requests/${uuid(101)}`)

    await screen.findByRole('heading', { name: '신청 상세' })
    expect(screen.queryByRole('table', { name: '대상자' })).not.toBeInTheDocument()
  })
})
