import type { RequestKindModule } from './types'
import { vmRequestKind } from './vm-wizard'

/**
 * 신청 위저드가 아는 리소스 종류 — 선택 화면에 이 순서로 나온다.
 * 종류 추가 = 모듈 파일 하나 + 여기 등록 한 줄. 위저드 본체는 바뀌지 않는다.
 */
export const REQUEST_KINDS: RequestKindModule[] = [vmRequestKind]

export function requestKind(type: string): RequestKindModule | undefined {
  return REQUEST_KINDS.find((kind) => kind.type === type)
}

/** 종류 선택 화면 하단 안내 — 종류가 준비되면 여기서 지워진다. */
export const KIND_PICKER_FOOTNOTE = '컨테이너와 LLM API 키는 준비 중입니다.'
