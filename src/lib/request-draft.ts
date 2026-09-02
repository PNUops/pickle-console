import { REQUEST_KINDS, requestKind } from '../components/request-kind'
import type { CommonWizardState } from '../components/request-kind/types'

/**
 * 작성 중인 신청서를 담는 sessionStorage 키. 로그아웃 시 함께 지워 같은 탭의
 * 다음 사용자에게 새지 않게 한다.
 */
export const REQUEST_DRAFT_KEY = 'pickle.request-draft'

export interface RequestDraft {
  kindType: string
  common: Partial<CommonWizardState>
  spec: unknown
}

function freshDraft(): RequestDraft {
  return { kindType: REQUEST_KINDS[0].type, common: {}, spec: null }
}

/**
 * 저장된 초안을 읽는다. 읽을 수 없거나 모르는 종류이면 통째로 버린다.
 *
 * 모양을 따져 일부만 살리지 않는다. 초안을 쓰는 곳이 이 화면 하나뿐이라 남의
 * 모양이 들어올 자리가 없고, 카탈로그에서 사라진 id는 초안 판정이 아니라
 * 단계 검증이 "목록에 없으면 고르지 않은 것"으로 잡는다. 그쪽은 오늘도
 * 일어나는 일이고, 이쪽은 손으로 저장소를 고쳤을 때만 일어난다.
 */
export function loadDraft(): RequestDraft {
  try {
    const raw = sessionStorage.getItem(REQUEST_DRAFT_KEY)
    if (!raw) return freshDraft()
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed == null) return discardDraft()
    const draft = parsed as { kind?: unknown; common?: unknown; spec?: unknown }
    const kind = typeof draft.kind === 'string' ? requestKind(draft.kind) : undefined
    if (!kind) return discardDraft()
    const common = typeof draft.common === 'object' && draft.common != null
      ? (draft.common as Partial<CommonWizardState>)
      : {}
    return { kindType: kind.type, common, spec: draft.spec ?? null }
  } catch {
    return freshDraft()
  }
}

/**
 * 작성 중인 내용을 저장한다. 저장소가 막힌 브라우저에서 `setItem`은 던지는데,
 * 이 호출은 입력할 때마다 일어나므로 던지면 폼 자체가 죽는다. 초안은 편의이지
 * 신청의 일부가 아니다.
 */
export function saveDraft(kindType: string, common: CommonWizardState, spec: unknown): void {
  try {
    sessionStorage.setItem(REQUEST_DRAFT_KEY, JSON.stringify({ kind: kindType, common, spec }))
  } catch {
    // 새로고침에도 남기지 못할 뿐이다.
  }
}

/** 초안을 지운다. 제출 성공과 로그아웃이 부른다. */
export function clearDraft(): void {
  try {
    sessionStorage.removeItem(REQUEST_DRAFT_KEY)
  } catch {
    // 로그아웃 정리의 나머지를 막지 않는다.
  }
}

/** 남겨 두면 매 진입마다 같은 판정을 반복한다. */
function discardDraft(): RequestDraft {
  clearDraft()
  return freshDraft()
}
