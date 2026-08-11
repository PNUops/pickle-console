import { useState } from 'react'
import { Alert, FormField, Input, Textarea } from '../ui'
import type {
  FieldErrors,
  KindWizard,
  RequestKindModule,
  WizardStepId,
} from './types'

/**
 * LLM API 키 스펙 입력 상태 — 신청 초안의 spec 부분으로 그대로 직렬화된다.
 *
 * 한도 세 개를 숫자가 아닌 문자열로 들고 있는 것은 의도다: 이 종류의 입력은
 * 비어 있는 것이 정상이고, 숫자 상태로는 "비움"과 "0"을 구분할 수 없다.
 */
interface LlmKeySpecState {
  usagePlan: string
  reqRpm: string
  reqTpm: string
  reqDailyTokens: string
}

const INITIAL_SPEC: LlmKeySpecState = {
  usagePlan: '',
  reqRpm: '',
  reqTpm: '',
  reqDailyTokens: '',
}

const SPEC_FIELDS = ['usagePlan', 'reqRpm', 'reqTpm', 'reqDailyTokens'] as const

/** 계약이 정한 상한 — 정책이 아니라 수의 폭이다 (분당 요청 수만 서버가 따로 막는다). */
const MAX_RPM = 10_000
/** 계약의 reqTpm은 32비트 정수다 — 더 큰 값은 서버에 닿기 전에 뜻을 잃는다. */
const MAX_INT32 = 2_147_483_647
/** reqDailyTokens는 64비트지만, 자바스크립트가 정확히 셀 수 있는 데까지만 받는다. */
const MAX_SAFE = Number.MAX_SAFE_INTEGER

/**
 * 저장된 초안의 LLM API 키 스펙 부분이 지금 모양인지.
 *
 * 모르는 키가 하나라도 있으면 버린다 — 다른 종류의 초안(그리고 필드가 갈라지기
 * 전의 평평한 초안)은 값의 타입만 봐서는 통과할 수 있는데, 그렇게 들어온 초안은
 * 화면에는 빈 칸으로 보이면서 제출 본문에는 남의 종류 필드를 싣는다.
 * 모양이 다르면 초안 전체가 버려진다(판단은 위저드 본체).
 */
function isCompatibleSpecDraft(
  value: unknown,
): value is Partial<LlmKeySpecState> | null | undefined {
  if (value === undefined || value === null) return true
  if (typeof value !== 'object') return false
  const draft = value as Record<string, unknown>
  const known: readonly string[] = SPEC_FIELDS
  for (const key of Object.keys(draft)) {
    if (!known.includes(key)) return false
  }
  for (const field of SPEC_FIELDS) {
    const entry = draft[field]
    if (entry === undefined) continue
    // null도 거른다 — 이 종류의 초안은 빈 칸을 빈 문자열로 적는다. null이 들어
    // 있다면 이 화면이 쓴 초안이 아니고, 그대로 상태에 들어가면 다음 입력에서
    // trim()·length가 터진다 (타입은 string이라 컴파일러는 잡지 못한다).
    if (typeof entry !== 'string') return false
  }
  return true
}

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
    ...(isCompatibleSpecDraft(draftSpec) ? draftSpec : null),
  }))

  const update = (patch: Partial<LlmKeySpecState>) =>
    setSpec((prev) => ({ ...prev, ...patch }))

  const validateStep = (step: WizardStepId): FieldErrors => {
    const next: FieldErrors = {}
    if (step !== 'spec') return next
    // 422의 errors[]가 실어 오는 필드 경로와 같은 키를 쓴다 — 서버가 되돌려준
    // 오류가 그대로 같은 입력 칸에 붙는다.
    if (spec.usagePlan.length > 2000)
      next['llmKey.usagePlan'] = '사용 계획은 2000자 이하로 입력해 주세요.'
    const rpm = limitError(spec.reqRpm, '분당 요청 수', MAX_RPM)
    if (rpm) next['llmKey.reqRpm'] = rpm
    const tpm = limitError(spec.reqTpm, '분당 토큰 수', MAX_INT32)
    if (tpm) next['llmKey.reqTpm'] = tpm
    const daily = limitError(spec.reqDailyTokens, '일일 토큰 수', MAX_SAFE)
    if (daily) next['llmKey.reqDailyTokens'] = daily
    // 요청 하나가 토큰 하나보다 적게 쓸 수는 없다 — 서버가 같은 규칙으로 막는다.
    if (!rpm && !tpm && spec.reqRpm.trim() && spec.reqTpm.trim()) {
      if (Number(spec.reqTpm) < Number(spec.reqRpm))
        next['llmKey.reqTpm'] = '분당 토큰 수는 분당 요청 수보다 작을 수 없습니다.'
    }
    return next
  }

  return {
    spec,
    // 이 종류에는 고를 카탈로그가 없다 — OS 목록 같은 사전 조회가 필요 없으므로
    // 화면의 로딩·오류 게이트에 보탤 것도 없다.
    isPending: false,
    error: null,
    validateStep,

    specStep: (errors) => (
      <>
        <Alert variant="info" title="한도는 비워 두어도 됩니다">
          모든 항목이 선택 입력입니다. 비워 두면 서비스 기본 한도로 발급되며, 그것으로
          충분한 것이 보통입니다. 기본 한도로 모자랄 때만 희망값을 적어 주세요.
        </Alert>

        <FormField
          label="사용 계획"
          error={errors['llmKey.usagePlan']}
          description="이 키를 어디에 쓸지 적어 주세요. 관리자가 부여 한도를 정할 때 봅니다."
        >
          <Textarea
            value={spec.usagePlan}
            onChange={(event) => update({ usagePlan: event.target.value })}
            maxLength={2000}
            placeholder="예: 캡스톤 프로젝트 챗봇에서 문서 요약 호출"
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField
            label="희망 분당 요청 수"
            error={errors['llmKey.reqRpm']}
            description="비우면 기본값"
          >
            <Input
              type="number"
              min={1}
              max={MAX_RPM}
              value={spec.reqRpm}
              onChange={(event) => update({ reqRpm: event.target.value })}
              placeholder="기본값"
            />
          </FormField>
          <FormField
            label="희망 분당 토큰 수"
            error={errors['llmKey.reqTpm']}
            description="비우면 기본값"
          >
            <Input
              type="number"
              min={1}
              value={spec.reqTpm}
              onChange={(event) => update({ reqTpm: event.target.value })}
              placeholder="기본값"
            />
          </FormField>
          <FormField
            label="희망 일일 토큰 수"
            error={errors['llmKey.reqDailyTokens']}
            description="비우면 기본값"
          >
            <Input
              type="number"
              min={1}
              value={spec.reqDailyTokens}
              onChange={(event) => update({ reqDailyTokens: event.target.value })}
              placeholder="기본값"
            />
          </FormField>
        </div>
      </>
    ),

    summaryRows: (common, names) => [
      ['워크스페이스', names.workspaceName],
      ['기관', names.orgName],
      ['사용 계획', spec.usagePlan.trim() || '—'],
      ['희망 분당 요청 수', limitLabel(spec.reqRpm)],
      ['희망 분당 토큰 수', limitLabel(spec.reqTpm)],
      ['희망 일일 토큰 수', limitLabel(spec.reqDailyTokens)],
      ['사용 목적', common.purpose.trim()],
      ['수업/프로젝트명', common.courseOrProject.trim() || '—'],
      ['기타 참고', common.extraNote.trim() || '—'],
      ['표시명', common.displayName.trim()],
      [
        '사용 기간',
        common.reqStartDate || common.reqEndDate
          ? `${common.reqStartDate || '미지정'} ~ ${common.reqEndDate || '미지정'}`
          : '미지정',
      ],
    ],

    confirmNotice: (
      <Alert variant="info" title="한도 확정 안내">
        희망 한도는 참고 자료입니다. 실제 부여 한도는 관리자가 승인할 때 정하며,
        비워 둔 항목은 서비스 기본 한도로 발급됩니다.
      </Alert>
    ),

    payload: () => ({
      type: 'LLM_API_KEY',
      llmKey: {
        usagePlan: spec.usagePlan.trim() || null,
        reqRpm: limitValue(spec.reqRpm),
        reqTpm: limitValue(spec.reqTpm),
        reqDailyTokens: limitValue(spec.reqDailyTokens),
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
  specStepTitle: '사용 계획·한도',
  copy: {
    workspaceDescription:
      'LLM API 키는 워크스페이스 명의로 발급됩니다. 발급된 키는 신청한 사람만 쓸 수 있고, 접근 권한은 발급 후 키 상세에서 부여합니다.',
    noWorkspaceNotice:
      'LLM API 키를 신청할 수 있는 워크스페이스가 없습니다. 워크스페이스에 속해 있어야 신청할 수 있습니다.',
  },
  fieldLabels: {
    llmKey: 'LLM API 키 신청 항목',
    'llmKey.usagePlan': '사용 계획',
    'llmKey.reqRpm': '희망 분당 요청 수',
    'llmKey.reqTpm': '희망 분당 토큰 수',
    'llmKey.reqDailyTokens': '희망 일일 토큰 수',
  },
  isCompatibleSpecDraft,
  useWizard: useLlmKeyWizard,
}
