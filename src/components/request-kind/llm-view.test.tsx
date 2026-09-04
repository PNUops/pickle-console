import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, test } from 'vitest'
import type { ApproveRequest, RequestDetail } from '../../api/queries'
import { orgAdminUser, refreshSuccessHandler } from '../../test/msw/handlers/auth'
import { server } from '../../test/msw/server'
import { renderApp } from '../../test/render'
import { uuid } from '../../test/msw/ids'
import {
  openRouterAccountStore,
  openRouterCatalogueStore,
} from '../../test/msw/handlers/openrouter-accounts'

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
      grantedCreditAllowedModels: [],
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
          grantedCreditAllowedModels: body.llmKey?.grantedCreditAllowedModels ?? [],
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
          grantedCreditAllowedModels: [],
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

  test('사업 계정을 고르면 그 계정의 기본 모델 목록이 채워지고 그대로 나간다', async () => {
    const user = userEvent.setup()
    const approved = renderDetail({})

    await screen.findByRole('heading', { name: '신청 상세' })
    await user.type(screen.getByLabelText('부여 금액 한도 (USD)'), '5')
    await user.selectOptions(screen.getByLabelText('OpenRouter 사업 계정'), uuid(410))

    // 프리필은 계정을 고른 결과이지 신청자의 희망값이 아니다 — 채워도 검토가
    // 사라지지 않는 유일한 칸이라서 이 칸만 미리 찬다.
    const field = screen.getByLabelText('허용할 상용 모델')
    await waitFor(() => expect(field).toHaveValue('openai/*'))

    await user.click(screen.getByRole('button', { name: '승인하기' }))
    const dialog = await screen.findByRole('dialog', { name: '신청 승인' })
    expect(within(dialog).getByText(/허용 상용 모델 openai\/\*/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '승인 확정' }))

    await screen.findByText('검토 결과')
    expect(approved[0].llmKey).toMatchObject({
      grantedCreditAllowedModels: ['openai/*'],
    })
  })

  test('승인자가 고친 모델 목록이 계정 기본값을 대신한다', async () => {
    const user = userEvent.setup()
    const approved = renderDetail({})

    await screen.findByRole('heading', { name: '신청 상세' })
    await user.type(screen.getByLabelText('부여 금액 한도 (USD)'), '5')
    await user.selectOptions(screen.getByLabelText('OpenRouter 사업 계정'), uuid(410))
    const field = screen.getByLabelText('허용할 상용 모델')
    await waitFor(() => expect(field).toHaveValue('openai/*'))

    await user.clear(field)
    await user.type(field, 'Anthropic/Claude-Sonnet-4')
    await user.click(screen.getByRole('button', { name: '승인하기' }))
    const dialog = await screen.findByRole('dialog', { name: '신청 승인' })
    await user.click(within(dialog).getByRole('button', { name: '승인 확정' }))

    await screen.findByText('검토 결과')
    // 판정이 소문자 기준이므로 대문자로 적어도 소문자로 저장돼야 한다.
    expect(approved[0].llmKey).toMatchObject({
      grantedCreditAllowedModels: ['anthropic/claude-sonnet-4'],
    })
  })

  test('금액 없이 모델 목록만 적으면 확인 모달 앞에서 걸린다', async () => {
    const user = userEvent.setup()
    const approved = renderDetail({})

    await screen.findByRole('heading', { name: '신청 상세' })
    await user.type(screen.getByLabelText('허용할 상용 모델'), 'openai/*')
    await user.click(screen.getByRole('button', { name: '승인하기' }))

    expect(
      await screen.findByText('모델 허용 목록을 두려면 0보다 큰 금액 한도가 필요합니다.'),
    ).toBeInTheDocument()
    expect(approved).toHaveLength(0)
  })

  test('자체 서빙 접두를 적으면 상용 목록이 아니라고 막는다', async () => {
    const user = userEvent.setup()
    const approved = renderDetail({})

    await screen.findByRole('heading', { name: '신청 상세' })
    await user.type(screen.getByLabelText('부여 금액 한도 (USD)'), '5')
    await user.selectOptions(screen.getByLabelText('OpenRouter 사업 계정'), uuid(410))
    const field = screen.getByLabelText('허용할 상용 모델')
    await user.clear(field)
    await user.type(field, 'pickle-general')
    await user.click(screen.getByRole('button', { name: '승인하기' }))

    expect(
      await screen.findByText(/자체 서빙 모델이라 이 목록의 대상이 아닙니다/),
    ).toBeInTheDocument()
    expect(approved).toHaveLength(0)
  })

  test('연결할 계정이 없으면 유료 모델만 막고 계정 관리 deep link를 제공한다', async () => {
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
    expect(await screen.findByText('관리용 키까지 확인된 활성 사업 계정이 필요합니다.')).toBeInTheDocument()
    expect(approved).toHaveLength(0)
  })

  test('연결할 계정이 하나면 유료 모델 승인에서 자동 선택하고 불변임을 확인한다', async () => {
    const user = userEvent.setup()
    const only = openRouterAccountStore.find((account) => account.id === uuid(410))!
    server.use(
      http.get('*/api/v1/admin/llm/accounts', () => HttpResponse.json([only])),
    )
    const approved = renderDetail({})

    await screen.findByRole('heading', { name: '신청 상세' })
    expect(await screen.findByText(/AI 교육 사업 A 하나뿐이라/)).toBeInTheDocument()
    expect(screen.queryByLabelText('OpenRouter 사업 계정')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('부여 금액 한도 (USD)'), '3')
    await user.click(screen.getByRole('button', { name: '승인하기' }))
    const dialog = within(await screen.findByRole('dialog', { name: '신청 승인' }))
    expect(dialog.getByText(/발급 뒤 바꿀 수 없습니다/)).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: '승인 확정' }))
    expect(approved[0].llmKey?.openrouterAccountId).toBe(uuid(410))
  })

  test('계정 조회가 실패해도 자체 서빙 모델 승인과 반려 form은 살아 있다', async () => {
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
      grantedCreditAllowedModels: [],
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

describe('유료 모델 선택기', () => {
  // 아래 테스트들이 목 상태를 바꾸므로 매번 되돌린다.
  beforeEach(() => openRouterCatalogueStore.reset())

  test('가격과 함께 고른 모델이 목록에 들어간다', async () => {
    const user = userEvent.setup()
    renderDetail({})

    await screen.findByRole('heading', { name: '신청 상세' })
    await user.type(screen.getByLabelText('부여 금액 한도 (USD)'), '5')
    await user.selectOptions(screen.getByLabelText('OpenRouter 사업 계정'), uuid(410))

    // 이 선택기가 있는 이유는 이름을 대신 쳐 주는 것이 아니라 가격을 판단하는
    // 자리에 갖다 놓는 것이다. 값이 안 보이면 자유 입력과 다를 것이 없다.
    const expensive = await screen.findByText('openai/o1-pro')
    expect(expensive.parentElement).toHaveTextContent('출력 $600 / 1M')

    const row = expensive.closest('li')
    await user.click(within(row as HTMLElement).getByRole('button', { name: '추가' }))

    await waitFor(() =>
      expect(screen.getByLabelText('허용할 상용 모델')).toHaveValue('openai/*\nopenai/o1-pro'),
    )
  })

  test('별칭은 벤더 프리픽스에 안 덮인다고 표시한다', async () => {
    renderDetail({})

    await screen.findByRole('heading', { name: '신청 상세' })
    const alias = await screen.findByText('~anthropic/claude-sonnet-latest')
    expect(alias.parentElement).toHaveTextContent('최신 모델을 따라가는 별칭')
  })

  test('목록을 못 불러와도 승인이 막히지 않는다', async () => {
    const user = userEvent.setup()
    openRouterCatalogueStore.fail = true
    const approved = renderDetail({})

    await screen.findByRole('heading', { name: '신청 상세' })
    await screen.findByText(/모델 목록을 불러오지 못했습니다/)

    await user.type(screen.getByLabelText('부여 금액 한도 (USD)'), '5')
    await user.selectOptions(screen.getByLabelText('OpenRouter 사업 계정'), uuid(410))
    await user.clear(screen.getByLabelText('허용할 상용 모델'))
    await user.type(screen.getByLabelText('허용할 상용 모델'), 'openai/gpt-4o-mini')

    await user.click(screen.getByRole('button', { name: '승인하기' }))
    const dialog = await screen.findByRole('dialog', { name: '신청 승인' })
    await user.click(within(dialog).getByRole('button', { name: '승인 확정' }))

    await screen.findByText('검토 결과')
    expect(approved[0].llmKey).toMatchObject({
      grantedCreditAllowedModels: ['openai/gpt-4o-mini'],
    })
  })

  test('한 번도 못 가져온 목록과 오래된 목록을 구분해 말한다', async () => {
    openRouterCatalogueStore.response = {
      ...openRouterCatalogueStore.response,
      models: [],
      freshness: 'UNKNOWN',
      lastSuccessAt: null,
    }
    renderDetail({})

    await screen.findByRole('heading', { name: '신청 상세' })
    await screen.findByText(/아직 목록을 가져온 적이 없습니다/)
  })
})

describe('초과 배정 경고', () => {
  /**
   * 잔액보다 많이 배정된 상태를 만든다. 기본 픽스처를 이 모양으로 두면 금액 축을
   * 승인하는 무관한 테스트가 전부 확인 절차에 걸린다.
   */
  function overAllocate(accountId: string) {
    const account = openRouterAccountStore.find((item) => item.id === accountId)!
    account.allocation = {
      ...account.allocation,
      committedCreditLimit: 300,
      committedTotalCap: 300,
      committedKeyCount: 30,
      remainingCommitment: 290,
      committedUsage: 10,
    }
  }

  /**
   * 착수 근거가 된 사고. 잔액 100인 계정에 10씩 서른 명을 승인하면 늦게 쓰는
   * 사람이 못 쓴다. 막지는 않되 승인자가 그 사실을 알고 눌러야 한다.
   */
  test('초과면 폼과 확인 창 양쪽에 경고가 뜨고 확정 버튼이 잠긴다', async () => {
    const user = userEvent.setup()
    overAllocate(uuid(410))
    renderDetail({})

    await screen.findByRole('heading', { name: '신청 상세' })
    await user.type(screen.getByLabelText('부여 금액 한도 (USD)'), '10')
    await user.selectOptions(screen.getByLabelText('OpenRouter 사업 계정'), uuid(410))

    // 폼 안에서 먼저 보인다 — 승인하기를 누르기 전에 읽힌다.
    expect(await screen.findByText(/남은 배정 \$290\.00 \+ 이번 승인 \$10/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '승인하기' }))
    const dialog = await screen.findByRole('dialog', { name: '신청 승인' })
    const confirm = within(dialog).getByRole('button', { name: '승인 확정' })
    expect(confirm).toBeDisabled()

    await user.click(within(dialog).getByLabelText('초과 배정임을 확인했습니다'))
    expect(confirm).toBeEnabled()
  })

  /**
   * 확인을 boolean으로 들면 확인 뒤 값을 고쳐도 살아남는다. 무엇을 확인했는지를
   * 들고 대조해야 금액이 바뀐 순간 확인이 무효가 된다.
   */
  test('확인한 뒤 금액을 고치면 확인이 무효가 된다', async () => {
    const user = userEvent.setup()
    overAllocate(uuid(410))
    renderDetail({})

    await screen.findByRole('heading', { name: '신청 상세' })
    const creditField = screen.getByLabelText('부여 금액 한도 (USD)')
    await user.type(creditField, '10')
    await user.selectOptions(screen.getByLabelText('OpenRouter 사업 계정'), uuid(410))
    await user.click(screen.getByRole('button', { name: '승인하기' }))

    const dialog = await screen.findByRole('dialog', { name: '신청 승인' })
    await user.click(within(dialog).getByLabelText('초과 배정임을 확인했습니다'))
    expect(within(dialog).getByRole('button', { name: '승인 확정' })).toBeEnabled()

    await user.click(within(dialog).getByRole('button', { name: '돌아가기' }))
    await user.clear(creditField)
    await user.type(creditField, '20')
    await user.click(screen.getByRole('button', { name: '승인하기' }))

    const reopened = await screen.findByRole('dialog', { name: '신청 승인' })
    expect(within(reopened).getByRole('button', { name: '승인 확정' })).toBeDisabled()
    expect(within(reopened).getByLabelText('초과 배정임을 확인했습니다')).not.toBeChecked()
  })

  /** 넘지 않으면 경고도 확인도 없다. 평범한 승인이 느려지면 안 된다. */
  test('넘지 않으면 경고 없이 그대로 승인된다', async () => {
    const user = userEvent.setup()
    const approved = renderDetail({})

    await screen.findByRole('heading', { name: '신청 상세' })
    await user.type(screen.getByLabelText('부여 금액 한도 (USD)'), '5')
    await user.selectOptions(screen.getByLabelText('OpenRouter 사업 계정'), uuid(410))
    await user.click(screen.getByRole('button', { name: '승인하기' }))

    const dialog = await screen.findByRole('dialog', { name: '신청 승인' })
    expect(within(dialog).queryByLabelText('초과 배정임을 확인했습니다')).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '승인 확정' }))

    await screen.findByText('검토 결과')
    expect(approved[0].llmKey).toMatchObject({ grantedCreditLimit: 5 })
  })
})
