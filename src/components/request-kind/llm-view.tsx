import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import {
  fetchOpenRouterAccounts,
  fetchOpenRouterCatalogue,
  type ApproveRequest,
  type OpenRouterCatalogue,
  type OpenRouterAccount,
  type RequestDetail,
} from '../../api/queries'
import { Alert, Button, Checkbox, FormField, Input, MessageBar, Select, Spinner, Textarea } from '../ui'
import { CreditModelPicker } from '../CreditModelPicker'
import { CreditModelPreview } from '../CreditModelPreview'
import { PassthroughEndpointField } from '../PassthroughEndpointField'
import { AllocationWarning } from '../OpenRouterCredits'
import { evaluateAllocation } from '../../lib/openrouter-credits'
import { adminPaths } from '../../lib/paths'
import {
  creditModelsError,
  formatCreditModels,
  parseCreditModels,
  type CreditModelListKind,
} from '../../lib/credit-model-allowlist'
import { passthroughText } from '../../lib/passthrough-endpoints'
import { todayKstDate } from '../../lib/format'
import { Field } from './Field'
import { periodText } from './period-text'
import type { DecisionData, DecisionFormApi, RequestKindView } from './types'

/** 금액 한도 리셋 창의 표시 이름 — 값은 계약의 CreditLimitReset. */
const CREDIT_RESET_LABELS: Record<string, string> = {
  DAILY: '일일 (UTC 자정 초기화)',
  WEEKLY: '주간 (UTC 자정 초기화)',
  MONTHLY: '월간 (UTC 자정 초기화)',
}

function creditResetText(value: string | null | undefined): string {
  return value ? (CREDIT_RESET_LABELS[value] ?? value) : '총액 상한 (리셋 없음)'
}

/** 금액은 다른 한도와 달리 비움이 기본값이 아니라 0(유료 모델 미사용)이다. */
function creditText(value: number | null | undefined): string {
  return value == null || value === 0
    ? '미부여, 유료 모델 사용 불가'
    : `$${value.toLocaleString('ko-KR')}`
}

function creditError(raw: string): string | undefined {
  const value = raw.trim()
  if (!value) return undefined
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    return '금액 한도는 소수점 둘째 자리까지의 0 이상 숫자로 입력하거나 비워 두세요.'
  return undefined
}

function creditValue(raw: string): number | null {
  const value = raw.trim()
  return value ? Number(value) : null
}

/** 계약이 정한 상한 — 정책이 아니라 수의 폭이다. */
const MAX_RPM = 10_000
const MAX_CONCURRENCY = 100
const MAX_INT32 = 2_147_483_647
const MAX_SAFE = Number.MAX_SAFE_INTEGER

/** 값이 없는 한도를 부르는 말 — 신청·부여 양쪽에서 같은 말을 쓴다. */
function limitText(value: number | null | undefined): string {
  return value == null ? '서비스 기본값' : value.toLocaleString('ko-KR')
}

/** 승인 폼 옆에 붙는 희망값 안내 — 없으면 없다고 말한다. */
function requestedNote(value: number | null | undefined): string {
  return value == null
    ? '신청자가 희망값을 적지 않았습니다. 비우면 서비스 기본값이 적용됩니다.'
    : `신청 희망값 ${value.toLocaleString('ko-KR')}. 비우면 서비스 기본값이 적용됩니다.`
}

/** 비워 둔 한도는 오류가 아니다 — 적어 넣은 값만 검사한다. */
function limitError(raw: string, label: string, max: number): string | undefined {
  const value = raw.trim()
  if (!value) return undefined
  if (!/^\d+$/.test(value)) return `${label}는 0보다 큰 정수로 입력하거나 비워 두세요.`
  const parsed = Number(value)
  if (parsed < 1) return `${label}는 1 이상이어야 합니다.`
  if (parsed > max) return `${label}는 ${max.toLocaleString('ko-KR')} 이하로 입력해 주세요.`
  return undefined
}

function limitValue(raw: string): number | null {
  const value = raw.trim()
  return value ? Number(value) : null
}

/**
 * 이 종류의 결정에는 사전 조회가 없다.
 *
 * VM은 부여 OS를 고르려면 이미지 목록이 있어야 하지만, LLM API 키의 부여 항목은
 * 전부 승인자가 직접 적는 수다. 참조할 카탈로그가 없으니 로딩도 오류도 없고,
 * 결정 카드는 신청 응답만으로 곧바로 열린다.
 */
interface LlmAccountDecisionData {
  accounts: OpenRouterAccount[]
  loading: boolean
  failed: boolean
  retry: () => void
  // 카탈로그는 별도로 실패할 수 있고, 실패해도 승인은 진행된다.
  catalogue: OpenRouterCatalogue | undefined
  catalogueFailed: boolean
}

function useLlmKeyDecisionData(request: RequestDetail): DecisionData {
  const accounts = useQuery({
    queryKey: ['admin', 'llm-accounts', { orgId: request.orgId ?? null }],
    queryFn: () => fetchOpenRouterAccounts(request.orgId ?? undefined),
    enabled: request.orgId != null,
    retry: false,
  })
  // 모델 카탈로그는 캐시를 읽을 뿐이고 편의 계층이다. 실패해도 자유 입력이 남아
  // 있으므로 결정 카드는 물론 유료 모델 승인도 막지 않는다. 계정 조회와 달리
  // 이것이 없다고 승인이 불가능해지는 경우는 없다.
  const catalogue = useQuery({
    queryKey: ['admin', 'openrouter-catalogue'],
    queryFn: fetchOpenRouterCatalogue,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
  // 사업 계정 조회는 유료 모델만 막는다. 자체 서빙 모델만 주는 승인과 반려는 이
  // 조회가 실패해도 살아 있어야 하므로 결정 카드 전체를 막지 않는다.
  const eligibleAccounts = (accounts.data ?? []).filter((account) => account.eligibleForBinding)
  return {
    status: 'ready',
    value: {
      accounts: eligibleAccounts,
      loading: accounts.isPending,
      failed: accounts.isError || request.orgId == null,
      retry: () => void accounts.refetch(),
      catalogue: catalogue.data,
      catalogueFailed: catalogue.isError,
    } satisfies LlmAccountDecisionData,
  }
}

function useLlmKeyApproveForm(request: RequestDetail, value: unknown): DecisionFormApi {
  const spec = request.llmKey
  const accountData = value as LlmAccountDecisionData

  // 한도는 비워 둔 채로 연다 — 희망값을 그대로 채워 두면 승인 버튼 한 번이
  // 곧 "희망대로 부여"가 되어 검토가 사라진다. 희망값은 각 칸 아래에 적어
  // 두고, 부여값은 승인자가 직접 쓴다.
  const [rpm, setRpm] = useState('')
  const [tpm, setTpm] = useState('')
  const [concurrency, setConcurrency] = useState('')
  const [dailyTokens, setDailyTokens] = useState('')
  // 금액은 비움이 기본값 부여가 아니라 미부여(0)다 — 유료 모델을 열려면
  // 승인자가 의도적으로 금액을 적어야 한다.
  // 신청자가 적은 금액에서 시작한다. 종전에는 프리필할 원본이 없어 승인자가 숫자를
  // 만들어 냈다. 부여값은 여전히 승인자가 정하고, 이것은 출발점일 뿐이다.
  const [creditLimit, setCreditLimit] = useState(
    request.llmKey?.reqCreditLimit != null ? String(request.llmKey.reqCreditLimit) : '',
  )
  const [creditReset, setCreditReset] = useState('')
  const [openrouterAccountId, setOpenrouterAccountId] = useState('')
  // 계정 기본값만 예외적으로 미리 채운다. 다른 칸과 달리 채우는 값이 신청자의
  // 희망이 아니라 관리자가 사업 계정에 미리 정해 둔 정책이라, 채워도 검토가
  // 사라지지 않는다. 한 번이라도 손대면 그 뒤로는 계정을 바꿔도 덮지 않는다.
  // 셋은 한 계정이 정해 둔 한 벌이라 프리필도 되돌리기도 함께 움직인다.
  const [creditModels, setCreditModels] = useState('')
  const [creditDeniedModels, setCreditDeniedModels] = useState('')
  // 확장 기능만 빈 값의 뜻이 반대다. 모델 목록 둘은 비면 제한이 풀리지만 이쪽은
  // 비면 아무것도 안 열리므로, 프리필이 없으면 아무 기능도 없는 승인이 된다.
  const [passthroughEndpoints, setPassthroughEndpoints] = useState<readonly string[]>([])
  const [accountDefaultsTouched, setAccountDefaultsTouched] = useState(false)
  const [prefilledFrom, setPrefilledFrom] = useState<string | null>(null)
  // 기간은 종류를 가리지 않는 공통 축이라 VM과 마찬가지로 신청 기간에서 시작한다.
  const [endDate, setEndDate] = useState(request.reqEndDate ?? '')
  const [approveComment, setApproveComment] = useState('')
  // 확인한 내용을 통째로 들고 있다가 지금 값과 대조한다. boolean으로 들면 확인 뒤
  // 모달을 닫고 금액이나 계정을 고쳐 다시 열었을 때 확인이 살아남는다.
  const [acknowledged, setAcknowledged] = useState<string | null>(null)

  // 검증과 제출 본문과 확인 창이 같은 계정을 근거로 삼아야 한다 — 자동 선택 규칙을
  // 세 번 다시 쓰면 한 곳만 고쳤을 때 서로 다른 계정을 말하게 된다.
  const effectiveAccount =
    accountData.accounts.length === 1
      ? accountData.accounts[0]
      : accountData.accounts.find((account) => account.id === openrouterAccountId) ?? null

  // 초과 배정 판정. 계정과 금액이 정해졌을 때만 의미가 있고, 판정 자체는 화면
  // 넷이 공유하는 순수 함수 하나가 한다.
  const pendingCredit = creditValue(creditLimit) ?? 0
  const judgement =
    effectiveAccount && pendingCredit > 0
      ? evaluateAllocation({
          allocation: effectiveAccount.allocation,
          credits: effectiveAccount.credits,
          pendingAmount: pendingCredit,
        })
      : null
  const acknowledgementKey = judgement
    ? JSON.stringify([
        effectiveAccount?.id,
        pendingCredit,
        judgement.state,
        judgement.remaining,
        judgement.balance,
        judgement.observedAt,
      ])
    : null

  const accountDefault = effectiveAccount?.defaultCreditAllowedModels ?? []
  const accountDenyDefault = effectiveAccount?.defaultCreditDeniedModels ?? []
  const accountPassthroughDefault = effectiveAccount?.defaultPassthroughEndpoints ?? []
  const hasAccountDefaults =
    accountDefault.length + accountDenyDefault.length + accountPassthroughDefault.length > 0
  const prefillKey = effectiveAccount?.id ?? null
  if (!accountDefaultsTouched && prefillKey !== prefilledFrom) {
    setPrefilledFrom(prefillKey)
    setCreditModels(formatCreditModels(accountDefault))
    setCreditDeniedModels(formatCreditModels(accountDenyDefault))
    setPassthroughEndpoints(accountPassthroughDefault)
  }

  const parsedCreditModels = parseCreditModels(creditModels)
  const parsedDeniedModels = parseCreditModels(creditDeniedModels)
  // 선택기가 어느 목록에 넣을지는 누른 버튼이 정한다.
  const addModel = (pattern: string, list: CreditModelListKind) => {
    setAccountDefaultsTouched(true)
    if (list === 'ALLOW') {
      setCreditModels(formatCreditModels([...parsedCreditModels, pattern]))
    } else {
      setCreditDeniedModels(formatCreditModels([...parsedDeniedModels, pattern]))
    }
  }

  return {
    validate: () => {
      // 422의 errors[]가 실어 오는 필드 경로와 같은 키를 쓴다 — 서버가 되돌려준
      // 오류가 그대로 같은 입력 칸에 붙는다.
      const errors: Record<string, string> = {}
      const rpmError = limitError(rpm, '분당 요청 수', MAX_RPM)
      if (rpmError) errors['llmKey.grantedRpm'] = rpmError
      const tpmError = limitError(tpm, '분당 토큰 수', MAX_INT32)
      if (tpmError) errors['llmKey.grantedTpm'] = tpmError
      const concurrencyError = limitError(concurrency, '동시 요청 수', MAX_CONCURRENCY)
      if (concurrencyError) errors['llmKey.grantedConcurrency'] = concurrencyError
      const dailyError = limitError(dailyTokens, '일일 토큰 수', MAX_SAFE)
      if (dailyError) errors['llmKey.grantedDailyTokens'] = dailyError
      const creditLimitError = creditError(creditLimit)
      if (creditLimitError) errors['llmKey.grantedCreditLimit'] = creditLimitError
      // 리셋 창은 0보다 큰 금액 위에서만 뜻이 있다 — 서버가 같은 규칙으로 막는다.
      if (!creditLimitError && creditReset && !(Number(creditLimit) > 0)) {
        errors['llmKey.grantedCreditLimit'] = '리셋 창을 두려면 0보다 큰 금액 한도가 필요합니다.'
      }
      if (!creditLimitError && Number(creditLimit) > 0) {
        if (accountData.loading) {
          errors['llmKey.openrouterAccountId'] = '사업 계정 목록을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.'
        } else if (accountData.failed) {
          errors['llmKey.openrouterAccountId'] = '사업 계정 목록을 불러오지 못해 유료 모델을 승인할 수 없습니다.'
        } else if (accountData.accounts.length === 0) {
          errors['llmKey.openrouterAccountId'] = '관리용 키까지 확인된 활성 사업 계정이 필요합니다.'
        } else if (!effectiveAccount) {
          errors['llmKey.openrouterAccountId'] = '어느 사업 계정으로 결제할지 선택해 주세요.'
        }
      }
      // 모델 목록도 리셋 창과 같은 모양이다 — 금액 없이 두면 아무것도 제한하지 않는다.
      const modelsError = creditModelsError(parsedCreditModels, 'ALLOW')
      if (modelsError) {
        errors['llmKey.grantedCreditAllowedModels'] = modelsError
      } else if (parsedCreditModels.length > 0 && !(Number(creditLimit) > 0)) {
        errors['llmKey.grantedCreditLimit'] =
          '모델 허용 목록을 두려면 0보다 큰 금액 한도가 필요합니다.'
      }
      // 차단 목록에는 같은 규칙을 걸지 않는다. 허용 목록은 돈이 없으면 아무것도
      // 열지 않아 잘못 읽은 폼이지만, 차단은 금액이 0이어도 "이 키는 그 모델을 못
      // 쓴다"가 참이고 나중에 누가 금액을 채워도 참으로 남는다. 여기서 막으면
      // 승인자의 거부가 돈이 안 드는 바로 그 순간에 사라졌다가 예산이 붙는 순간
      // 열린다. 서버도 이 규칙을 허용 목록에만 건다.
      const deniedError = creditModelsError(parsedDeniedModels, 'DENY')
      if (deniedError) {
        errors['llmKey.grantedCreditDeniedModels'] = deniedError
      }
      // 요청 하나가 토큰 하나보다 적게 쓸 수는 없다 — 서버가 같은 규칙으로 막는다.
      if (!rpmError && !tpmError && rpm.trim() && tpm.trim()) {
        if (Number(tpm) < Number(rpm))
          errors['llmKey.grantedTpm'] = '분당 토큰 수는 분당 요청 수보다 작을 수 없습니다.'
      }
      return errors
    },

    body: (): ApproveRequest => ({
      // 제출하는 순간에 읽는다. 이유는 vm-view.tsx의 같은 자리에 적어 두었다.
      // 이 화면에서 「발급」은 신청자가 나중에 하는 일이므로(아래 안내 문구) 부여 기간의
      // 시작은 발급일이 아니라 승인일이다.
      grantedStartDate: todayKstDate(),
      grantedEndDate: endDate || null,
      comment: approveComment.trim() ? approveComment.trim() : null,
      // 네 항목이 모두 비어 있어도 llmKey 자체는 실어 보낸다 — 서버는 "기본
      // 한도로 승인한다"는 뜻이 담긴 빈 객체를 요구한다.
      llmKey: {
        grantedRpm: limitValue(rpm),
        grantedTpm: limitValue(tpm),
        grantedConcurrency: limitValue(concurrency),
        grantedDailyTokens: limitValue(dailyTokens),
        grantedCreditLimit: creditValue(creditLimit),
        grantedCreditLimitReset: creditReset
          ? (creditReset as 'DAILY' | 'WEEKLY' | 'MONTHLY')
          : null,
        grantedCreditAllowedModels: parsedCreditModels,
        grantedCreditDeniedModels: parsedDeniedModels,
        // 금액과 무관한 축이라 금액이 0인 승인에서도 그대로 실어 보낸다.
        grantedPassthroughEndpoints: [...passthroughEndpoints],
        openrouterAccountId: Number(creditLimit) > 0 ? effectiveAccount?.id ?? null : null,
      },
    }),

    fields: (fieldErrors) => (
      <>
        <p className="text-sm text-neutral-500">
          부여 한도를 정해 주세요. 비워 둔 항목은 서비스 기본 한도로 발급되며, 그것이
          보통의 승인입니다. 신청자의 희망값은 각 항목 아래에 적어 두었습니다.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="부여 분당 요청 수"
            error={fieldErrors['llmKey.grantedRpm']}
            description={requestedNote(spec?.reqRpm)}
          >
            <Input
              type="number"
              min={1}
              max={MAX_RPM}
              value={rpm}
              onChange={(event) => setRpm(event.target.value)}
              placeholder="서비스 기본값"
            />
          </FormField>
          <FormField
            label="부여 분당 토큰 수"
            error={fieldErrors['llmKey.grantedTpm']}
            description={requestedNote(spec?.reqTpm)}
          >
            <Input
              type="number"
              min={1}
              value={tpm}
              onChange={(event) => setTpm(event.target.value)}
              placeholder="서비스 기본값"
            />
          </FormField>
          <FormField
            label="부여 일일 토큰 수"
            error={fieldErrors['llmKey.grantedDailyTokens']}
            description={requestedNote(spec?.reqDailyTokens)}
          >
            <Input
              type="number"
              min={1}
              value={dailyTokens}
              onChange={(event) => setDailyTokens(event.target.value)}
              placeholder="서비스 기본값"
            />
          </FormField>
          <FormField
            label="부여 동시 요청 수"
            error={fieldErrors['llmKey.grantedConcurrency']}
            // 신청서에 대응하는 칸이 아예 없는 유일한 항목이다 — 승인자가 정하지
            // 않으면 아무도 정하지 않는다는 사실을 여기서 말해 둔다.
            description="신청서에 대응하는 항목이 없어 승인자만 정합니다. 비우면 서비스 기본값이 적용됩니다."
          >
            <Input
              type="number"
              min={1}
              max={MAX_CONCURRENCY}
              value={concurrency}
              onChange={(event) => setConcurrency(event.target.value)}
              placeholder="서비스 기본값"
            />
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="부여 금액 한도 (USD)"
            error={fieldErrors['llmKey.grantedCreditLimit']}
            description="유료 모델(OpenRouter 경유)에 쓸 수 있는 금액입니다. 비우거나 0이면 유료 모델을 쓸 수 없습니다."
          >
            <Input
              type="number"
              min={0}
              step="0.01"
              value={creditLimit}
              onChange={(event) => setCreditLimit(event.target.value)}
              placeholder="0 (유료 모델 미사용)"
            />
          </FormField>
          <FormField
            label="금액 한도 리셋 창"
            description="비우면 리셋 없는 총액 상한입니다. 리셋 창은 UTC 자정에 초기화됩니다."
          >
            <Select
              value={creditReset}
              onChange={(event) => setCreditReset(event.target.value)}
            >
              <option value="">총액 상한 (리셋 없음)</option>
              <option value="DAILY">{CREDIT_RESET_LABELS.DAILY}</option>
              <option value="WEEKLY">{CREDIT_RESET_LABELS.WEEKLY}</option>
              <option value="MONTHLY">{CREDIT_RESET_LABELS.MONTHLY}</option>
            </Select>
          </FormField>
        </div>
        {approvalAccountField({
          request,
          data: accountData,
          value: openrouterAccountId,
          onChange: setOpenrouterAccountId,
          error: fieldErrors['llmKey.openrouterAccountId'],
        })}
        <FormField
          label="허용할 유료 모델"
          error={fieldErrors['llmKey.grantedCreditAllowedModels']}
          description="한 줄에 하나씩 적습니다. 비우면 금액 한도 안에서 모든 유료 모델을 쓸 수 있습니다. 벤더 전체는 openai/*, 계열은 openai/gpt-5-*, 티어는 openai/*-pro 처럼 적습니다. ~로 시작하는 이름은 최신 모델을 따라가는 별칭이라 openai/* 에 포함되지 않고 ~openai/* 로 따로 열어야 합니다. 자체 서빙 모델은 이 목록과 무관하게 쓸 수 있습니다."
        >
          <Textarea
            rows={4}
            value={creditModels}
            onChange={(event) => {
              setAccountDefaultsTouched(true)
              setCreditModels(event.target.value)
            }}
            placeholder={'openai/gpt-4o-mini\nanthropic/claude-sonnet-4'}
          />
        </FormField>
        <FormField
          label="차단할 유료 모델"
          error={fieldErrors['llmKey.grantedCreditDeniedModels']}
          description="여기 적은 모델은 허용 목록에 들어 있어도 쓸 수 없습니다. 계열을 열어 두고 비싼 모델 몇 개만 빼는 자리입니다. 비우면 차단이 없습니다."
        >
          <Textarea
            rows={3}
            value={creditDeniedModels}
            onChange={(event) => {
              setAccountDefaultsTouched(true)
              setCreditDeniedModels(event.target.value)
            }}
            placeholder={'openai/*-pro'}
          />
        </FormField>
        <CreditModelPicker
          catalogue={accountData.catalogue}
          failed={accountData.catalogueFailed}
          allowed={parsedCreditModels}
          denied={parsedDeniedModels}
          onAdd={addModel}
        />
        <CreditModelPreview
          catalogue={accountData.catalogue}
          failed={accountData.catalogueFailed}
          allowed={parsedCreditModels}
          denied={parsedDeniedModels}
          invalid={
            creditModelsError(parsedCreditModels, 'ALLOW') != null ||
            creditModelsError(parsedDeniedModels, 'DENY') != null
          }
        />
        <PassthroughEndpointField
          label="부여할 확장 기능"
          value={passthroughEndpoints}
          onChange={(next) => {
            setAccountDefaultsTouched(true)
            setPassthroughEndpoints(next)
          }}
        />
        {!accountDefaultsTouched && hasAccountDefaults ? (
          <p className="text-sm text-neutral-500">
            {effectiveAccount?.name} 계정의 기본값에서 채웠습니다. 이 승인에만 적용되며,
            계정 기본값을 나중에 바꿔도 발급된 키는 그대로입니다.
          </p>
        ) : null}
        {accountDefaultsTouched && hasAccountDefaults ? (
          <p className="text-sm text-neutral-500">
            <button
              type="button"
              className="underline"
              onClick={() => {
                setAccountDefaultsTouched(false)
                setCreditModels(formatCreditModels(accountDefault))
                setCreditDeniedModels(formatCreditModels(accountDenyDefault))
                setPassthroughEndpoints(accountPassthroughDefault)
              }}
            >
              {effectiveAccount?.name} 계정의 기본값으로 되돌리기
            </button>
          </p>
        ) : null}
        {judgement ? (
          <AllocationWarning judgement={judgement} pendingLabel={creditText(pendingCredit)} />
        ) : null}
        <FormField
          label="사용 종료일"
          error={fieldErrors.grantedEndDate}
          description="비우면 만료되지 않습니다. 사용 시작일은 승인하는 날로 정해집니다."
        >
          <Input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </FormField>
        <FormField label="승인 의견" description="신청자에게 전달됩니다. (선택)">
          <Textarea
            value={approveComment}
            onChange={(event) => setApproveComment(event.target.value)}
            maxLength={2000}
            placeholder="기본 한도로 승인합니다."
          />
        </FormField>
      </>
    ),

    confirmBody: (
      <div className="space-y-2 text-sm text-neutral-600">
        <p>아래 한도로 승인하시겠습니까?</p>
        <ul className="space-y-0.5 font-medium text-neutral-800">
          <li>분당 요청 수 {limitText(limitValue(rpm))}</li>
          <li>분당 토큰 수 {limitText(limitValue(tpm))}</li>
          <li>일일 토큰 수 {limitText(limitValue(dailyTokens))}</li>
          <li>동시 요청 수 {limitText(limitValue(concurrency))}</li>
          <li>금액 한도 {creditText(creditValue(creditLimit))}</li>
          {creditValue(creditLimit) ? <li>리셋 창 {creditResetText(creditReset || null)}</li> : null}
          {creditValue(creditLimit) ? (
            <li>사업 계정 {effectiveAccount?.name ?? '선택 필요'}</li>
          ) : null}
          {creditValue(creditLimit) ? (
            <li>
              허용 유료 모델{' '}
              {parsedCreditModels.length === 0
                ? '제한 없음 (금액 한도 안에서 전부)'
                : parsedCreditModels.join(', ')}
            </li>
          ) : null}
          {/*
            차단 줄만 금액 게이트 밖에 둔다. 금액이 없으면 허용 목록은 아무것도 열지
            않아 말할 것이 없지만, 차단은 금액 없이도 승인자가 내린 결정이고 되돌릴
            수 없는 부여 직전 마지막 화면이 그것을 안 보여 주면 반영됐는지 확인할
            자리가 없다. 검증에서 같은 게이트를 걷어낸 것과 같은 이유다.
          */}
          {creditValue(creditLimit) || parsedDeniedModels.length > 0 ? (
            <li>
              차단 유료 모델{' '}
              {parsedDeniedModels.length === 0 ? '없음' : parsedDeniedModels.join(', ')}
            </li>
          ) : null}
          {/*
            확장 기능은 금액 게이트 밖에 언제나 선다. 위 두 줄과 달리 비어 있는 것이
            부여의 부재라서, 안 보이면 승인자가 무엇을 안 줬는지 확인할 자리가 없다.
          */}
          <li>확장 기능 {passthroughText(passthroughEndpoints)}</li>
        </ul>
        {creditValue(creditLimit) ? (
          <Alert variant="warning">
            이 키가 어느 사업 계정으로 결제되는지는 발급 뒤 바꿀 수 없습니다. 옮기려면 새 키를 발급해 전환해야 합니다.
          </Alert>
        ) : null}
        {judgement ? (
          <AllocationWarning judgement={judgement} pendingLabel={creditText(pendingCredit)} />
        ) : null}
        {judgement?.needsAcknowledgement ? (
          <Checkbox
            checked={acknowledged === acknowledgementKey}
            onChange={(event) =>
              setAcknowledged(event.target.checked ? acknowledgementKey : null)
            }
            label="초과 배정임을 확인했습니다"
          />
        ) : null}
        <p>
          승인하면 키가 만들어지지만 아직 쓸 수 없습니다. 평문 키는 신청자가 직접
          발급받습니다.
        </p>
      </div>
    ),

    confirmReady: !judgement?.needsAcknowledgement || acknowledged === acknowledgementKey,

    successMessage: '신청을 승인했습니다. 신청자가 LLM API 키를 발급받을 수 있습니다.',
  }
}

function approvalAccountField({
  request,
  data,
  value,
  onChange,
  error,
}: {
  request: RequestDetail
  data: LlmAccountDecisionData
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  if (data.loading) {
    return <div className="flex justify-center py-2"><Spinner label="OpenRouter 사업 계정 확인 중" /></div>
  }
  if (data.failed) {
    return (
      <Alert variant="warning" title="사업 계정 목록을 불러오지 못했습니다">
        <div className="space-y-2">
          <p>자체 서빙 모델만 주는 승인은 계속할 수 있지만, 유료 모델은 목록을 확인할 때까지 막힙니다.</p>
          {error && <p className="font-medium text-danger-800">{error}</p>}
          <Button size="sm" variant="secondary" onClick={data.retry}>다시 시도</Button>
        </div>
      </Alert>
    )
  }
  if (data.accounts.length === 0) {
    return (
      <MessageBar variant="warning" title="유료 모델을 결제할 사업 계정이 없습니다">
        <Link
          to={adminPaths.llmAccounts(request.orgId ?? undefined)}
          className="font-semibold underline underline-offset-2"
        >
          OpenRouter 사업 계정 관리
        </Link>
        에서 관리용 키를 먼저 등록하세요. 자체 서빙 모델만 주는 승인은 계속할 수 있습니다.
        {error && <p className="mt-1 font-medium text-warning-900">{error}</p>}
      </MessageBar>
    )
  }
  if (data.accounts.length === 1) {
    return (
      <MessageBar title="사업 계정 자동 선택">
        연결할 수 있는 사업 계정이 {data.accounts[0].name} 하나뿐이라 금액을 부여하면 자동으로 선택됩니다.
      </MessageBar>
    )
  }
  return (
    <FormField
      label="OpenRouter 사업 계정"
      error={error}
      description="금액을 부여할 때만 필요합니다. 한 번 정해지면 바꿀 수 없습니다."
    >
      <Select value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={error != null}>
        <option value="">사업 계정 선택</option>
        {data.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
      </Select>
    </FormField>
  )
}

export const llmKeyRequestView: RequestKindView = {
  // 결정에 필요한 카탈로그가 없으므로 미리 당겨 둘 것도 없다.
  decisionPrefetchQueries: [],
  useDecisionData: useLlmKeyDecisionData,
  // 폼이 쓰는 것은 신청 응답뿐이다 — useDecisionData가 넘기는 값(카탈로그 자리)은
  // 이 종류에 없으므로 인자로 받지도 않는다.
  useApproveForm: useLlmKeyApproveForm,

  summaryCell: (request) => {
    const spec = request.llmKey
    // 화면 다른 곳과 같은 말을 쓴다 — 큐에서만 줄임말을 쓰면 같은 수가 두 이름을 갖는다.
    const asked = [
      spec?.reqRpm == null ? null : `분당 요청 ${spec.reqRpm.toLocaleString('ko-KR')}`,
      spec?.reqTpm == null ? null : `분당 토큰 ${spec.reqTpm.toLocaleString('ko-KR')}`,
    ].filter((entry) => entry !== null)
    return (
      <>
        <span className="block">
          {asked.length > 0 ? asked.join(' · ') : '기본 한도로 신청'}
        </span>
        <span className="block text-xs text-neutral-500">
          {spec?.reqDailyTokens == null
            ? '일일 토큰 기본값'
            : `일일 토큰 ${spec.reqDailyTokens.toLocaleString('ko-KR')}`}
        </span>
      </>
    )
  },

  contentFields: (data) => (
    <>
      <Field label="워크스페이스">{data.workspaceName}</Field>
      <Field label="기관">{data.orgName}</Field>
      <Field label="사용 기간">
        {periodText(data)}
      </Field>
      <Field label="용도">{data.purpose}</Field>
      {/* 비어 있는 희망 한도는 빠뜨린 값이 아니라 "기본값이면 된다"는 답이다. */}
      <Field label="쓸 모델">
        {[
          data.llmKey?.useCampusModels ? '자체 서빙 모델' : null,
          data.llmKey?.useCommercialModels ? '유료 모델' : null,
        ]
          .filter(Boolean)
          .join(', ') || '—'}
      </Field>
      <Field label="희망 금액 한도">
        {data.llmKey?.reqCreditLimit != null
          ? `$${data.llmKey.reqCreditLimit.toLocaleString('ko-KR')}`
          : data.llmKey?.useCommercialModels
            ? '적지 않음'
            : '—'}
      </Field>
      <Field label="희망 분당 요청 수">{limitText(data.llmKey?.reqRpm)}</Field>
      <Field label="희망 분당 토큰 수">{limitText(data.llmKey?.reqTpm)}</Field>
      <Field label="희망 일일 토큰 수">{limitText(data.llmKey?.reqDailyTokens)}</Field>
      <Field label="기타 참고">{data.extraNote ?? '—'}</Field>
      <Field label="표시명">{data.displayName}</Field>
    </>
  ),

  resultFields: (data) => {
    if (data.review?.decision !== 'APPROVE') return null
    const spec = data.llmKey
    return (
      <>
        <Field label="부여 분당 요청 수">{limitText(spec?.grantedRpm)}</Field>
        <Field label="부여 분당 토큰 수">{limitText(spec?.grantedTpm)}</Field>
        <Field label="부여 일일 토큰 수">{limitText(spec?.grantedDailyTokens)}</Field>
        <Field label="부여 동시 요청 수">{limitText(spec?.grantedConcurrency)}</Field>
        <Field label="부여 금액 한도">{creditText(spec?.grantedCreditLimit)}</Field>
        {spec?.grantedCreditLimit ? (
          <Field label="금액 리셋 창">{creditResetText(spec?.grantedCreditLimitReset)}</Field>
        ) : null}
        {spec?.grantedCreditLimit ? (
          <Field label="허용 유료 모델">
            {spec.grantedCreditAllowedModels.length === 0
              ? '제한 없음 (금액 한도 안에서 전부)'
              : spec.grantedCreditAllowedModels.join(', ')}
          </Field>
        ) : null}
        {/* 금액이 얼마든 차단은 승인자가 내린 결정이라 결과 카드에 남아야 한다. */}
        {spec && spec.grantedCreditDeniedModels.length > 0 ? (
          <Field label="차단 유료 모델">{spec.grantedCreditDeniedModels.join(', ')}</Field>
        ) : null}
        {/* 부여되지 않았다는 것이 이 축의 결정이라 빈 값도 남는다. */}
        <Field label="확장 기능">
          {passthroughText(spec?.grantedPassthroughEndpoints ?? [])}
        </Field>
        <Field label="부여 기간">
          {data.review.grantedStartDate ?? '미지정'} ~{' '}
          {data.review.grantedEndDate ?? '미지정'}
        </Field>
      </>
    )
  },
}
