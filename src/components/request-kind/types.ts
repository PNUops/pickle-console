import type { ReactNode } from 'react'
import type { ApproveRequest, CreateRequest, RequestDetail } from '../../api/queries'

/**
 * 리소스 신청이 종류(kind)별로 갈라지는 지점의 계약.
 *
 * 신청 위저드·관리자 승인 화면은 공통 골격만 갖고, "이 종류의 스펙을 어떻게
 * 입력받고, 검증하고, 요약하고, 승인하는가"는 전부 여기 모듈이 답한다.
 * 두 번째 종류를 추가하는 일은 모듈 하나를 만들어 index.ts에 등록하는 일이며,
 * 화면 컴포넌트는 바뀌지 않는다.
 */

export type { WizardStepId } from './wizard-steps'
import type { FieldSlot, WizardStepId } from './wizard-steps'
export type { FieldSlot }

export type FieldErrors = Partial<Record<string, string>>

/** 사용 기간을 고르는 두 갈래. 무기한은 종료일이 없는 항목이라 여기 나타나지 않는다. */
export type PeriodMode = 'preset' | 'custom'

/** 종류와 무관한 신청 공통 입력 — 위저드 본체가 소유한다. */
export interface CommonWizardState {
  workspaceId: string | null
  orgId: string | null
  purpose: string
  courseOrProject: string
  extraNote: string
  periodMode: PeriodMode
  periodPresetId: string | null
  reqEndDate: string
  displayName: string
}

/** CreateRequest에서 종류가 채우는 조각 — 판별자(type)와 종류별 스펙 멤버. */
export type KindCreatePayload = Omit<
  CreateRequest,
  | 'workspaceId'
  | 'orgId'
  | 'purpose'
  | 'courseOrProject'
  | 'extraNote'
  | 'periodPresetId'
  | 'reqEndDate'
  | 'displayName'
>

/** useWizard가 돌려주는, 마운트된 위저드 한 판에서의 종류별 동작. */
export interface KindWizard {
  /** 이 종류의 스펙 상태. 세션 초안의 spec 부분으로 그대로 직렬화된다. */
  spec: unknown
  /** 이 종류가 쓰는 카탈로그 로딩. 페이지의 로딩과 오류 게이트에 합류한다. */
  isPending: boolean
  error: Error | null
  /** 단계마다 자기 필드만 검증한다. 공통 필드는 위저드 본체가 본다. */
  validateStep(step: WizardStepId): FieldErrors
  /**
   * '만들 리소스' 단계에서 이름 아래에 붙는 이 종류의 입력.
   *
   * 종류가 무엇을 얹든 한 덩어리로 받는다. 종전에는 이름 옆에 붙는 것과 사양
   * 단계 본문이 따로였는데, 두 단계가 하나로 합쳐지면서 나눌 이유가 없어졌다.
   */
  resourceFields(errors: FieldErrors): ReactNode
  /**
   * 확인 단계 요약. 자기가 받은 항목만, 그 값을 입력한 단계별로 돌려준다.
   *
   * 공통 항목은 위저드 본체가 든다. 종전에는 종류가 공통 항목까지 섞어 한 줄로
   * 늘어놓았는데, 확인 단계가 단계별 구획과 「수정」 링크를 갖게 되면서 어느
   * 구획에 넣을지를 종류가 말해야 한다.
   */
  reviewRows(): Partial<Record<WizardStepId, [string, string][]>>
  /** 확인 단계에 붙는 종류별 고지 (VM은 백업 책임 안내). */
  notice?: ReactNode
  payload(): KindCreatePayload
}

/** 신청 위저드에 등록되는 종류 모듈. */
export interface RequestKindModule {
  type: CreateRequest['type']
  picker: { title: string; description: string }
  /** 종류가 언급되는 공통 단계 문구. 화면 골격은 종류 이름을 모른다. */
  copy: { noWorkspaceNotice: string }
  /**
   * 이 종류가 422로 되돌려받을 수 있는 필드. 공통 표에 합쳐진다.
   *
   * 라벨과 단계를 한 값에 묶은 것은 의도다. 따로 두면 종류를 추가하는 사람이
   * 라벨만 등록하고 단계를 빠뜨릴 수 있고, 그러면 그 필드의 422는 아무 칸에도
   * 붙지 못한 채 목록으로만 뜬다.
   */
  fields: Record<string, FieldSlot>
  useWizard(draftSpec: unknown): KindWizard
}

/* ─── 신청 하나를 그리는 화면들 ─── */

/**
 * 결정에 필요한 종류별 카탈로그의 로딩 상태. blocked면 결정 카드 자리 전체에
 * gate를 그린다 (로딩·오류 — 반려 폼까지 함께 숨겨 절반짜리 결정을 막는다).
 * ready의 value는 그 종류의 useApproveForm이 돌려받아 쓰는 자기 데이터다.
 */
export type DecisionData =
  | { status: 'blocked'; gate: ReactNode }
  | { status: 'ready'; value: unknown }

/** 승인 폼의 종류별 동작 — 제출 버튼·확인 모달·오류 매핑은 공통 골격 몫이다. */
export interface DecisionFormApi {
  /** 승인 폼 본문 — 안내문·입력 전부. */
  fields(errors: Record<string, string>): ReactNode
  validate(): Record<string, string>
  body(): ApproveRequest
  /** 승인 확인 모달 본문. */
  confirmBody: ReactNode
  /**
   * 확인 모달의 확정 버튼을 열어도 되는가. 생략하면 열려 있다.
   *
   * 종류가 승인 직전에 한 번 더 확인을 받아야 할 때 쓴다. 모달이 열렸다는 것을
   * 종류에 알리는 통로가 없으므로, 확인 상태를 boolean으로 들면 확인 뒤 모달을
   * 닫고 값을 고쳐 다시 열었을 때 확인이 살아남는다. 무엇을 확인했는지를 들고
   * 지금 값과 대조하는 편이 안전하다.
   */
  confirmReady?: boolean
  /** 승인 성공 알림 문구. */
  successMessage: string
}

/**
 * 위저드 밖에서 신청 하나를 그리는 데 필요한 종류별 항목 전부.
 *
 * 읽기 항목(summaryCell·contentFields·resultFields)은 **신청자와 관리자가 함께
 * 쓴다** — 내 신청 목록·신청 상세와 승인 대기 큐·관리자 신청 상세가 같은 함수를
 * 부른다. 신청의 사실은 신청의 것이지 읽는 사람의 것이 아니고, 종류마다 같은
 * 표를 두 벌 쓰면 한쪽만 갱신되는 날이 온다. 읽는 목적의 차이(결재냐 확인이냐)는
 * 화면 골격이 무엇을 곁들이느냐로 갈린다 — 관리자 화면만 결정 폼과 참고 패널을
 * 덧붙이고, 신청자 화면만 취소 버튼을 단다.
 *
 * 결정 항목(decisionPrefetchQueries·useDecisionData·useApproveForm)은 관리자
 * 화면에서만 불린다.
 */
export interface RequestKindView {
  /**
   * 신청 상세 진입 즉시 미리 당겨 둘 결정용 카탈로그 쿼리.
   * 결정 폼은 신청 응답이 온 뒤에야 마운트되므로, 여기서 당겨 두지 않으면
   * 폼 자리가 그만큼 늦게 채워진다 (원래는 페이지가 직접 함께 조회했다).
   */
  decisionPrefetchQueries: Array<{
    queryKey: readonly unknown[]
    queryFn: () => Promise<unknown>
  }>
  /** 신청 표의 종류별 요약 셀 — 승인 대기 큐와 내 신청 목록이 함께 쓴다. */
  summaryCell(request: RequestDetail): ReactNode
  /**
   * 신청 내용 카드 본문 — 공통·종류 항목이 섞이는 순서까지 종류가 정한다.
   * 신청자를 적지 않는다: 두 상세 화면 모두 머리말이 이미 신청자를 밝힌다.
   */
  contentFields(request: RequestDetail): ReactNode
  /** 검토 결과 카드의 승인 상세(부여 사양·기간 등) — 반려·해당 없음이면 null. */
  resultFields(request: RequestDetail): ReactNode
  /** 결정용 카탈로그 로딩 — 결정 폼보다 바깥에서 불려 폼 상태와 분리된다. */
  useDecisionData(request: RequestDetail): DecisionData
  /**
   * 승인 폼 상태·검증·본문. ready일 때만 마운트되는 컴포넌트에서 불리므로,
   * 카탈로그 오류로 gate가 열리면 폼 상태는 이전처럼 통째로 초기화된다.
   */
  useApproveForm(request: RequestDetail, value: unknown): DecisionFormApi
}
