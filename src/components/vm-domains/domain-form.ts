import { SUBDOMAIN_RE } from '../../lib/validation'

/** 요약 Alert에서 필드 키 대신 보여줄 이름 (추가 폼 공통). */
export const DOMAIN_FIELD_LABELS: Record<string, string> = {
  port: '공개 포트',
  subdomain: '서브도메인',
  rootDomain: '루트 도메인',
  customDomain: '커스텀 도메인',
}

/**
 * 클라이언트 측 포트 사전 검증 (서버 422 규칙과 동일: 1–65535, SSH 22 금지).
 * 통과하면 null, 아니면 필드 오류 메시지를 돌려준다.
 */
export function portFieldError(raw: string): string | null {
  if (!/^\d+$/.test(raw.trim())) return '포트 번호를 입력해 주세요.'
  const port = Number(raw.trim())
  if (port < 1 || port > 65535) return '포트는 1–65535 범위여야 합니다.'
  if (port === 22) return 'VM의 SSH 포트(22)는 공개할 수 없습니다.'
  return null
}

/**
 * 서브도메인 사전 검증 — 신청서 슬러그와 같은 규칙(형식 + 예약어)으로 미리
 * 거른다. 금칙어 일부는 서버만 알고 있으므로 그쪽은 422로 돌아온다.
 */
export function subdomainFieldError(
  raw: string,
  reserved: string[] | undefined,
): string | null {
  const name = raw.trim()
  if (!SUBDOMAIN_RE.test(name)) {
    return '서브도메인은 소문자·숫자·하이픈만 사용해 3~40자로 입력해 주세요. (하이픈으로 시작·끝 불가)'
  }
  if (reserved?.includes(name)) {
    return `'${name}'은(는) 예약된 서브도메인이라 사용할 수 없습니다.`
  }
  return null
}
