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

/* ─── 관리자 승인 ─── */

/**
 * 검토 결정 폼의 종류별 동작. blocked면 결정 카드 자리 전체에 gate를 그린다
 * (카탈로그 로딩·오류 — 반려 폼까지 함께 숨겨 절반짜리 결정을 막는다).
 */
export type DecisionForm =
  | { status: 'blocked'; gate: ReactNode }
  | {
      status: 'ready'
      /** 승인 폼 본문 — 안내문·입력 전부. 제출 버튼·모달은 공통 골격 몫이다. */
      fields(errors: Record<string, string>): ReactNode
      validate(): Record<string, string>
      body(): ApproveRequest
      /** 승인 확인 모달 본문. */
      confirmBody: ReactNode
      /** 승인 성공 알림 문구. */
      successMessage: string
    }

/** 관리자 화면(승인 대기 큐·신청 상세)에 등록되는 종류 모듈. */
export interface RequestKindAdmin {
  /** 승인 대기 큐 표의 종류별 요약 셀. */
  queueCell(request: RequestDetail): ReactNode
  /** 신청 내용 카드 본문 — 공통·종류 항목이 섞이는 순서까지 종류가 정한다. */
  contentFields(request: RequestDetail): ReactNode
  /** 검토 결과 카드의 승인 상세(부여 사양·기간 등) — 반려·해당 없음이면 null. */
  resultFields(request: RequestDetail): ReactNode
  useDecisionForm(request: RequestDetail): DecisionForm
}
