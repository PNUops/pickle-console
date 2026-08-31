import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, test } from 'vitest'
import type { ApproveRequest, RequestDetail } from '../../api/queries'
import { orgAdminUser, refreshSuccessHandler } from '../../test/msw/handlers/auth'
import { server } from '../../test/msw/server'
import { renderApp } from '../../test/render'
import { uuid } from '../../test/msw/ids'
import { openRouterAccountStore } from '../../test/msw/handlers/openrouter-accounts'

const REQUEST_ID = uuid(301)

function llmKeyRequest(spec: Partial<NonNullable<RequestDetail['llmKey']>>): RequestDetail {
  return {
    id: REQUEST_ID,
    workspaceId: uuid(12),
    workspaceName: '캡스톤 3조',
    orgId: uuid(1),
    orgName: '정보컴퓨터공학부 실습지원센터',
    requesterId: uuid(42),
    requesterName: '홍길동',
    type: 'LLM_API_KEY',
    purpose: '캡스톤 챗봇 개발',
    courseOrProject: '2026-1 캡스톤디자인 3조',
    extraNote: null,
    reqStartDate: '2026-07-15',
    reqEndDate: '2026-12-20',
    displayName: '캡스톤 챗봇 키',
    llmKey: {
      usagePlan: '문서 요약 배치 작업',
      reqRpm: null,
      reqTpm: null,
      reqDailyTokens: null,
      grantedRpm: null,
      grantedTpm: null,
      grantedConcurrency: null,
      grantedDailyTokens: null,
      ...spec,
    },
    status: 'SUBMITTED',
    review: null,
    createdAt: '2026-07-08T11:30:00+09:00',
    updatedAt: '2026-07-08T11:30:00+09:00',
  }
}

/**
 * 이 종류의 신청 하나를 상세 화면에 띄운다.
 *
 * 공유 픽스처(승인 대기 큐의 시드)를 건드리지 않고 이 파일 안에서만 응답을
 * 갈아끼운다 — 큐의 건수를 세는 다른 테스트가 함께 흔들리지 않게 한다.
 */
function renderDetail(spec: Partial<NonNullable<RequestDetail['llmKey']>> = {}) {
  const detail = { current: llmKeyRequest(spec) }
  const approved: ApproveRequest[] = []
  server.use(
    refreshSuccessHandler('access-org-admin', orgAdminUser),
    http.get('*/api/v1/admin/requests/:requestId', () =>
      HttpResponse.json(detail.current, { status: 200 }),
    ),
    http.post('*/api/v1/admin/requests/:requestId/approve', async ({ request }) => {
      const body = (await request.json()) as ApproveRequest
      approved.push(body)
      detail.current = {
        ...detail.current,
        status: 'APPROVED',
        llmKey: {
          ...(detail.current.llmKey ?? {}),
          grantedRpm: body.llmKey?.grantedRpm ?? null,
          grantedTpm: body.llmKey?.grantedTpm ?? null,
          grantedConcurrency: body.llmKey?.grantedConcurrency ?? null,
          grantedDailyTokens: body.llmKey?.grantedDailyTokens ?? null,
        },
        review: {
          reviewerId: orgAdminUser.id,
          reviewerName: orgAdminUser.name,
          decision: 'APPROVE',
          comment: body.comment ?? null,
          grantedStartDate: body.grantedStartDate ?? null,
          grantedEndDate: body.grantedEndDate ?? null,
          decidedAt: '2026-07-08T17:00:00+09:00',
        },
      }
      return HttpResponse.json(detail.current, { status: 200 })
    }),
  )
  renderApp(`/admin/requests/${REQUEST_ID}`)
  return approved
}

describe('LLM API 키 신청 — 관리자 신청 내용', () => {
  test('비어 있는 희망 한도는 빠뜨린 값이 아니라 기본값으로 읽힌다', async () => {
    renderDetail({ reqRpm: 1000 })

    await screen.findByRole('heading', { name: '신청 상세' })
    const rpm = screen.getByText('희망 분당 요청 수').closest('div')!
    expect(within(rpm).getByText('1,000')).toBeInTheDocument()
    const tpm = screen.getByText('희망 분당 토큰 수').closest('div')!
    expect(within(tpm).getByText('서비스 기본값')).toBeInTheDocument()
    expect(screen.getByText('문서 요약 배치 작업')).toBeInTheDocument()
    // 이 종류에는 결정용 카탈로그가 없으므로 결정 폼이 곧바로 열린다.
    expect(screen.getByRole('button', { name: '승인하기' })).toBeInTheDocument()
  })
})

describe('LLM API 키 신청 — 승인 폼', () => {
  test('희망값을 부여값으로 자동으로 채우지 않고, 참고로만 보여준다', async () => {
    renderDetail({ reqRpm: 1000, reqTpm: 50000, reqDailyTokens: 2000000 })

    await screen.findByRole('heading', { name: '신청 상세' })
    // 부여 칸은 비어 있다 — 승인자가 희망값을 보고 직접 정한다.
    expect(screen.getByLabelText('부여 분당 요청 수')).toHaveValue(null)
    expect(screen.getByLabelText('부여 분당 토큰 수')).toHaveValue(null)
    expect(screen.getByLabelText('부여 일일 토큰 수')).toHaveValue(null)
    expect(screen.getByLabelText('부여 동시 요청 수')).toHaveValue(null)
    // 그래도 희망값은 보인다.
    expect(
      screen.getByText('신청 희망값 1,000. 비우면 서비스 기본값이 적용됩니다.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('신청 희망값 50,000. 비우면 서비스 기본값이 적용됩니다.'),
    ).toBeInTheDocument()
    // 동시 요청 수만은 신청에 대응하는 항목이 없다는 사실을 화면이 말한다.
    expect(
      screen.getByText(
        '신청서에 대응하는 항목이 없어 승인자만 정합니다. 비우면 서비스 기본값이 적용됩니다.',
      ),
    ).toBeInTheDocument()
    // 기간은 종류를 가리지 않는 공통 축이라 신청 기간에서 시작한다.
    expect(screen.getByLabelText('사용 시작일')).toHaveValue('2026-07-15')
  })

  test('희망값을 적지 않은 신청도 그 사실을 그대로 말한다', async () => {
    renderDetail()

    await screen.findByRole('heading', { name: '신청 상세' })
    expect(
      screen.getAllByText(
        '신청자가 희망값을 적지 않았습니다. 비우면 서비스 기본값이 적용됩니다.',
      ),
    ).toHaveLength(3)
  })

  test('전부 비운 채로 승인하면 기본 한도로 부여된다', async () => {
    const user = userEvent.setup()
    const approved = renderDetail({ reqRpm: 1000 })

    await screen.findByRole('heading', { name: '신청 상세' })
    await user.click(screen.getByRole('button', { name: '승인하기' }))

    const dialog = await screen.findByRole('dialog', { name: '신청 승인' })
    expect(within(dialog).getByText('분당 요청 수 서비스 기본값')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '승인 확정' }))

    expect(
      await screen.findByText(
        '신청을 승인했습니다. 신청자가 LLM API 키를 발급받을 수 있습니다.',
      ),
    ).toBeInTheDocument()
    // 네 항목이 모두 비어 있어도 llmKey 자체는 실려 나간다 (계약이 요구한다).
    expect(approved).toEqual([
      {
        grantedStartDate: '2026-07-15',
        grantedEndDate: '2026-12-20',
        comment: null,
        llmKey: {
          grantedRpm: null,
          grantedTpm: null,
          grantedConcurrency: null,
          grantedDailyTokens: null,
          grantedCreditLimit: null,
          grantedCreditLimitReset: null,
          openrouterAccountId: null,
        },
      },
    ])
  })

  test('금액 한도를 적으면 리셋 창과 함께 부여값으로 나간다', async () => {
    const user = userEvent.setup()
    const approved = renderDetail({})

    await screen.findByRole('heading', { name: '신청 상세' })
    await user.type(screen.getByLabelText('부여 금액 한도 (USD)'), '5')
    await user.selectOptions(screen.getByLabelText('금액 한도 리셋 창'), 'MONTHLY')
    await user.selectOptions(screen.getByLabelText('OpenRouter 사업 계정'), uuid(410))
    await user.click(screen.getByRole('button', { name: '승인하기' }))

    const dialog = await screen.findByRole('dialog', { name: '신청 승인' })
    expect(within(dialog).getByText('금액 한도 $5')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '승인 확정' }))

    await screen.findByText('검토 결과')
    expect(approved[0].llmKey).toMatchObject({
      grantedCreditLimit: 5,
      grantedCreditLimitReset: 'MONTHLY',
      openrouterAccountId: uuid(410),
    })
  })

  test('금액 없이 리셋 창만 고르면 확인 모달 앞에서 걸린다', async () => {
    const user = userEvent.setup()
    const approved = renderDetail({})

    await screen.findByRole('heading', { name: '신청 상세' })
    await user.selectOptions(screen.getByLabelText('금액 한도 리셋 창'), 'DAILY')
    await user.click(screen.getByRole('button', { name: '승인하기' }))

    expect(
      await screen.findByText('리셋 창을 두려면 0보다 큰 금액 한도가 필요합니다.'),
    ).toBeInTheDocument()
    expect(approved).toHaveLength(0)
  })

  test('eligible account가 없으면 금액 축만 막고 계정 관리 deep link를 제공한다', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/v1/admin/llm/accounts', () => HttpResponse.json([])),
    )
    const approved = renderDetail({})

    await screen.findByRole('heading', { name: '신청 상세' })
    expect(await screen.findByRole('link', { name: 'OpenRouter 사업 계정 관리' })).toHaveAttribute(
      'href',
      `/admin/llm/accounts?org=${uuid(1)}`,
    )
    await user.type(screen.getByLabelText('부여 금액 한도 (USD)'), '5')
    await user.click(screen.getByRole('button', { name: '승인하기' }))
    expect(await screen.findByText('검증된 management credential이 있는 활성 사업 계정이 필요합니다.')).toBeInTheDocument()
    expect(approved).toHaveLength(0)
  })

  test('eligible account가 하나면 금액 축 승인에서 자동 선택하고 불변 binding을 확인한다', async () => {
    const user = userEvent.setup()
    const only = openRouterAccountStore.find((account) => account.id === uuid(410))!
    server.use(
      http.get('*/api/v1/admin/llm/accounts', () => HttpResponse.json([only])),
    )
    const approved = renderDetail({})

    await screen.findByRole('heading', { name: '신청 상세' })
    expect(await screen.findByText(/AI 교육 사업 A 하나만 binding 가능/)).toBeInTheDocument()
    expect(screen.queryByLabelText('OpenRouter 사업 계정')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('부여 금액 한도 (USD)'), '3')
    await user.click(screen.getByRole('button', { name: '승인하기' }))
    const dialog = within(await screen.findByRole('dialog', { name: '신청 승인' }))
    expect(dialog.getByText(/binding은 발급 뒤 바꿀 수 없습니다/)).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: '승인 확정' }))
    expect(approved[0].llmKey?.openrouterAccountId).toBe(uuid(410))
  })

  test('account 조회 실패에도 TOKEN-only 승인과 반려 form은 살아 있다', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/v1/admin/llm/accounts', () =>
        HttpResponse.json(
          { title: '오류', status: 500, detail: '사업 계정 조회 실패', code: 'INTERNAL_ERROR' },
          { status: 500, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    const approved = renderDetail({})

    expect(await screen.findByText('사업 계정 목록을 불러오지 못했습니다')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '반려' }))
    expect(screen.getByLabelText('반려 사유')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '승인' }))
    await user.type(screen.getByLabelText('부여 분당 요청 수'), '20')
    await user.click(screen.getByRole('button', { name: '승인하기' }))
    const dialog = within(await screen.findByRole('dialog', { name: '신청 승인' }))
    await user.click(dialog.getByRole('button', { name: '승인 확정' }))
    expect(approved[0].llmKey).toMatchObject({
      grantedRpm: 20,
      grantedCreditLimit: null,
      openrouterAccountId: null,
    })
  })

  test('rollout gate OFF는 credential 부족이 아니라 binding 전환 준비로 표시하고 TOKEN-only는 허용한다', async () => {
    const user = userEvent.setup()
    const readyButPaused = openRouterAccountStore.find((account) => account.id === uuid(410))!
    server.use(
      http.get('*/api/v1/admin/llm/accounts', () =>
        HttpResponse.json([{ ...readyButPaused, credentialAvailable: true, eligibleForBinding: false }]),
      ),
    )
    const approved = renderDetail({})

    expect(await screen.findByText('OpenRouter account binding 전환 준비 중')).toBeInTheDocument()
    expect(screen.queryByText('금액 축에 연결할 사업 계정이 없습니다')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('부여 금액 한도 (USD)'), '5')
    await user.click(screen.getByRole('button', { name: '승인하기' }))
    expect(await screen.findByText('OpenRouter 사업 계정 binding 전환 준비 중에는 새 금액 축을 승인할 수 없습니다.')).toBeInTheDocument()
    expect(approved).toHaveLength(0)

    await user.clear(screen.getByLabelText('부여 금액 한도 (USD)'))
    await user.type(screen.getByLabelText('부여 분당 요청 수'), '30')
    await user.click(screen.getByRole('button', { name: '승인하기' }))
    const dialog = within(await screen.findByRole('dialog', { name: '신청 승인' }))
    await user.click(dialog.getByRole('button', { name: '승인 확정' }))
    expect(approved[0].llmKey).toMatchObject({
      grantedRpm: 30,
      grantedCreditLimit: null,
      openrouterAccountId: null,
    })
  })

  test('승인자가 적은 한도만 부여값으로 나가고, 결과 카드에 그대로 남는다', async () => {
    const user = userEvent.setup()
    const approved = renderDetail({ reqRpm: 1000, reqTpm: 50000 })

    await screen.findByRole('heading', { name: '신청 상세' })
    await user.type(screen.getByLabelText('부여 분당 요청 수'), '600')
    await user.type(screen.getByLabelText('부여 동시 요청 수'), '4')
    await user.click(screen.getByRole('button', { name: '승인하기' }))

    const dialog = await screen.findByRole('dialog', { name: '신청 승인' })
    expect(within(dialog).getByText('분당 요청 수 600')).toBeInTheDocument()
    expect(within(dialog).getByText('분당 토큰 수 서비스 기본값')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '승인 확정' }))

    await screen.findByText('검토 결과')
    expect(approved).toHaveLength(1)
    expect(approved[0].llmKey).toEqual({
      grantedRpm: 600,
      grantedTpm: null,
      grantedConcurrency: 4,
      grantedDailyTokens: null,
      grantedCreditLimit: null,
      grantedCreditLimitReset: null,
      openrouterAccountId: null,
    })

    const granted = screen.getByText('부여 분당 요청 수').closest('div')!
    expect(within(granted).getByText('600')).toBeInTheDocument()
    const concurrency = screen.getByText('부여 동시 요청 수').closest('div')!
    expect(within(concurrency).getByText('4')).toBeInTheDocument()
  })

  test('계약 범위를 벗어난 부여값은 확인 모달 앞에서 걸린다', async () => {
    const user = userEvent.setup()
    const approved = renderDetail({ reqRpm: 1000 })

    await screen.findByRole('heading', { name: '신청 상세' })
    await user.type(screen.getByLabelText('부여 동시 요청 수'), '200')
    await user.type(screen.getByLabelText('부여 분당 요청 수'), '600')
    await user.type(screen.getByLabelText('부여 분당 토큰 수'), '100')
    await user.click(screen.getByRole('button', { name: '승인하기' }))

    expect(
      screen.getByText('동시 요청 수는 100 이하로 입력해 주세요.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('분당 토큰 수는 분당 요청 수보다 작을 수 없습니다.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(approved).toHaveLength(0)
  })
})
