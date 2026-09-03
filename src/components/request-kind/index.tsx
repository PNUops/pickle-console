import { useQueries } from '@tanstack/react-query'
import { Alert } from '../ui'
import { Field } from './Field'
import { periodText } from './period-text'
import type { RequestKindView, RequestKindModule } from './types'
import { vmRequestKind } from './vm-wizard'
import { vmRequestView } from './vm-view'
import { llmKeyRequestKind } from './llm-wizard'
import { llmKeyRequestView } from './llm-view'

/**
 * 신청 위저드가 아는 리소스 종류 — 선택 화면에 이 순서로 나온다.
 * 종류 추가 = 모듈 파일 하나 + 여기 등록 한 줄. 위저드 본체는 바뀌지 않는다.
 */
export const REQUEST_KINDS: RequestKindModule[] = [vmRequestKind, llmKeyRequestKind]

export function requestKind(type: string): RequestKindModule | undefined {
  return REQUEST_KINDS.find((kind) => kind.type === type)
}

/**
 * 종류 선택 화면 하단 안내 — 종류가 준비되면 여기서 지워진다.
 * 준비 중 라인업은 사이드바(layouts/ConsoleLayout.tsx)·랜딩 쇼케이스와 같아야 한다.
 */
export const KIND_PICKER_FOOTNOTE =
  '컨테이너, 컨테이너 레지스트리, 데이터베이스, 오브젝트 스토리지, GPU, 도메인, 단축 링크는 준비 중입니다.'

/**
 * 신청 표의 종류별 요약 열 제목 — 승인 대기 큐와 내 신청 목록이 함께 쓴다.
 * 한 표에 여러 종류가 섞이므로 제목은 어느 종류의 말도 쓰지 않는다.
 */
export const KIND_SUMMARY_COLUMN_TITLE = '요청 내용'

const REQUEST_KIND_VIEWS: Record<string, RequestKindView> = {
  VM: vmRequestView,
  LLM_API_KEY: llmKeyRequestView,
}

/**
 * 이 콘솔 빌드가 모르는 종류의 신청을 위한 화면 폴백.
 *
 * api와 콘솔은 각자 일정으로 배포된다: 서버가 먼저 새 종류를 받기 시작하면,
 * 옛 번들을 돌리는 콘솔의 승인 큐와 신청자의 목록에 그 신청이 들어온다.
 * 설명할 수 없는 행이 화면 전체를 무너뜨리는 대신 공통 필드만 보여주고,
 * 결정은 막는다.
 */
const unknownKindView: RequestKindView = {
  decisionPrefetchQueries: [],
  summaryCell: () => '—',
  contentFields: (data) => (
    <>
      <Field label="워크스페이스">{data.workspaceName}</Field>
      <Field label="기관">{data.orgName}</Field>
      <Field label="사용 기간">
        {periodText(data)}
      </Field>
      <Field label="용도">{data.purpose}</Field>
      <Field label="기타 참고">{data.extraNote ?? '—'}</Field>
      <Field label="표시명">{data.displayName}</Field>
    </>
  ),
  resultFields: () => null,
  useDecisionData: () => ({
    status: 'blocked',
    gate: (
      <Alert variant="warning" title="결정할 수 없는 신청입니다">
        지금 콘솔 버전이 알지 못하는 종류의 신청입니다. 콘솔을 새로 고치거나
        업데이트된 버전에서 처리해 주세요.
      </Alert>
    ),
  }),
  useApproveForm: () => {
    // useDecisionData가 항상 blocked라 승인 폼은 마운트되지 않는다.
    throw new Error('unknown request kind cannot be approved')
  },
}

export function requestKindView(type: string): RequestKindView {
  return REQUEST_KIND_VIEWS[type] ?? unknownKindView
}

/**
 * 모든 종류의 결정용 카탈로그를 신청 상세 진입 즉시 당겨 둔다.
 * 등록된 종류 목록은 빌드 시점에 고정이므로 훅 순서도 고정이다.
 */
export function useDecisionCatalogPrefetch() {
  useQueries({
    queries: Object.values(REQUEST_KIND_VIEWS).flatMap((kind) =>
      kind.decisionPrefetchQueries.map((query) => ({ ...query })),
    ),
  })
}
