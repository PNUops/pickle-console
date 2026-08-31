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

/** 위저드가 걷는 단계의 정체 — 위치(index)가 아니라 이것이 검증·렌더링의 키다. */
export type WizardStepId = 'kind' | 'target' | 'spec' | 'purpose' | 'confirm'

export type FieldErrors = Partial<Record<string, string>>

/** 종류와 무관한 신청 공통 입력 — 위저드 본체가 소유한다. */
export interface CommonWizardState {
  workspaceId: string | null
  orgId: string | null
  purpose: string
  courseOrProject: string
  extraNote: string
  reqStartDate: string
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
  | 'reqStartDate'
  | 'reqEndDate'
  | 'displayName'
>

/** useWizard가 돌려주는, 마운트된 위저드 한 판에서의 종류별 동작. */
export interface KindWizard {
  /** 이 종류의 스펙 상태 — 세션 초안의 spec 부분으로 그대로 직렬화된다. */
  spec: unknown
  /** 이 종류가 쓰는 카탈로그 로딩 — 페이지의 로딩·오류 게이트에 합류한다. */
  isPending: boolean
  error: Error | null
  /** 단계마다 자기 필드만 검증한다 — 공통 필드는 위저드 본체가 본다. */
  validateStep(step: WizardStepId): FieldErrors
  /** 워크스페이스·기관·이름 단계의 '리소스 이름' 묶음에 덧붙는 종류별 입력. */
  targetFields?: (errors: FieldErrors) => ReactNode
  /** 종류별 스펙 단계 본문. */
  specStep(errors: FieldErrors): ReactNode
  /** 확인 단계 요약 — 공통·종류 항목이 섞이는 순서까지 종류가 정한다. */
  summaryRows(
    common: CommonWizardState,
    names: { workspaceName: string; orgName: string },
  ): [string, string][]
  /** 확인 단계에 붙는 종류별 고지 (VM: 백업 책임 안내). */
  confirmNotice?: ReactNode
  payload(): KindCreatePayload
}

/** 신청 위저드에 등록되는 종류 모듈. */
export interface RequestKindModule {
  type: CreateRequest['type']
  picker: { title: string; description: string }
  /** 종류별 스펙 단계의 스테퍼 제목 (VM: 'OS·사양'). */
  specStepTitle: string
  /** 종류가 언급되는 공통 단계 문구 — 화면 골격은 종류 이름을 모른다. */
  copy: { workspaceDescription: string; noWorkspaceNotice: string }
  /** 422 errors[] 필드명 → 한국어 라벨 — 공통 라벨에 합쳐진다. */
  fieldLabels: Record<string, string>
  /** 저장된 초안의 spec 부분이 지금 모양인지 — 아니면 초안 전체를 버린다. */
  isCompatibleSpecDraft(value: unknown): boolean
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
