/**
 * 신청 위저드의 단계 기계.
 *
 * 여기 있는 것은 전부 순수 함수다. 화면을 마운트하지 않고 단독으로 시험할 수
 * 있어야 하는 판단들이고, 그중 하나(422를 어느 단계로 되돌릴지)는 이 개편이
 * 존재하는 이유이기도 하다.
 */

/** 단계의 정체. 검증과 렌더링은 위치가 아니라 이 id로 갈린다. */
export type WizardStepId = 'resource' | 'request' | 'review'

/**
 * 위저드의 단계. **진입 경로와 무관하게 언제나 이 셋이다.**
 *
 * 무엇을 신청할지 고르는 것은 단계가 아니라 위저드 앞의 화면(KindPicker)이다.
 * 종류를 아는 자리에서 들어오면 그 화면을 지나지 않으므로, 단계로 두면 같은
 * 위저드가 진입마다 3단계였다 4단계였다 한다. 그러면 스텝퍼의 「1」이 사람마다
 * 다른 화면을 가리키고, 첫 단계의 「이전」은 언제나 죽은 버튼으로 남는다.
 */
export const ALL_STEPS: WizardStepId[] = ['resource', 'request', 'review']

export const STEP_TITLES: Record<WizardStepId, string> = {
  resource: '리소스 구성',
  request: '신청 정보',
  review: '검토',
}

/**
 * `?step=`이 가리키는 단계. 모르는 값은 첫 단계로 떨어진다.
 *
 * 서수가 아니라 id를 싣는 이유는 단계가 자리를 옮겨도 확인 단계의 「수정」 링크와
 * 되돌아온 422가 같은 화면을 계속 가리키게 하기 위해서다.
 */
export function parseStepId(value: string | null, steps: WizardStepId[]): WizardStepId {
  const found = steps.find((step) => step === value)
  return found ?? steps[0]
}

/** 422가 가리킬 수 있는 필드 하나. 한국어 이름과 그 값을 입력한 단계. */
export interface FieldSlot {
  label: string
  step: WizardStepId
}

/**
 * 종류와 무관한 신청 본문 필드. 종류가 얹는 필드는 종류 모듈이 같은 모양으로 든다.
 *
 * 라벨과 단계를 한 값에 묶어 둔 것은 의도다. 따로 두면 종류를 추가하는 사람이
 * 라벨만 등록하고 단계를 빠뜨릴 수 있고, 그러면 그 필드의 422는 아무 데도 가지
 * 못한 채 조용히 목록으로만 뜬다.
 */
export const COMMON_FIELDS: Record<string, FieldSlot> = {
  orgId: { label: '기관', step: 'request' },
  workspaceId: { label: '워크스페이스', step: 'request' },
  purpose: { label: '사용 목적', step: 'request' },
  extraNote: { label: '참고 사항', step: 'request' },
  periodPresetId: { label: '사용 기간', step: 'request' },
  reqEndDate: { label: '사용 종료일', step: 'request' },
  displayName: { label: '이름', step: 'resource' },
}

/**
 * 서버가 가리킨 필드들이 사는 단계 중 **가장 앞선 것**.
 *
 * 앞선 것을 고르는 이유는 읽는 순서대로 고치게 하기 위해서다. 어느 필드도
 * 이 표에 없으면 null을 돌려주고, 그때 메시지는 요약 목록에 남는다. 새 서버가
 * 콘솔이 모르는 필드를 보내는 경우가 그것이다.
 */
export function routeServerErrors(
  fieldErrors: Record<string, string>,
  fields: Record<string, FieldSlot>,
  steps: WizardStepId[],
): WizardStepId | null {
  let best: number | null = null
  for (const field of Object.keys(fieldErrors)) {
    const slot = fields[field]
    if (!slot) continue
    const index = steps.indexOf(slot.step)
    if (index < 0) continue
    if (best == null || index < best) best = index
  }
  return best == null ? null : steps[best]
}

/** 이 단계에 입력 자리가 있는 필드 키. `ErrorSummary`가 무엇을 숨길지 정한다. */
export function slotsFor(step: WizardStepId, fields: Record<string, FieldSlot>): string[] {
  return Object.entries(fields)
    .filter(([, slot]) => slot.step === step)
    .map(([field]) => field)
}

/** 422 필드 경로 → 한국어 이름. 요약 목록이 원시 경로를 새지 않게 한다. */
export function fieldLabels(fields: Record<string, FieldSlot>): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).map(([key, slot]) => [key, slot.label]))
}
