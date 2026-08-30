import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'
import { ACCESS_TOKENS, problemResponse } from './auth'
import { isSysTier } from '../../../auth/permissions'
import { isMyWorkspace, workspaceMembersOf } from './workspaces'
import { uuid } from '../ids'

type Schemas = components['schemas']
type LlmKeyDetail = Schemas['LlmKeyDetailResponse']
type ResourceRole = Schemas['ResourceRole']
type AccessGrant = Schemas['ResourceAccessGrantView']
type AdminLlmKey = Schemas['AdminLlmKeyDetailResponse']

const RESOURCE_ROLE_RANK: Record<ResourceRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  EDITOR: 2,
  OWNER: 3,
}

/**
 * 저장 행은 상세 응답의 모양 그대로다 — 요청자별로 갈리는 두 값
 * (`myResourceRole`, `accessManageAllowed`)까지 행에 얹어 두고, 목록·인벤토리는
 * 전부 여기서 파생시킨다. 같은 행을 두 화면이 다르게 말하면 권한 결함이
 * 테스트에 걸리지 않고 지나간다.
 */
function initialLlmKeys(): LlmKeyDetail[] {
  return [
    {
      id: uuid(70),
      name: 'capstone-chatbot',
      purpose: '캡스톤 챗봇 백엔드',
      status: 'ACTIVE',
      tokenPrefix: 'pk-llm-3f9a',
      // 아직 오지 않은 시각이어야 '활성'으로 남는다 — 화면이 만료를 시계로
      // 판정하므로, 지난 날짜를 넣으면 이 픽스처가 만료 키가 된다.
      expiresAt: '2027-12-31T23:59:00+09:00',
      lastUsedAt: '2026-08-10T18:22:00+09:00',
      rpm: 60,
      tpm: 40000,
      concurrency: 4,
      recordBodies: false,
      // 금액 축이 부여되고 연결까지 끝난 키 — 세 상태(미부여·연결 전·사용
      // 가능) 중 마지막을 픽스처가 하나는 들고 있어야 화면이 검증된다.
      creditLimit: 5,
      creditAxisConnected: true,
      revokedAt: null,
      workspaceId: uuid(12),
      workspaceName: '캡스톤 3조',
      createdAt: '2026-07-20T11:00:00+09:00',
      myResourceRole: 'OWNER',
      accessManageAllowed: true,
    },
    {
      // 승인은 났고 아직 비밀이 없다 — 발급 버튼이 거기 있는 이유.
      id: uuid(71),
      name: 'algo-hint-writer',
      purpose: '문제 해설 초안 생성',
      status: 'PENDING',
      tokenPrefix: null,
      expiresAt: null,
      lastUsedAt: null,
      rpm: null,
      tpm: null,
      concurrency: null,
      recordBodies: false,
      creditLimit: 0,
      creditAxisConnected: false,
      revokedAt: null,
      workspaceId: uuid(15),
      workspaceName: '알고리즘 스터디',
      createdAt: '2026-08-05T09:30:00+09:00',
      myResourceRole: 'OWNER',
      accessManageAllowed: true,
    },
    {
      // 접근 목록에 없다 — 제한 행의 근거.
      id: uuid(72),
      name: 'db-lab-grader',
      purpose: null,
      status: 'ACTIVE',
      tokenPrefix: null,
      expiresAt: null,
      lastUsedAt: null,
      rpm: null,
      tpm: null,
      concurrency: null,
      recordBodies: false,
      creditLimit: 0,
      creditAxisConnected: false,
      revokedAt: null,
      workspaceId: uuid(14),
      workspaceName: '데이터베이스 실습',
      createdAt: '2026-07-02T15:00:00+09:00',
      myResourceRole: null,
      accessManageAllowed: false,
    },
    {
      // 죽은 키. 발급 전과 달리 되살릴 길이 없다.
      id: uuid(73),
      name: 'leaked-demo-key',
      purpose: '시연용 (유출로 폐기)',
      status: 'REVOKED',
      tokenPrefix: 'pk-llm-91cc',
      expiresAt: null,
      lastUsedAt: '2026-07-30T10:05:00+09:00',
      rpm: null,
      tpm: null,
      concurrency: null,
      recordBodies: true,
      creditLimit: 0,
      creditAxisConnected: false,
      revokedAt: '2026-07-31T09:00:00+09:00',
      workspaceId: uuid(12),
      workspaceName: '캡스톤 3조',
      createdAt: '2026-07-10T13:00:00+09:00',
      myResourceRole: 'OWNER',
      accessManageAllowed: true,
    },
    {
      // 참여자 등급만 받은 키 — 안은 보이지만 발급도 수정도 폐기도 못 한다.
      id: uuid(74),
      name: 'study-shared-key',
      purpose: '스터디 공용',
      status: 'ACTIVE',
      tokenPrefix: 'pk-llm-77de',
      expiresAt: null,
      lastUsedAt: null,
      rpm: 30,
      tpm: null,
      concurrency: null,
      recordBodies: false,
      creditLimit: 0,
      creditAxisConnected: false,
      revokedAt: null,
      workspaceId: uuid(15),
      workspaceName: '알고리즘 스터디',
      createdAt: '2026-07-15T16:40:00+09:00',
      myResourceRole: 'MEMBER',
      accessManageAllowed: false,
    },
    {
      // 기간이 지난 키. 서버에는 EXPIRED로 옮기는 코드가 없어 상태 열은 계속
      // ACTIVE이고, 실제 집행은 게이트웨이가 expiresAt으로 한다 — 화면이 상태
      // 문자열만 믿으면 이미 거부되는 키를 '활성'이라 부르고 재발급까지 권한다.
      id: uuid(75),
      name: 'last-semester-key',
      purpose: '지난 학기 실습',
      status: 'ACTIVE',
      tokenPrefix: 'pk-llm-20b4',
      expiresAt: '2026-07-01T00:00:00+09:00',
      lastUsedAt: '2026-06-30T22:10:00+09:00',
      rpm: null,
      tpm: null,
      concurrency: null,
      recordBodies: false,
      creditLimit: 0,
      creditAxisConnected: false,
      revokedAt: null,
      workspaceId: uuid(12),
      workspaceName: '캡스톤 3조',
      createdAt: '2026-06-05T10:00:00+09:00',
      myResourceRole: 'OWNER',
      accessManageAllowed: true,
    },
  ]
}

function initialLlmKeyAccessGrants(): Record<string, AccessGrant[]> {
  return {
    [uuid(70)]: [
      {
        id: uuid(340),
        granteeType: 'USER',
        user: { userId: uuid(42), name: '홍길동', email: 'gildong.hong@pusan.ac.kr' },
        role: 'OWNER',
        createdAt: '2026-07-20T11:00:00+09:00',
      },
      {
        id: uuid(341),
        granteeType: 'USER',
        user: { userId: uuid(57), name: '김철수', email: 'cheolsu.kim@pusan.ac.kr' },
        role: 'MEMBER',
        createdAt: '2026-07-21T11:00:00+09:00',
      },
    ],
    [uuid(71)]: [
      {
        id: uuid(343),
        granteeType: 'USER',
        user: { userId: uuid(42), name: '홍길동', email: 'gildong.hong@pusan.ac.kr' },
        role: 'OWNER',
        createdAt: '2026-08-05T09:30:00+09:00',
      },
    ],
    // 내가 없는 목록 — 제한 행이 "누구에게 요청하라"고 말할 근거.
    [uuid(72)]: [
      {
        id: uuid(345),
        granteeType: 'USER',
        user: { userId: uuid(57), name: '김철수', email: 'cheolsu.kim@pusan.ac.kr' },
        role: 'OWNER',
        createdAt: '2026-07-02T15:00:00+09:00',
      },
    ],
    [uuid(73)]: [
      {
        id: uuid(347),
        granteeType: 'USER',
        user: { userId: uuid(42), name: '홍길동', email: 'gildong.hong@pusan.ac.kr' },
        role: 'OWNER',
        createdAt: '2026-07-10T13:00:00+09:00',
      },
    ],
    [uuid(75)]: [
      {
        id: uuid(352),
        granteeType: 'USER',
        user: { userId: uuid(42), name: '홍길동', email: 'gildong.hong@pusan.ac.kr' },
        role: 'OWNER',
        createdAt: '2026-06-05T10:00:00+09:00',
      },
    ],
    [uuid(74)]: [
      {
        id: uuid(349),
        granteeType: 'USER',
        user: { userId: uuid(57), name: '김철수', email: 'cheolsu.kim@pusan.ac.kr' },
        role: 'OWNER',
        createdAt: '2026-07-15T16:40:00+09:00',
      },
      {
        id: uuid(350),
        granteeType: 'USER',
        user: { userId: uuid(42), name: '홍길동', email: 'gildong.hong@pusan.ac.kr' },
        role: 'MEMBER',
        createdAt: '2026-07-16T16:40:00+09:00',
      },
    ],
  }
}

export let llmKeyStore: LlmKeyDetail[] = initialLlmKeys()
export let llmKeyAccessStore: Record<string, AccessGrant[]> = initialLlmKeyAccessGrants()
function initialAdminLlmKeys(): AdminLlmKey[] {
  const base = {
    orgId: uuid(1),
    orgName: '정보컴퓨터공학부 실습지원센터',
    workspaceId: uuid(12),
    workspaceName: '캡스톤 3조',
    purpose: '관리자 LLM API 키 검증',
    rpm: 60,
    tpm: 40_000,
    dailyTokens: 1_000_000,
    concurrency: 4,
    creditLimit: 5,
    creditLimitReset: 'MONTHLY' as const,
    creditAxisConnected: true,
    quotaExhausted: false,
    expiresAt: null,
    lastUsedAt: '2026-08-20T10:00:00+09:00',
    revokedAt: null,
    createdAt: '2026-08-01T09:00:00+09:00',
  }
  return [
    { ...base, id: uuid(170), name: 'pending-admin-key', status: 'PENDING', requestId: uuid(205), lastUsedAt: null },
    { ...base, id: uuid(171), name: 'active-admin-key', status: 'ACTIVE', requestId: uuid(206) },
    { ...base, id: uuid(172), name: 'suspended-admin-key', status: 'SUSPENDED', requestId: uuid(207) },
    { ...base, id: uuid(173), name: 'expired-admin-key', status: 'EXPIRED', requestId: uuid(208) },
    {
      ...base,
      id: uuid(174),
      name: 'revoked-admin-key',
      status: 'REVOKED',
      requestId: uuid(209),
      revokedAt: '2026-08-21T10:00:00+09:00',
    },
    {
      ...base,
      id: uuid(175),
      name: 'other-org-key',
      status: 'ACTIVE',
      requestId: uuid(210),
      orgId: uuid(2),
      orgName: '테스트 기관',
      workspaceId: uuid(21),
      workspaceName: 'AI 동아리',
    },
  ]
}

export let adminLlmKeyStore: AdminLlmKey[] = initialAdminLlmKeys()
export let adminLlmLimitBodies: Schemas['AdminLlmKeyLimitsRequest'][] = []
let nextGrantId = 380
let nextTokenSuffix = 0

export function resetLlmKeyFixtures() {
  llmKeyStore = initialLlmKeys()
  llmKeyAccessStore = initialLlmKeyAccessGrants()
  adminLlmKeyStore = initialAdminLlmKeys()
  adminLlmLimitBodies = []
  nextGrantId = 380
  nextTokenSuffix = 0
}

/**
 * 그 키의 접근 목록을 관리할 수 있는 사람으로 만든다 — 부여 없는 워크스페이스
 * 소유자가 그렇다. 상세는 여전히 403이고 목록 관리만 열리는, 서버와 같은 조합이다.
 * {@link resetLlmKeyFixtures}가 되돌린다.
 */
export function asLlmKeyGrantManager(keyId: string) {
  const key = llmKeyStore.find((k) => k.id === keyId)
  if (key) key.accessManageAllowed = true
}

/** 접근 목록의 소유자 이름 — 제한 행이 "누구에게 요청하라"고 말할 때 쓴다. */
function grantOwnerNames(keyId: string): string[] {
  return (llmKeyAccessStore[keyId] ?? [])
    .filter((grant) => grant.role === 'OWNER' && grant.user)
    .map((grant) => grant.user!.name)
}

function toSummary(key: LlmKeyDetail): Schemas['LlmKeySummaryResponse'] {
  return {
    id: key.id,
    name: key.name,
    purpose: key.purpose,
    status: key.status,
    tokenPrefix: key.tokenPrefix,
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    rpm: key.rpm,
    tpm: key.tpm,
    concurrency: key.concurrency,
    recordBodies: key.recordBodies,
    workspaceId: key.workspaceId,
    workspaceName: key.workspaceName,
    createdAt: key.createdAt,
    accessLimited: false,
    ownerNames: [],
    // 서버는 제한되지 않은 행에 이 플래그를 늘 false로 넣는다 — 목록 관리 여부는
    // 제한 행에서만 뜻이 있고, 열린 행은 상세가 자기 값을 따로 준다.
    accessManageAllowed: false,
  }
}

/**
 * 접근 권한이 없는 사람이 보는 행 — 이름·상태·소유자뿐이다. 나머지는 서버가
 * null로 내려보내지 값을 0이나 빈 문자열로 채우지 않으므로 mock도 그렇게 한다
 * (콘솔이 그 null을 견디는지가 여기서 드러난다).
 */
function toRestrictedSummary(key: LlmKeyDetail): Schemas['LlmKeySummaryResponse'] {
  return {
    id: key.id,
    name: key.name,
    purpose: null,
    status: key.status,
    tokenPrefix: null,
    expiresAt: null,
    lastUsedAt: null,
    rpm: null,
    tpm: null,
    concurrency: null,
    recordBodies: null,
    workspaceId: key.workspaceId,
    workspaceName: key.workspaceName,
    createdAt: key.createdAt,
    accessLimited: true,
    ownerNames: grantOwnerNames(key.id),
    accessManageAllowed: key.accessManageAllowed,
  }
}

/** 같은 행을 종류 무관 인벤토리 모양으로 옮긴다 — 제한 판단은 여기 한 곳에서만. */
export function toLlmKeyResourceSummary(
  key: LlmKeyDetail,
): Schemas['ResourceSummaryResponse'] {
  const limited = key.myResourceRole == null
  return {
    id: key.id,
    type: 'LLM_API_KEY',
    name: key.name,
    // 키에는 표시명이 없다 — 서버 어댑터도 null을 넣는다.
    displayName: null,
    status: key.status,
    workspaceId: key.workspaceId!,
    workspaceName: key.workspaceName,
    accessLimited: limited,
    ownerNames: limited ? grantOwnerNames(key.id) : [],
    // 인벤토리 행은 키 목록 행을 그대로 옮긴 것이라 같은 규칙을 따른다.
    accessManageAllowed: limited && key.accessManageAllowed,
    createdAt: key.createdAt,
  }
}

/** 서버와 같은 조회 범위 + 같은 정렬(id 내림차순). */
export function visibleLlmKeys(workspaceId?: string | null): LlmKeyDetail[] {
  return llmKeyStore
    .filter((key) => isMyWorkspace(key.workspaceId))
    .filter((key) => !workspaceId || key.workspaceId === workspaceId)
    .sort((a, b) => b.id.localeCompare(a.id))
}

/* ─── 일별 사용량 ─── */

type UsagePoint = Schemas['LlmKeyUsagePointResponse']
type UsageValues = Omit<UsagePoint, 'day'>

/**
 * 사용량 픽스처가 말하는 '오늘'. 실제 오늘을 쓰면 같은 테스트가 날마다 다른
 * 자료를 받으므로 고정한다 — 화면이 읽는 것은 서버가 준 날짜 문자열뿐이다.
 */
export const USAGE_ANCHOR_DAY = '2026-08-11'

const NO_USAGE: UsageValues = {
  requests: 0,
  succeeded: 0,
  rateLimited: 0,
  failed: 0,
  inputTokens: 0,
  outputTokens: 0,
  estimatedRequests: 0,
}

function shiftDay(ymd: string, deltaDays: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + deltaDays * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

interface UsageProfile {
  /** 보고가 한 번도 없었으면 null — 계약이 그 경우를 그렇게 표현한다. */
  reportedUntil: string | null
  /** 오늘로부터 offset일 전의 값. */
  at: (offset: number) => UsageValues
}

const USAGE_PROFILES: Record<string, UsageProfile> = {
  // 실제로 쓰이는 키: 한도에 걸린 날도, 추정이 섞인 날도, 아예 호출이 없던 날도 있다.
  [uuid(70)]: {
    reportedUntil: '2026-08-11T09:20:00+09:00',
    at: (offset) => {
      // 오늘 자는 아직 채워지는 중이라 낮다 — 화면이 그 사실을 말하는지 보는 자료.
      if (offset === 0) {
        return {
          requests: 12,
          succeeded: 12,
          rateLimited: 0,
          failed: 0,
          inputTokens: 7_400,
          outputTokens: 2_600,
          estimatedRequests: 3,
        }
      }
      if (offset === 1) {
        return {
          requests: 140,
          succeeded: 132,
          rateLimited: 6,
          failed: 2,
          inputTokens: 92_000,
          outputTokens: 33_500,
          estimatedRequests: 18,
        }
      }
      // 호출이 없던 날. 구멍이 아니라 0이며, 차트가 그 둘을 같게 그리면 안 된다.
      if (offset === 2) return NO_USAGE
      const wave = (offset * 13) % 47
      const requests = 40 + wave
      return {
        requests,
        succeeded: requests - 2,
        rateLimited: 0,
        failed: 2,
        inputTokens: requests * 620,
        outputTokens: requests * 210,
        estimatedRequests: offset % 6 === 0 ? 4 : 0,
      }
    },
  },
  // 폐기된 키 — 폐기 전까지의 기록은 남고 그 뒤로는 0이다.
  [uuid(73)]: {
    reportedUntil: '2026-07-31T08:00:00+09:00',
    at: (offset) =>
      shiftDay(USAGE_ANCHOR_DAY, -offset) > '2026-07-30'
        ? NO_USAGE
        : {
            requests: 25,
            succeeded: 24,
            rateLimited: 0,
            failed: 1,
            inputTokens: 15_000,
            outputTokens: 5_000,
            estimatedRequests: 0,
          },
  },
  // 발급은 됐지만 한 번도 쓰이지 않은 키 — 게이트웨이 보고 자체가 없다.
  [uuid(74)]: { reportedUntil: null, at: () => NO_USAGE },
}

const NEVER_USED: UsageProfile = { reportedUntil: null, at: () => NO_USAGE }

function usageTrend(keyId: string, days: number): Schemas['LlmKeyUsageTrendResponse'] {
  const profile = USAGE_PROFILES[keyId] ?? NEVER_USED
  const points: UsagePoint[] = []
  // 오래된 날부터 — 계약이 그 순서를 약속한다. 호출이 없던 날도 빠지지 않는다.
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    points.push({ day: shiftDay(USAGE_ANCHOR_DAY, -offset), ...profile.at(offset) })
  }
  const totals = points.reduce(
    (sum, point) => ({
      requests: sum.requests + point.requests,
      failed: sum.failed + point.failed,
      rateLimited: sum.rateLimited + point.rateLimited,
      succeeded: sum.succeeded + point.succeeded,
      inputTokens: sum.inputTokens + point.inputTokens,
      outputTokens: sum.outputTokens + point.outputTokens,
    }),
    { requests: 0, failed: 0, rateLimited: 0, succeeded: 0, inputTokens: 0, outputTokens: 0 },
  )
  // 분해는 실제로 일어난 것만 담는다 — 쓰인 적 없는 키는 빈 배열이고, 화면이
  // 그 상태에서도 서야 한다.
  const used = totals.requests > 0
  return {
    from: points[0].day,
    to: points[points.length - 1].day,
    reportedUntil: profile.reportedUntil,
    points,
    models: used
      ? [
          {
            modelName: 'pickle-general',
            requests: Math.round(totals.requests * 0.7),
            succeeded: Math.round(totals.succeeded * 0.7),
            rateLimited: totals.rateLimited,
            failed: totals.failed,
            inputTokens: Math.round(totals.inputTokens * 0.7),
            outputTokens: Math.round(totals.outputTokens * 0.7),
            estimatedRequests: 0,
            avgLatencyMs: 820,
          },
          {
            modelName: 'openai/gpt-4o-mini',
            requests: totals.requests - Math.round(totals.requests * 0.7),
            succeeded: totals.succeeded - Math.round(totals.succeeded * 0.7),
            rateLimited: 0,
            failed: 0,
            inputTokens: totals.inputTokens - Math.round(totals.inputTokens * 0.7),
            outputTokens: totals.outputTokens - Math.round(totals.outputTokens * 0.7),
            estimatedRequests: 0,
            avgLatencyMs: 1_450,
          },
        ]
      : [],
    errorTypes: totals.failed > 0 ? [{ errorType: 'upstream_error', requests: totals.failed }] : [],
    latency: used ? { p50Ms: 780, p90Ms: 1_900, p99Ms: 4_200, samples: totals.succeeded } : null,
    hourly: used
      ? [
          { weekday: 2, hour: 14, requests: Math.round(totals.requests * 0.4) },
          { weekday: 4, hour: 10, requests: Math.round(totals.requests * 0.6) },
        ]
      : [],
    budget: {
      dailyTokens: 1_000_000,
      todayTokens: used ? 240_000 : 0,
      quotaExhausted: false,
      creditLimit: 10,
      creditUsage: used ? 2.5 : null,
      creditUsageAt: used ? '2026-07-31T08:30:00+09:00' : null,
      creditDepletionForecast: used ? '2026-09-12' : null,
    },
  }
}

function adminActor(request: Request): Schemas['UserProfileResponse'] | undefined {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  return ACCESS_TOKENS[token]
}

function activeAdminRole(
  profile: Schemas['UserProfileResponse'],
  orgId: string | null | undefined,
): Schemas['UserRole'] | undefined {
  if (isSysTier(profile.role)) return profile.role
  return profile.managedOrgs.find((org) => org.orgId === orgId)?.role
}

function canReadAdminKey(profile: Schemas['UserProfileResponse'], key: AdminLlmKey): boolean {
  return isSysTier(profile.role) || profile.managedOrgs.some((org) => org.orgId === key.orgId)
}

function toAdminSummary(key: AdminLlmKey): Schemas['AdminLlmKeySummaryResponse'] {
  return {
    id: key.id,
    name: key.name,
    purpose: key.purpose,
    status: key.status,
    orgId: key.orgId,
    orgName: key.orgName,
    workspaceId: key.workspaceId,
    workspaceName: key.workspaceName,
    requestId: key.requestId,
    rpm: key.rpm,
    tpm: key.tpm,
    dailyTokens: key.dailyTokens,
    concurrency: key.concurrency,
    creditLimit: key.creditLimit,
    creditLimitReset: key.creditLimitReset,
    creditAxisConnected: key.creditAxisConnected,
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
  }
}

export const llmKeyHandlers: RequestHandler[] = [
  http.get('*/api/v1/admin/llm/keys', ({ request }) => {
    const profile = adminActor(request)
    if (!profile) return notFoundProblem()
    const url = new URL(request.url)
    const orgId = url.searchParams.get('orgId')
    const workspaceId = url.searchParams.get('workspaceId')
    const status = url.searchParams.get('status')
    const query = url.searchParams.get('query')?.toLocaleLowerCase('ko-KR')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    let filtered = adminLlmKeyStore.filter((key) => canReadAdminKey(profile, key))
    if (orgId) filtered = filtered.filter((key) => key.orgId === orgId)
    if (workspaceId) filtered = filtered.filter((key) => key.workspaceId === workspaceId)
    if (status) filtered = filtered.filter((key) => key.status === status)
    if (query) {
      filtered = filtered.filter((key) =>
        `${key.name} ${key.purpose ?? ''}`.toLocaleLowerCase('ko-KR').includes(query),
      )
    }
    filtered.sort((a, b) => b.id.localeCompare(a.id))
    return HttpResponse.json(
      {
        content: filtered.slice(page * size, (page + 1) * size).map(toAdminSummary),
        page,
        size,
        totalElements: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / size)),
      } satisfies Schemas['PageResponseAdminLlmKeySummaryResponse'],
      { status: 200 },
    )
  }),

  http.get('*/api/v1/admin/llm/keys/:keyId', ({ params, request }) => {
    const profile = adminActor(request)
    const key = adminLlmKeyStore.find((item) => item.id === String(params.keyId))
    if (!profile || !key || !canReadAdminKey(profile, key)) return notFoundProblem()
    return HttpResponse.json(key, { status: 200 })
  }),

  http.put('*/api/v1/admin/llm/keys/:keyId/limits', async ({ params, request }) => {
    const profile = adminActor(request)
    const key = adminLlmKeyStore.find((item) => item.id === String(params.keyId))
    if (!profile || !key || !canReadAdminKey(profile, key)) return notFoundProblem()
    const role = activeAdminRole(profile, key.orgId)
    if (!role || !['ORG_MANAGER', 'ORG_ADMIN', 'SYS_MANAGER', 'SYS_ADMIN'].includes(role)) {
      return notFoundProblem()
    }
    const body = (await request.json()) as Schemas['AdminLlmKeyLimitsRequest']
    if (
      role === 'SYS_MANAGER' &&
      (body.creditLimit !== key.creditLimit || body.creditLimitReset !== key.creditLimitReset)
    ) {
      return problemResponse({
        type: 'about:blank',
        title: '권한이 없습니다',
        status: 403,
        detail: '시스템 운영자는 금액 한도를 변경할 수 없습니다.',
        code: 'FORBIDDEN',
      })
    }
    adminLlmLimitBodies.push(body)
    Object.assign(key, body)
    return HttpResponse.json(key, { status: 200 })
  }),

  http.post('*/api/v1/admin/llm/keys/:keyId/suspend', async ({ params, request }) => {
    const profile = adminActor(request)
    const key = adminLlmKeyStore.find((item) => item.id === String(params.keyId))
    if (!profile || !key || !canReadAdminKey(profile, key)) return notFoundProblem()
    const role = activeAdminRole(profile, key.orgId)
    if (!role || !['ORG_MANAGER', 'ORG_ADMIN', 'SYS_MANAGER', 'SYS_ADMIN'].includes(role)) {
      return notFoundProblem()
    }
    const body = (await request.json()) as Schemas['SuspendAdminLlmKeyRequest']
    if (!body.reason.trim()) return validationProblem('/api/v1/admin/llm/keys', 'reason', '정지 사유를 입력해 주세요.')
    key.status = 'SUSPENDED'
    return HttpResponse.json(key, { status: 200 })
  }),

  http.post('*/api/v1/admin/llm/keys/:keyId/resume', ({ params, request }) => {
    const profile = adminActor(request)
    const key = adminLlmKeyStore.find((item) => item.id === String(params.keyId))
    if (!profile || !key || !canReadAdminKey(profile, key)) return notFoundProblem()
    const role = activeAdminRole(profile, key.orgId)
    if (!role || !['ORG_MANAGER', 'ORG_ADMIN', 'SYS_MANAGER', 'SYS_ADMIN'].includes(role)) {
      return notFoundProblem()
    }
    key.status = 'ACTIVE'
    return HttpResponse.json(key, { status: 200 })
  }),

  http.get('*/api/v1/llm-keys', ({ request }) => {
    const url = new URL(request.url)
    const workspaceId = url.searchParams.get('workspaceId')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')
    const filtered = visibleLlmKeys(workspaceId)
    const body: Schemas['PageResponseLlmKeySummaryResponse'] = {
      content: filtered
        .slice(page * size, (page + 1) * size)
        .map((key) => (key.myResourceRole == null ? toRestrictedSummary(key) : toSummary(key))),
      page,
      size,
      totalElements: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / size)),
    }
    return HttpResponse.json(body, { status: 200 })
  }),

  http.get('*/api/v1/llm-keys/:keyId', ({ params }) => {
    const key = llmKeyStore.find((k) => k.id === String(params.keyId))
    if (!key) return notFoundProblem()
    // 소속 워크스페이스의 키라도 접근 목록에 없으면 존재만 알고 안은 못 본다.
    if (key.myResourceRole == null) return noGrantProblem(key.id)
    return HttpResponse.json(key, { status: 200 })
  }),

  http.get('*/api/v1/llm-keys/:keyId/usage', ({ params, request }) => {
    const key = llmKeyStore.find((k) => k.id === String(params.keyId))
    if (!key) return notFoundProblem()
    // 사용량은 상세와 같은 문을 쓴다 — 부여가 있어야 열린다.
    if (key.myResourceRole == null) {
      return noGrantProblem(key.id, `/api/v1/llm-keys/${key.id}/usage`)
    }
    const raw = new URL(request.url).searchParams.get('days')
    const days = raw == null ? 30 : Number(raw)
    // 계약은 1..90을 요구한다. 서버는 범위를 잘라 주는 것이 아니라 거절하므로
    // mock도 거절해야 한다 — 잘라 주면 잘못된 days를 보내는 화면이 테스트에서만
    // 멀쩡해 보인다.
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      return validationProblem(
        `/api/v1/llm-keys/${key.id}/usage`,
        'days',
        '조회 일수는 1 이상 90 이하여야 합니다.',
      )
    }
    return HttpResponse.json(usageTrend(key.id, days), { status: 200 })
  }),

  http.post('*/api/v1/llm-keys/:keyId/token', ({ params }) => {
    const key = llmKeyStore.find((k) => k.id === String(params.keyId))
    if (!key) return notFoundProblem()
    // 발급은 부여받은 소유자 등급의 권한이다 — 워크스페이스 소유자의 상시
    // 권한(폐기·목록 관리)은 여기에 닿지 않는다.
    if (!atLeast(key, 'OWNER')) return noGrantProblem(key.id)
    if (key.status === 'REVOKED') {
      return problemResponse({
        type: 'about:blank',
        title: '폐기된 키입니다',
        status: 409,
        detail: '폐기된 키는 다시 발급할 수 없습니다. 새로 신청해 주세요.',
        instance: `/api/v1/llm-keys/${key.id}/token`,
        code: 'LLM_KEY_REVOKED',
      })
    }
    const token = `pk-llm-live-${String(nextTokenSuffix++).padStart(4, '0')}-secret`
    key.tokenPrefix = token.slice(0, 12)
    key.status = 'ACTIVE'
    return HttpResponse.json(
      {
        id: key.id,
        name: key.name,
        token,
        expiresAt: key.expiresAt,
      } satisfies Schemas['IssuedLlmKeyResponse'],
      { status: 200 },
    )
  }),

  http.post('*/api/v1/llm-keys/:keyId/revoke', ({ params, request }) => {
    const adminKey = adminLlmKeyStore.find((item) => item.id === String(params.keyId))
    if (adminKey) {
      const profile = adminActor(request)
      if (!profile || !canReadAdminKey(profile, adminKey)) return notFoundProblem()
      const role = activeAdminRole(profile, adminKey.orgId)
      if (role !== 'ORG_ADMIN' && role !== 'SYS_ADMIN') return notFoundProblem()
      adminKey.status = 'REVOKED'
      adminKey.revokedAt = '2026-08-22T10:00:00+09:00'
      return new HttpResponse(null, { status: 204 })
    }
    const key = llmKeyStore.find((k) => k.id === String(params.keyId))
    if (!key) return notFoundProblem()
    // 폐기는 상시 권한이다 — 유출된 키는 워크스페이스 소유자도 죽일 수 있어야 한다.
    if (!key.accessManageAllowed) return notGrantManagerProblem(key.id)
    if (key.status !== 'REVOKED') {
      key.status = 'REVOKED'
      key.revokedAt = '2026-08-11T10:00:00+09:00'
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.patch('*/api/v1/llm-keys/:keyId', async ({ params, request }) => {
    const key = llmKeyStore.find((k) => k.id === String(params.keyId))
    if (!key) return notFoundProblem()
    if (!atLeast(key, 'EDITOR')) return noGrantProblem(key.id)
    const body = (await request.json()) as Schemas['UpdateLlmKeyRequest']
    // 계약의 크기 제약을 mock도 건다 — 서버가 422로 막는 입력이 여기서 조용히
    // 통과하면, 그 입력을 보내는 화면이 테스트에서는 멀쩡해 보인다.
    if (body.name != null && (body.name.length < 1 || body.name.length > 100)) {
      return validationProblem(
        `/api/v1/llm-keys/${key.id}`,
        'name',
        '키 이름은 1자 이상 100자 이하여야 합니다.',
      )
    }
    if (body.purpose != null && body.purpose.length > 2000) {
      return validationProblem(
        `/api/v1/llm-keys/${key.id}`,
        'purpose',
        '사용 목적은 2000자 이하여야 합니다.',
      )
    }
    // 생략한 항목은 그대로 둔다. 보낸 항목은 서버처럼 다듬어 저장한다 — 공백만
    // 남은 용도는 지우는 것이고, 그 정규화가 mock에 없으면 화면이 "저장했는데
    // 값이 그대로"인 상태에 갇히는 결함을 테스트가 못 잡는다.
    if (body.name != null) key.name = body.name.trim()
    if (body.purpose != null) key.purpose = body.purpose.trim() === '' ? null : body.purpose.trim()
    if (body.recordBodies != null) key.recordBodies = body.recordBodies
    return new HttpResponse(null, { status: 204 })
  }),

  /* ─── 접근 목록 — 키 소유자와 워크스페이스 소유자만 읽고 쓴다 ─── */

  http.get('*/api/v1/llm-keys/:keyId/access', ({ params }) => {
    const key = llmKeyStore.find((k) => k.id === String(params.keyId))
    if (!key) return notFoundProblem()
    if (!key.accessManageAllowed) return notGrantManagerProblem(key.id)
    return HttpResponse.json(
      {
        resource: {
          id: key.id,
          type: 'LLM_API_KEY',
          name: key.name,
          displayName: null,
          status: key.status,
          workspaceId: key.workspaceId!,
          workspaceName: key.workspaceName,
        },
        grants: llmKeyAccessStore[key.id] ?? [],
      } satisfies Schemas['ResourceAccessListResponse'],
      { status: 200 },
    )
  }),

  http.post('*/api/v1/llm-keys/:keyId/access', async ({ params, request }) => {
    const key = llmKeyStore.find((k) => k.id === String(params.keyId))
    if (!key) return notFoundProblem()
    if (!key.accessManageAllowed) return notGrantManagerProblem(key.id)
    const body = (await request.json()) as Schemas['AddResourceAccessGrantRequest']
    const grants = (llmKeyAccessStore[key.id] ??= [])
    if (body.granteeType === 'WORKSPACE') {
      const capped = workspaceWideRoleProblem(body.role)
      if (capped) return capped
      if (grants.some((grant) => grant.granteeType === 'WORKSPACE')) {
        return alreadyListedProblem()
      }
      const grant: AccessGrant = {
        id: uuid(nextGrantId++),
        granteeType: 'WORKSPACE',
        user: null,
        role: body.role,
        createdAt: '2026-08-11T10:00:00+09:00',
      }
      grants.push(grant)
      return HttpResponse.json(grant, { status: 201 })
    }
    const member = workspaceMembersOf(key.workspaceId).find((m) => m.userId === body.userId)
    if (!member) {
      return validationProblem(
        `/api/v1/llm-keys/${key.id}/access`,
        'userId',
        '이 키를 소유한 워크스페이스의 구성원만 접근 권한을 받을 수 있습니다. 먼저 워크스페이스에 추가해 주세요.',
      )
    }
    if (grants.some((grant) => grant.user?.userId === member.userId)) {
      return alreadyListedProblem()
    }
    const grant: AccessGrant = {
      id: uuid(nextGrantId++),
      granteeType: 'USER',
      user: { userId: member.userId, name: member.name, email: member.email },
      role: body.role,
      createdAt: '2026-08-11T10:00:00+09:00',
    }
    grants.push(grant)
    return HttpResponse.json(grant, { status: 201 })
  }),

  http.patch('*/api/v1/llm-keys/:keyId/access/:grantId', async ({ params, request }) => {
    const key = llmKeyStore.find((k) => k.id === String(params.keyId))
    if (!key) return notFoundProblem()
    if (!key.accessManageAllowed) return notGrantManagerProblem(key.id)
    const grant = (llmKeyAccessStore[key.id] ?? []).find((g) => g.id === String(params.grantId))
    if (!grant) return notFoundProblem()
    const body = (await request.json()) as Schemas['UpdateResourceAccessGrantRequest']
    if (grant.granteeType === 'WORKSPACE') {
      const capped = workspaceWideRoleProblem(body.role)
      if (capped) return capped
    }
    grant.role = body.role
    return HttpResponse.json(grant, { status: 200 })
  }),

  http.delete('*/api/v1/llm-keys/:keyId/access/:grantId', ({ params }) => {
    const key = llmKeyStore.find((k) => k.id === String(params.keyId))
    if (!key) return notFoundProblem()
    if (!key.accessManageAllowed) return notGrantManagerProblem(key.id)
    const grants = llmKeyAccessStore[key.id] ?? []
    const index = grants.findIndex((g) => g.id === String(params.grantId))
    if (index < 0) return notFoundProblem()
    grants.splice(index, 1)
    return new HttpResponse(null, { status: 204 })
  }),
]

function atLeast(key: LlmKeyDetail, minimum: ResourceRole): boolean {
  return (
    key.myResourceRole != null &&
    RESOURCE_ROLE_RANK[key.myResourceRole] >= RESOURCE_ROLE_RANK[minimum]
  )
}

/** 워크스페이스 전체 항목은 참여자·열람자까지만 — 서버와 같은 상한. */
function workspaceWideRoleProblem(role: ResourceRole) {
  if (role !== 'OWNER' && role !== 'EDITOR') return null
  return problemResponse({
    type: 'about:blank',
    title: '입력값이 올바르지 않습니다',
    status: 422,
    detail: '워크스페이스 전체에는 참여자 또는 열람자까지만 부여할 수 있습니다.',
    code: 'VALIDATION_FAILED',
    errors: [{ field: 'role', message: '워크스페이스 전체에는 참여자 또는 열람자까지만 부여할 수 있습니다.' }],
  })
}

const alreadyListedProblem = () =>
  problemResponse({
    type: 'about:blank',
    title: '이미 접근 권한이 있습니다',
    status: 409,
    detail:
      '이 대상은 이미 이 LLM API 키의 접근 목록에 있습니다. 등급을 바꾸려면 기존 항목을 수정해 주세요.',
    code: 'LLM_KEY_ACCESS_GRANT_EXISTS',
  })

const validationProblem = (instance: string, field: string, message: string) =>
  problemResponse({
    type: 'about:blank',
    title: '입력값이 올바르지 않습니다',
    status: 422,
    detail: message,
    instance,
    code: 'VALIDATION_FAILED',
    errors: [{ field, message }],
  })

/** 접근 목록이 막는 403 — 계약상 코드는 WORKSPACE_ROLE_INSUFFICIENT 하나다. */
const noGrantProblem = (keyId: string, instance = `/api/v1/llm-keys/${keyId}`) =>
  problemResponse({
    type: 'about:blank',
    title: '이 키에 접근할 권한이 없습니다',
    status: 403,
    detail:
      '이 LLM API 키의 접근 목록에 등록되어 있지 않습니다. 자원 소유자에게 접근 권한을 요청해 주세요.',
    instance,
    code: 'WORKSPACE_ROLE_INSUFFICIENT',
  })

const notGrantManagerProblem = (keyId: string) =>
  problemResponse({
    type: 'about:blank',
    title: '접근 권한을 관리할 권한이 없습니다',
    status: 403,
    detail: '이 LLM API 키의 소유자 또는 워크스페이스 소유자만 접근 권한을 관리할 수 있습니다.',
    instance: `/api/v1/llm-keys/${keyId}/access`,
    code: 'WORKSPACE_ROLE_INSUFFICIENT',
  })

const notFoundProblem = () =>
  problemResponse({
    type: 'about:blank',
    title: '리소스를 찾을 수 없습니다',
    status: 404,
    detail: '해당 LLM API 키가 존재하지 않습니다.',
    code: 'RESOURCE_NOT_FOUND',
  })
