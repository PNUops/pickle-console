/**
 * 서비스 표시명 상수. 명칭 계층(정식명 부산대학교 클라우드 플랫폼 / 통용명
 * PNU Cloud / 애칭·코드네임 피클·Pickle)의 표기 배치 규칙을 따른다 —
 * 콘솔 크롬(로고·탭·푸터)은 통용명, 랜딩 본문·구어체 안내는 애칭.
 * 식별자(쿠키·스토리지 키 등)의 `pickle`은 코드네임이므로 이 상수와 무관하다.
 */
export const SERVICE_NAME = 'PNU Cloud'

/** 푸터 식별 줄 — 통용명과 한국어 정식명의 병기(허용된 병행 표기 자리). */
export const SERVICE_TAGLINE = 'PNU Cloud — 부산대학교 클라우드 플랫폼'

/** 의견 접수 창구(외부 게시판) — 콘솔에서는 항상 새 탭으로 연다. */
export const FEEDBACK_URL = 'https://feedback.pnuops.com/'

/** 1:1 문의 창구 — 카카오 채널 채팅(외부 서비스, 새 탭). */
export const CONTACT_URL = 'https://pf.kakao.com/_xmxjxmUn/chat'

/** 사용법 문서 경로(콘솔 내부 라우트). 본문은 준비 중. */
export const DOCS_PATH = '/docs'
