import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { canManageOpenRouterAccount, isSysTier } from '../../../auth/permissions'
import { uuid } from '../ids'
import { ACCESS_TOKENS, problemResponse } from './auth'
import { adminReadScope } from './org-scope'

/** 계정 사용량 조회가 실제로 어떤 query 로 나갔는지. */
export const accountUsageQueries: string[] = []

type Schemas = components['schemas']
type Account = Schemas['OpenRouterAccountResponse']
type Credential = Schemas['OpenRouterCredentialStateResponse']
type Allocation = Schemas['OpenRouterAccountAllocationResponse']
type Credits = Schemas['OpenRouterAccountCreditsResponse']

const now = '2026-08-31T00:30:00+09:00'

function credits(overrides: Partial<Credits> = {}): Credits {
  return {
    totalCredits: 100,
    totalUsage: 12.5,
    balance: 87.5,
    freshness: 'FRESH',
    observedAt: '2026-08-31T00:28:00+09:00',
    lastSuccessAt: '2026-08-31T00:28:00+09:00',
    lastAttemptAt: '2026-08-31T00:28:00+09:00',
    error: null,
    averageDailyUsage: 2.5,
    depletionForecastAt: '2026-10-05T00:28:00+09:00',
    forecastUnavailableReason: null,
    forecastWindowStartedAt: '2026-08-24T00:28:00+09:00',
    accountUsageSinceBaseline: 8,
    managedUsageSinceBaseline: 5,
    unmanagedSpend: 3,
    unmanagedSpendUnavailableReason: null,
    pairedCreditsObservedAt: '2026-08-31T00:28:00+09:00',
    pairedKeysObservedAt: '2026-08-31T00:27:30+09:00',
    unmanagedBaselineAt: '2026-08-24T00:28:00+09:00',
    keysFreshness: 'FRESH',
    keysLastSuccessAt: '2026-08-31T00:27:30+09:00',
    keysLastAttemptAt: '2026-08-31T00:27:30+09:00',
    keysError: null,
    ...overrides,
  }
}

function activeCredential(overrides: Partial<Credential> = {}): Credential {
  return {
    status: 'ACTIVE',
    createdAt: '2026-08-30T20:00:00+09:00',
    verifiedAt: '2026-08-30T20:01:00+09:00',
    lastVerificationAttemptAt: '2026-08-30T20:01:00+09:00',
    activatedAt: '2026-08-30T20:02:00+09:00',
    retiringAt: null,
    lastUsedAt: '2026-08-30T20:10:00+09:00',
    lastReconciledAt: '2026-08-30T20:30:00+09:00',
    verificationError: null,
    retiringOverdue: false,
    ...overrides,
  }
}

/**
 * 배정 합계 픽스처. 기본은 아무것도 배정되지 않은 계정이고, 화면이 갈리는
 * 자리(초과, 창 한도, 발급 대기, 사용액 미보고)는 부르는 쪽이 덮어쓴다.
 */
function allocation(overrides: Partial<Allocation> = {}): Allocation {
  return {
    committedCreditLimit: 0,
    committedTotalCap: 0,
    committedDaily: 0,
    committedWeekly: 0,
    committedMonthly: 0,
    committedKeyCount: 0,
    remainingCommitment: 0,
    committedUsage: 0,
    awaitingProvisionKeyCount: 0,
    usageUnreportedKeyCount: 0,
    ...overrides,
  }
}

function initialAccounts(): Account[] {
  return [
    {
      id: uuid(410),
      orgId: uuid(1),
      orgName: '정보컴퓨터공학부 실습지원센터',
      name: 'AI 교육 사업 A',
      program: '대학혁신지원사업',
      contact: '2026-AI-A',
      status: 'ACTIVE',
      boundKeyCount: 2,
      credentialAvailable: true,
      eligibleForBinding: true,
      // 기본 목록을 든 계정이 하나는 있어야 승인 폼의 프리필이 검증된다.
      defaultCreditAllowedModels: ['openai/*'],
      defaultCreditDeniedModels: [],
      defaultPassthroughEndpoints: ['images'],
      activeCredential: activeCredential(),
      rotationCredential: null,
      credits: credits(),
      allocation: allocation({
        committedCreditLimit: 20,
        committedTotalCap: 20,
        committedKeyCount: 2,
        remainingCommitment: 10,
        committedUsage: 10,
      }),
      createdAt: '2026-08-30T19:50:00+09:00',
      updatedAt: now,
    },
    {
      id: uuid(411),
      orgId: uuid(1),
      orgName: '정보컴퓨터공학부 실습지원센터',
      name: '산학 협력 사업 B',
      program: '산학협력단',
      contact: null,
      status: 'ACTIVE',
      boundKeyCount: 0,
      credentialAvailable: true,
      eligibleForBinding: true,
      defaultCreditAllowedModels: [],
      defaultCreditDeniedModels: [],
      defaultPassthroughEndpoints: [],
      activeCredential: activeCredential({ createdAt: '2026-08-30T21:00:00+09:00' }),
      rotationCredential: null,
      credits: credits({
        totalCredits: 10,
        totalUsage: 11.25,
        balance: -1.25,
        freshness: 'STALE',
        error: 'THROTTLED',
        lastAttemptAt: '2026-08-31T01:20:00+09:00',
        averageDailyUsage: null,
        depletionForecastAt: null,
        forecastUnavailableReason: 'RESET_BOUNDARY',
        forecastWindowStartedAt: null,
        accountUsageSinceBaseline: null,
        managedUsageSinceBaseline: null,
        unmanagedSpend: null,
        unmanagedSpendUnavailableReason: 'RESET_BOUNDARY',
        keysFreshness: 'STALE',
        keysError: 'VENDOR_UNAVAILABLE',
        keysLastAttemptAt: '2026-08-31T01:19:00+09:00',
      }),
      allocation: allocation({
        committedCreditLimit: 40,
        committedTotalCap: 20,
        committedMonthly: 20,
        committedKeyCount: 3,
        remainingCommitment: 38,
        committedUsage: 2,
        usageUnreportedKeyCount: 1,
      }),
      createdAt: '2026-08-30T20:50:00+09:00',
      updatedAt: now,
    },
    {
      id: uuid(412),
      orgId: uuid(2),
      orgName: '테스트 기관',
      name: '테스트 유료 모델 사업',
      program: null,
      contact: null,
      status: 'ACTIVE',
      boundKeyCount: 0,
      credentialAvailable: false,
      eligibleForBinding: false,
      defaultCreditAllowedModels: [],
      defaultCreditDeniedModels: [],
      defaultPassthroughEndpoints: [],
      activeCredential: null,
      rotationCredential: null,
      credits: credits({
        totalCredits: null,
        totalUsage: null,
        balance: null,
        freshness: 'UNKNOWN',
        observedAt: null,
        lastSuccessAt: null,
        lastAttemptAt: null,
        averageDailyUsage: null,
        depletionForecastAt: null,
        forecastUnavailableReason: 'INSUFFICIENT_HISTORY',
        forecastWindowStartedAt: null,
        accountUsageSinceBaseline: null,
        managedUsageSinceBaseline: null,
        unmanagedSpend: null,
        unmanagedSpendUnavailableReason: 'NO_BASELINE',
        pairedCreditsObservedAt: null,
        pairedKeysObservedAt: null,
        unmanagedBaselineAt: null,
        keysFreshness: 'UNKNOWN',
        keysLastSuccessAt: null,
        keysLastAttemptAt: null,
      }),
      allocation: allocation(),
      createdAt: '2026-08-30T21:50:00+09:00',
      updatedAt: now,
    },
  ]
}

export let openRouterAccountStore = initialAccounts()
let nextAccountId = 430

/** 목록 조회마다 쌓이는 쿼리스트링 — 뮤테이션 뒤 재조회 여부를 세는 데 쓴다. */
export const openRouterAccountListQueries: string[] = []

export function resetOpenRouterAccountFixtures() {
  openRouterAccountStore = initialAccounts()
  nextAccountId = 430
  openRouterAccountListQueries.length = 0
  accountUsageQueries.length = 0
}

function profileOf(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  return ACCESS_TOKENS[token] ?? null
}

function roleFor(profile: Schemas['UserProfileResponse'], orgId: string) {
  if (isSysTier(profile.role)) return profile.role
  return profile.managedOrgs.find((org) => org.orgId === orgId)?.role
}

function canWrite(profile: Schemas['UserProfileResponse'], orgId: string): boolean {
  const role = roleFor(profile, orgId)
  return role != null && canManageOpenRouterAccount(role)
}

function notFound() {
  return problemResponse({
    type: 'about:blank',
    title: '리소스를 찾을 수 없습니다',
    status: 404,
    detail: '해당 OpenRouter 사업 계정을 찾을 수 없습니다.',
    code: 'RESOURCE_NOT_FOUND',
  })
}

function invalidState(detail: string) {
  return problemResponse({
    type: 'about:blank',
    title: '현재 상태에서 수행할 수 없습니다',
    status: 409,
    detail,
    code: 'OPENROUTER_CREDENTIAL_INVALID_STATE',
  })
}

function accountFor(request: Request, accountId: string): { profile: Schemas['UserProfileResponse']; account: Account } | null {
  const profile = profileOf(request)
  const account = openRouterAccountStore.find((item) => item.id === accountId)
  if (!profile || !account) return null
  const scope = adminReadScope(profile, account.orgId, `/api/v1/admin/llm/accounts/${accountId}`)
  if (scope.notFound || !scope.matches(account.orgId)) return null
  return { profile, account }
}

function confirm(account: Account, confirmName: string): Response | null {
  if (confirmName === account.name) return null
  return problemResponse({
    type: 'about:blank',
    title: '확인 이름이 일치하지 않습니다',
    status: 422,
    detail: 'Account 이름을 정확히 입력해 주세요.',
    code: 'OPENROUTER_ACCOUNT_CONFIRM_NAME_MISMATCH',
  })
}

/**
 * 카탈로그 캐시. 서버는 캐시만 읽으므로 이 핸들러도 벤더를 흉내 내지 않는다.
 * 신선도는 서버가 정하는 값이라 목에서도 응답에 실려 온다 — 화면이 그것으로
 * "아직 가져온 적 없음"과 "벤더가 죽음"을 가른다.
 */
const defaultCatalogue = (): Schemas['OpenRouterCatalogueResponse'] => ({
  models: [
    {
      id: 'openai/gpt-4o-mini',
      name: 'OpenAI: GPT-4o-mini',
      promptPricePerMillion: 0.15,
      completionPricePerMillion: 0.6,
      contextLength: 128000,
    },
    {
      id: '~anthropic/claude-sonnet-latest',
      name: 'Anthropic Claude Sonnet Latest',
      promptPricePerMillion: 2,
      completionPricePerMillion: 10,
      contextLength: 1000000,
    },
    {
      id: 'openai/o1-pro',
      name: 'OpenAI: o1-pro',
      promptPricePerMillion: 150,
      completionPricePerMillion: 600,
      contextLength: 200000,
    },
  ],
  freshness: 'FRESH',
  lastSuccessAt: '2026-09-04T00:00:00Z',
  lastAttemptAt: '2026-09-04T00:00:00Z',
  lastError: null,
  consecutiveFailures: 0,
})

// 테스트가 이 값을 바꾸므로 되돌릴 방법이 함께 있어야 한다. 없으면 한 테스트의
// 「벤더가 죽었다」가 뒤 테스트로 새고, 그 실패는 실행 순서에 따라 나타났다 사라진다.
export const openRouterCatalogueStore: {
  response: Schemas['OpenRouterCatalogueResponse']
  fail: boolean
  reset: () => void
} = {
  response: defaultCatalogue(),
  fail: false,
  reset() {
    openRouterCatalogueStore.response = defaultCatalogue()
    openRouterCatalogueStore.fail = false
  },
}

export const openRouterAccountHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/llm/openrouter-models', ({ request }) => {
    const profile = profileOf(request)
    if (!profile) return notFound()
    if (openRouterCatalogueStore.fail) {
      return HttpResponse.json({ title: '서버 오류', status: 500 }, { status: 500 })
    }
    return HttpResponse.json(openRouterCatalogueStore.response, { status: 200 })
  }),

  http.get('*/api/v1/admin/llm/accounts', ({ request }) => {
    const profile = profileOf(request)
    if (!profile) return notFound()
    const url = new URL(request.url)
    openRouterAccountListQueries.push(url.searchParams.toString())
    const orgId = url.searchParams.get('orgId')
    const scope = adminReadScope(profile, orgId, '/api/v1/admin/llm/accounts')
    if (scope.notFound) return scope.notFound
    return HttpResponse.json(openRouterAccountStore.filter((account) => scope.matches(account.orgId)), { status: 200 })
  }),

  http.post('*/api/v1/admin/llm/accounts', async ({ request }) => {
    const profile = profileOf(request)
    const body = (await request.json()) as Schemas['CreateOpenRouterAccountRequest']
    if (!profile || !canWrite(profile, body.orgId)) return notFound()
    if (body.confirmName !== body.name) return confirm({ name: body.name } as Account, body.confirmName)!
    const orgName = body.orgId === uuid(1) ? '정보컴퓨터공학부 실습지원센터' : '테스트 기관'
    const account: Account = {
      id: uuid(nextAccountId++),
      orgId: body.orgId,
      orgName,
      name: body.name,
      program: body.program ?? null,
      contact: body.contact ?? null,
      status: 'ACTIVE',
      boundKeyCount: 0,
      credentialAvailable: false,
      eligibleForBinding: false,
      defaultCreditAllowedModels: [],
      defaultCreditDeniedModels: [],
      defaultPassthroughEndpoints: [],
      activeCredential: null,
      rotationCredential: null,
      credits: credits({
        totalCredits: null,
        totalUsage: null,
        balance: null,
        freshness: 'UNKNOWN',
        observedAt: null,
        lastSuccessAt: null,
        lastAttemptAt: null,
        averageDailyUsage: null,
        depletionForecastAt: null,
        forecastUnavailableReason: 'INSUFFICIENT_HISTORY',
        forecastWindowStartedAt: null,
        accountUsageSinceBaseline: null,
        managedUsageSinceBaseline: null,
        unmanagedSpend: null,
        unmanagedSpendUnavailableReason: 'NO_BASELINE',
        pairedCreditsObservedAt: null,
        pairedKeysObservedAt: null,
        unmanagedBaselineAt: null,
        keysFreshness: 'UNKNOWN',
        keysLastSuccessAt: null,
        keysLastAttemptAt: null,
      }),
      allocation: allocation(),
      createdAt: now,
      updatedAt: now,
    }
    openRouterAccountStore.push(account)
    return HttpResponse.json(account, { status: 201 })
  }),

  http.get('*/api/v1/admin/llm/accounts/:accountId', ({ params, request }) => {
    const found = accountFor(request, String(params.accountId))
    return found ? HttpResponse.json(found.account, { status: 200 }) : notFound()
  }),

  /**
   * 계정 사용량. **금액이 붙지 않은 날은 0이 아니라 null**이고, 그 구분이 이
   * handler 가 지켜야 하는 서버 불변식이다. 목이 0을 주면 화면이 자체 서빙만 쓴
   * 날을 「공짜」로 그려도 시험이 통과한다.
   */
  http.get('*/api/v1/admin/llm/accounts/:accountId/usage', ({ params, request }) => {
    // 어떤 기간으로 물었는지를 남긴다. 이것이 없으면 「기간을 바꾸면 그 기간으로
    // 다시 묻는다」를 단언할 방법 자체가 없고, 실제로 그 시험은 aria-pressed 만
    // 보고 있었다.
    accountUsageQueries.push(new URL(request.url).search)
    // 상세와 같은 문을 쓴다. 여기서 갈리면 「상세는 404인데 사용량은 열리는」
    // 서버에 없는 세계를 목이 만든다.
    const found = accountFor(request, String(params.accountId))
    if (!found) return notFound()
    const raw = new URL(request.url).searchParams.get('days')
    const days = raw == null ? 30 : Number(raw)
    const to = '2026-08-31'
    const points = Array.from({ length: days }, (_, index) => {
      const day = new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1 - index) * 86_400_000)
        .toISOString()
        .slice(0, 10)
      // 마지막 이틀만 금액이 붙었다. 나머지는 0이 아니라 없음이다.
      const priced = index >= days - 2
      return {
        day,
        attributedCostUsd: priced ? 0.25 : null,
        pricedRequests: priced ? 2 : 0,
        requests: priced ? 5 : index % 3 === 0 ? 1 : 0,
      }
    })
    const requests = points.reduce((sum, point) => sum + point.requests, 0)
    const pricedRequests = points.reduce((sum, point) => sum + point.pricedRequests, 0)
    return HttpResponse.json(
      {
        from: points[0].day,
        to: points[points.length - 1].day,
        attributedCostUsd: 0.5,
        requests,
        pricedRequests,
        keysUsed: 2,
        // 같은 계정의 상세가 boundKeyCount 2 를 말한다. 목이 3 을 주면 한 계정을
        // 두 응답이 다르게 말하는, 서버에 없는 상태가 된다.
        keysLinked: 2,
        points,
        keys: [
          {
            keyId: uuid(501),
            keyName: 'capstone-chatbot',
            requests: requests - 3,
            inputTokens: 2_400,
            outputTokens: 800,
            attributedCostUsd: 0.5,
            pricedRequests,
          },
          {
            keyId: uuid(502),
            keyName: 'lab-embeddings',
            requests: 3,
            inputTokens: 300,
            outputTokens: 0,
            // 자체 서빙만 쓴 키. 금액은 0이 아니라 없음이다.
            attributedCostUsd: null,
            pricedRequests: 0,
          },
        ],
      },
      { status: 200 },
    )
  }),

  http.patch('*/api/v1/admin/llm/accounts/:accountId', async ({ params, request }) => {
    const found = accountFor(request, String(params.accountId))
    if (!found || !canWrite(found.profile, found.account.orgId)) return notFound()
    const body = (await request.json()) as Schemas['UpdateOpenRouterAccountRequest']
    Object.assign(found.account, body, { updatedAt: now })
    return HttpResponse.json(found.account, { status: 200 })
  }),

  http.post('*/api/v1/admin/llm/accounts/:accountId/credentials/staged', async ({ params, request }) => {
    const found = accountFor(request, String(params.accountId))
    if (!found || !canWrite(found.profile, found.account.orgId)) return notFound()
    // 평문은 요청 검증에만 쓰고 어떤 fixture나 기록에도 보존하지 않는다.
    const body = (await request.json()) as Schemas['StageOpenRouterCredentialRequest']
    const mismatch = confirm(found.account, body.confirmName)
    if (mismatch) return mismatch
    if (found.account.rotationCredential) return invalidState('이미 진행 중인 credential rotation이 있습니다.')
    found.account.rotationCredential = {
      status: 'STAGED',
      createdAt: now,
      verifiedAt: now,
      lastVerificationAttemptAt: now,
      activatedAt: null,
      retiringAt: null,
      lastUsedAt: now,
      lastReconciledAt: null,
      verificationError: null,
      retiringOverdue: false,
    }
    return HttpResponse.json(found.account, { status: 201 })
  }),

  http.post('*/api/v1/admin/llm/accounts/:accountId/credentials/staged/activate', async ({ params, request }) => {
    const found = accountFor(request, String(params.accountId))
    if (!found || !canWrite(found.profile, found.account.orgId)) return notFound()
    const body = (await request.json()) as Schemas['ConfirmOpenRouterAccountRequest']
    const mismatch = confirm(found.account, body.confirmName)
    if (mismatch) return mismatch
    const staged = found.account.rotationCredential
    if (staged?.status !== 'STAGED') return invalidState('활성화할 STAGED credential이 없습니다.')
    found.account.rotationCredential = found.account.activeCredential
      ? { ...found.account.activeCredential, status: 'RETIRING', retiringAt: now }
      : null
    found.account.activeCredential = { ...staged, status: 'ACTIVE', activatedAt: now }
    found.account.credentialAvailable = true
    found.account.eligibleForBinding = true
    return HttpResponse.json(found.account, { status: 200 })
  }),

  http.post('*/api/v1/admin/llm/accounts/:accountId/credentials/staged/cancel', async ({ params, request }) => {
    const found = accountFor(request, String(params.accountId))
    if (!found || !canWrite(found.profile, found.account.orgId)) return notFound()
    const body = (await request.json()) as Schemas['ConfirmOpenRouterAccountRequest']
    const mismatch = confirm(found.account, body.confirmName)
    if (mismatch) return mismatch
    if (found.account.rotationCredential?.status !== 'STAGED') return invalidState('취소할 STAGED credential이 없습니다.')
    found.account.rotationCredential = null
    return HttpResponse.json(found.account, { status: 200 })
  }),

  http.post('*/api/v1/admin/llm/accounts/:accountId/credentials/retiring/rollback', async ({ params, request }) => {
    const found = accountFor(request, String(params.accountId))
    if (!found || !canWrite(found.profile, found.account.orgId)) return notFound()
    const body = (await request.json()) as Schemas['ConfirmOpenRouterAccountRequest']
    const mismatch = confirm(found.account, body.confirmName)
    if (mismatch) return mismatch
    const retiring = found.account.rotationCredential
    const active = found.account.activeCredential
    if (retiring?.status !== 'RETIRING' || !active) return invalidState('되돌릴 RETIRING credential이 없습니다.')
    found.account.activeCredential = { ...retiring, status: 'ACTIVE', retiringAt: null, activatedAt: now }
    found.account.rotationCredential = { ...active, status: 'STAGED', activatedAt: null }
    return HttpResponse.json(found.account, { status: 200 })
  }),

  http.post('*/api/v1/admin/llm/accounts/:accountId/credentials/retiring/finalize', async ({ params, request }) => {
    const found = accountFor(request, String(params.accountId))
    if (!found || !canWrite(found.profile, found.account.orgId)) return notFound()
    const body = (await request.json()) as Schemas['FinalizeOpenRouterCredentialRequest']
    const mismatch = confirm(found.account, body.confirmName)
    if (mismatch) return mismatch
    if (!body.vendorRevocationConfirmed || found.account.rotationCredential?.status !== 'RETIRING') {
      return invalidState('Vendor 폐기 확인과 RETIRING credential이 필요합니다.')
    }
    found.account.rotationCredential = null
    return HttpResponse.json(found.account, { status: 200 })
  }),

  http.post('*/api/v1/admin/llm/accounts/:accountId/credentials/active/delete', async ({ params, request }) => {
    const found = accountFor(request, String(params.accountId))
    if (!found || !canWrite(found.profile, found.account.orgId)) return notFound()
    const body = (await request.json()) as Schemas['FinalizeOpenRouterCredentialRequest']
    const mismatch = confirm(found.account, body.confirmName)
    if (mismatch) return mismatch
    if (!body.vendorRevocationConfirmed || found.account.boundKeyCount > 0 || found.account.rotationCredential) {
      return invalidState('연결된 key와 rotation이 없는 credential만 삭제할 수 있습니다.')
    }
    found.account.activeCredential = null
    found.account.credentialAvailable = false
    found.account.eligibleForBinding = false
    return HttpResponse.json(found.account, { status: 200 })
  }),
]
