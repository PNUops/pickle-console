import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { canManageOpenRouterAccount, isSysTier } from '../../../auth/permissions'
import { uuid } from '../ids'
import { ACCESS_TOKENS, problemResponse } from './auth'
import { adminReadScope } from './org-scope'

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
      name: '테스트 상용 모델 사업',
      program: null,
      contact: null,
      status: 'ACTIVE',
      boundKeyCount: 0,
      credentialAvailable: false,
      eligibleForBinding: false,
      defaultCreditAllowedModels: [],
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

export const openRouterAccountHandlers: RequestHandler[] = [
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
