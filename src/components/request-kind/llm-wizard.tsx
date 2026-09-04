import { useState } from 'react'
import { Alert, Checkbox, FormField, Input } from '../ui'
import { LLM_DEFAULT_MODEL } from '../../lib/llm-api'
import type { FieldErrors, KindWizard, RequestKindModule, WizardStepId } from './types'

/**
 * LLM API 키 스펙 입력 상태 — 신청 초안의 spec 부분으로 그대로 직렬화된다.
 *
 * 한도 세 개를 숫자가 아닌 문자열로 들고 있는 것은 의도다: 이 종류의 입력은
 * 비어 있는 것이 정상이고, 숫자 상태로는 "비움"과 "0"을 구분할 수 없다.
 */
interface LlmKeySpecState {
  /**
   * 어느 축을 쓸지. 한도가 비어 있는 것으로는 알 수 없다. 빈 한도는 "서비스 기본값"이지
   * "그 축은 안 쓴다"가 아니다.
   */
  useCampus: boolean
  useCommercial: boolean
  reqDailyTokens: string
  reqCreditLimit: string
}

const INITIAL_SPEC: LlmKeySpecState = {
  // 두 축 모두 꺼진 채로 연다. 무엇을 쓸지는 신청자가 말해야 하는 것이지 화면이
  // 대신 골라 줄 것이 아니고, 둘 다 끄면 넘어가지 않으므로 빠뜨릴 수도 없다.
  useCampus: false,
  useCommercial: false,
  reqDailyTokens: '',
  reqCreditLimit: '',
}

/** 요청 금액의 상한. 계약이 정한 수의 폭이다. */
const MAX_CREDIT = 100_000

/** reqDailyTokens는 64비트지만, 자바스크립트가 정확히 셀 수 있는 데까지만 받는다. */
const MAX_SAFE = Number.MAX_SAFE_INTEGER

/**
 * 비워 둔 한도는 오류가 아니다 — 적어 넣은 값만 검사한다.
 * 라벨은 전부 '수'로 끝나므로 뒤에 '는'이 붙는다.
 */
function limitError(raw: string, label: string, max: number): string | undefined {
  const value = raw.trim()
  if (!value) return undefined
  if (!/^\d+$/.test(value)) return `${label}는 0보다 큰 정수로 입력하거나 비워 두세요.`
  const parsed = Number(value)
  if (parsed < 1) return `${label}는 1 이상이어야 합니다.`
  if (parsed > max) return `${label}는 ${max.toLocaleString('ko-KR')} 이하로 입력해 주세요.`
  return undefined
}

/** 빈 칸은 null로 보낸다 — 서비스 기본값을 받겠다는 뜻이다. */
function limitValue(raw: string): number | null {
  const value = raw.trim()
  return value ? Number(value) : null
}

/** 요약·확인 화면에서 비워 둔 한도를 부르는 말. */
function limitLabel(raw: string): string {
  const value = raw.trim()
  return value ? Number(value).toLocaleString('ko-KR') : '서비스 기본값'
}

function useLlmKeyWizard(draftSpec: unknown): KindWizard {
  const [spec, setSpec] = useState<LlmKeySpecState>(() => ({
    ...INITIAL_SPEC,
    ...(typeof draftSpec === 'object' && draftSpec != null ? draftSpec : null),
  }))

  const update = (patch: Partial<LlmKeySpecState>) =>
    setSpec((prev) => ({ ...prev, ...patch }))

  const validateStep = (step: WizardStepId): FieldErrors => {
    const next: FieldErrors = {}
    if (step !== 'resource') return next
    // 422의 errors[]가 실어 오는 필드 경로와 같은 키를 쓴다 — 서버가 되돌려준
    // 오류가 그대로 같은 입력 칸에 붙는다.
    // 축은 한도와 다르다. 비워 둔 한도는 기본값이지만, 축을 다 끄면 무엇을 달라는
    // 것인지 말하지 않은 것이다. 서버가 같은 규칙으로 막는다.
    if (!spec.useCampus && !spec.useCommercial)
      next['llmKey.useCampusModels'] = '자체 서빙 모델과 유료 모델 중 최소 하나는 선택해 주세요.'
    if (spec.useCommercial && spec.reqCreditLimit.trim()) {
      const amount = Number(spec.reqCreditLimit)
      if (!Number.isFinite(amount) || amount <= 0)
        next['llmKey.reqCreditLimit'] = '금액은 0보다 커야 합니다.'
      else if (amount > MAX_CREDIT)
        next['llmKey.reqCreditLimit'] = `금액은 ${MAX_CREDIT.toLocaleString('ko-KR')} 이하로 입력해 주세요.`
    }
    const daily = limitError(spec.reqDailyTokens, '일일 토큰 수', MAX_SAFE)
    if (daily) next['llmKey.reqDailyTokens'] = daily
    return next
  }

  return {
    spec,
    // 이 종류에는 고를 카탈로그가 없다 — OS 목록 같은 사전 조회가 필요 없으므로
    // 화면의 로딩·오류 게이트에 보탤 것도 없다.
    isPending: false,
    error: null,
    validateStep,

    resourceFields: (errors) => (
      <>
        <fieldset className="flex flex-col gap-3">
          <legend className="flex items-center gap-0.5 text-sm font-medium text-foreground-secondary">
            무엇을 쓸까요
            <span aria-hidden="true" className="text-danger-600">
              *
            </span>
          </legend>
          <p className="text-xs text-foreground-muted">둘 다 쓸 수 있습니다.</p>
          {errors['llmKey.useCampusModels'] && (
            <p role="alert" className="text-sm text-danger-600">
              {errors['llmKey.useCampusModels']}
            </p>
          )}

          {/* 축을 켜야 그 축의 한도가 나온다. 한 줄에 나란히 두면 금액 칸이 토큰 축만
              쓰는 신청에도 보이고, 어느 한도가 어느 축의 것인지가 배치로 드러나지 않는다. */}
          <div className="space-y-3">
            <Checkbox
              label="Pickle LLM"
              description={`학교가 직접 서빙합니다. 돈이 들지 않고 토큰 한도로 씁니다. 모델 이름은 ${LLM_DEFAULT_MODEL}입니다.`}
              checked={spec.useCampus}
              onChange={(event) =>
                update({
                  useCampus: event.target.checked,
                  // 끄면 그 축의 한도를 남기지 않는다. 남으면 화면에 없는 값이 제출된다.
                  ...(event.target.checked ? {} : { reqDailyTokens: '' }),
                })
              }
            />
            {spec.useCampus && (
              <div className="ml-7">
                {/* 분당 한도는 묻지 않는다. 신청자가 판단할 수 있는 수가 아니고, 실제로
                    모자라는 것은 하루치다. 분당 쪽은 승인 화면에 남아 관리자가 다룬다. */}
                <FormField
                  label="희망 일일 토큰 수"
                  error={errors['llmKey.reqDailyTokens']}
                  description="하루에 쓸 토큰 상한입니다. 자정(KST)에 초기화됩니다."
                >
                  <Input
                    type="number"
                    min={1}
                    value={spec.reqDailyTokens}
                    onChange={(event) => update({ reqDailyTokens: event.target.value })}
                    placeholder="예: 200000"
                    className="w-56"
                  />
                </FormField>
              </div>
            )}

            <Checkbox
              label="유료 모델"
              description="외부 유료 모델입니다. 쓴 만큼 돈이 들어 금액 한도로 씁니다."
              checked={spec.useCommercial}
              onChange={(event) =>
                update({
                  useCommercial: event.target.checked,
                  reqCreditLimit: event.target.checked ? spec.reqCreditLimit : '',
                })
              }
            />
            {spec.useCommercial && (
              <div className="ml-7">
                <FormField
                  label="희망 금액 한도 (USD)"
                  error={errors['llmKey.reqCreditLimit']}
                  description="이 키가 유료 모델에 쓸 수 있는 금액 상한입니다. 다 쓰면 호출이 거절됩니다."
                >
                  <Input
                    type="number"
                    min={0.01}
                    step={0.01}
                    max={MAX_CREDIT}
                    value={spec.reqCreditLimit}
                    onChange={(event) => update({ reqCreditLimit: event.target.value })}
                    placeholder="예: 20"
                    className="w-44"
                  />
                </FormField>
              </div>
            )}
          </div>
        </fieldset>

      </>
    ),

    // 켜지 않은 축의 한도는 요약에도 싣지 않는다. 화면에서 묻지 않은 값이 확인
    // 단계에만 나타나면, 신청자는 자기가 적지 않은 것을 확인하게 된다.
    reviewRows: () => ({
      resource: [
        [
          '쓸 모델',
          [spec.useCampus ? 'Pickle LLM' : null, spec.useCommercial ? '유료 모델' : null]
            .filter(Boolean)
            .join(', ') || '미선택',
        ],
        ...(spec.useCampus
          ? ([
              ['희망 일일 토큰 수', limitLabel(spec.reqDailyTokens)],
            ] as [string, string][])
          : []),
        ...(spec.useCommercial
          ? ([
              [
                '희망 금액 한도',
                spec.reqCreditLimit.trim()
                  ? `$${Number(spec.reqCreditLimit).toLocaleString('ko-KR')}`
                  : '관리자가 정함',
              ],
            ] as [string, string][])
          : []),
      ],
    }),

    notice: (
      <Alert variant="info" title="한도 확정 안내">
        희망 한도는 참고 자료입니다. 실제 부여 한도는 관리자가 승인할 때 정하며,
        고치지 않은 항목은 위에 적힌 기본 한도로 발급됩니다.
      </Alert>
    ),

    payload: () => ({
      type: 'LLM_API_KEY',
      llmKey: {
        useCampusModels: spec.useCampus,
        useCommercialModels: spec.useCommercial,
        // 유료를 끈 신청은 금액을 싣지 않는다. 서버도 스키마도 같은 규칙이다.
        reqCreditLimit:
          spec.useCommercial && spec.reqCreditLimit.trim()
            ? Number(spec.reqCreditLimit)
            : null,
        // 토큰 축을 끈 신청은 그 축의 한도를 싣지 않는다.
        // 그리고 **기본값 그대로면 비운 것과 같이 보낸다** — 화면이 숫자를 보여 주려고
        // 채워 둔 것이지 신청자가 그 값을 요구한 것이 아니고, 배포 기본값이 바뀌면
        // 그때의 기본값을 받는 것이 맞다.
        // 분당 한도는 이 화면이 묻지 않는다. 비운 신청은 배포된 기본 한도를 받는다.
        reqRpm: null,
        reqTpm: null,
        reqDailyTokens: spec.useCampus ? limitValue(spec.reqDailyTokens) : null,
      },
    }),
  }
}

export const llmKeyRequestKind: RequestKindModule = {
  type: 'LLM_API_KEY',
  picker: {
    title: 'LLM API 키',
    description: '코드에서 교내 LLM API를 호출할 때 쓰는 자격증명입니다.',
  },
  copy: {
    noWorkspaceNotice:
      'LLM API 키를 신청할 수 있는 워크스페이스가 없습니다. 워크스페이스에 속해 있어야 신청할 수 있습니다.',
  },
  fields: {
    llmKey: { label: 'LLM API 키 신청 항목', step: 'resource' },
    'llmKey.useCampusModels': { label: '쓸 모델', step: 'resource' },
    'llmKey.useCommercialModels': { label: '쓸 모델', step: 'resource' },
    'llmKey.reqCreditLimit': { label: '희망 금액 한도', step: 'resource' },
    'llmKey.reqRpm': { label: '희망 분당 요청 수', step: 'resource' },
    'llmKey.reqTpm': { label: '희망 분당 토큰 수', step: 'resource' },
    'llmKey.reqDailyTokens': { label: '희망 일일 토큰 수', step: 'resource' },
  },
  useWizard: useLlmKeyWizard,
}
