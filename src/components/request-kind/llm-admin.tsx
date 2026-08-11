import { useState } from 'react'
import type { ApproveRequest, RequestDetail } from '../../api/queries'
import { FormField, Input, Textarea } from '../ui'
import { Field } from './Field'
import type { DecisionData, DecisionFormApi, RequestKindAdmin } from './types'

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
function useLlmKeyDecisionData(): DecisionData {
  return { status: 'ready', value: null }
}

function useLlmKeyApproveForm(request: RequestDetail): DecisionFormApi {
  const spec = request.llmKey

  // 한도는 비워 둔 채로 연다 — 희망값을 그대로 채워 두면 승인 버튼 한 번이
  // 곧 "희망대로 부여"가 되어 검토가 사라진다. 희망값은 각 칸 아래에 적어
  // 두고, 부여값은 승인자가 직접 쓴다.
  const [rpm, setRpm] = useState('')
  const [tpm, setTpm] = useState('')
  const [concurrency, setConcurrency] = useState('')
  const [dailyTokens, setDailyTokens] = useState('')
  // 기간은 종류를 가리지 않는 공통 축이라 VM과 마찬가지로 신청 기간에서 시작한다.
  const [startDate, setStartDate] = useState(request.reqStartDate ?? '')
  const [endDate, setEndDate] = useState(request.reqEndDate ?? '')
  const [approveComment, setApproveComment] = useState('')

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
      // 요청 하나가 토큰 하나보다 적게 쓸 수는 없다 — 서버가 같은 규칙으로 막는다.
      if (!rpmError && !tpmError && rpm.trim() && tpm.trim()) {
        if (Number(tpm) < Number(rpm))
          errors['llmKey.grantedTpm'] = '분당 토큰 수는 분당 요청 수보다 작을 수 없습니다.'
      }
      return errors
    },

    body: (): ApproveRequest => ({
      grantedStartDate: startDate || null,
      grantedEndDate: endDate || null,
      comment: approveComment.trim() ? approveComment.trim() : null,
      // 네 항목이 모두 비어 있어도 llmKey 자체는 실어 보낸다 — 서버는 "기본
      // 한도로 승인한다"는 뜻이 담긴 빈 객체를 요구한다.
      llmKey: {
        grantedRpm: limitValue(rpm),
        grantedTpm: limitValue(tpm),
        grantedConcurrency: limitValue(concurrency),
        grantedDailyTokens: limitValue(dailyTokens),
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
          <FormField label="사용 시작일" error={fieldErrors.grantedStartDate}>
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </FormField>
          <FormField label="사용 종료일" error={fieldErrors.grantedEndDate}>
            <Input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </FormField>
        </div>
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
        </ul>
        <p>
          승인하면 키가 만들어지지만 아직 쓸 수 없습니다. 평문 키는 신청자가 직접
          발급받습니다.
        </p>
      </div>
    ),

    successMessage: '신청을 승인했습니다. 신청자가 LLM API 키를 발급받을 수 있습니다.',
  }
}

export const llmKeyRequestAdmin: RequestKindAdmin = {
  // 결정에 필요한 카탈로그가 없으므로 미리 당겨 둘 것도 없다.
  decisionPrefetchQueries: [],
  useDecisionData: useLlmKeyDecisionData,
  // 폼이 쓰는 것은 신청 응답뿐이다 — useDecisionData가 넘기는 값(카탈로그 자리)은
  // 이 종류에 없으므로 인자로 받지도 않는다.
  useApproveForm: useLlmKeyApproveForm,

  queueCell: (request) => {
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
      <Field label="신청자">{data.requesterName}</Field>
      <Field label="워크스페이스">{data.workspaceName}</Field>
      <Field label="기관">{data.orgName}</Field>
      <Field label="사용 기간">
        {data.reqStartDate ?? '미지정'} ~ {data.reqEndDate ?? '미지정'}
      </Field>
      <Field label="용도">{data.purpose}</Field>
      <Field label="수업/프로젝트">{data.courseOrProject ?? '—'}</Field>
      <Field label="사용 계획">{data.llmKey?.usagePlan ?? '—'}</Field>
      {/* 비어 있는 희망 한도는 빠뜨린 값이 아니라 "기본값이면 된다"는 답이다. */}
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
        <Field label="부여 기간">
          {data.review.grantedStartDate ?? '미지정'} ~{' '}
          {data.review.grantedEndDate ?? '미지정'}
        </Field>
      </>
    )
  },
}
