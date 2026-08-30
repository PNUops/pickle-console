/**
 * 서비스 표시명 상수. 최신 명칭 계층은 Pickle을 주 브랜드로 두고 PNU Cloud와
 * 부산대학교 클라우드 플랫폼을 identity/legal surface에서 병치한다.
 * 식별자(쿠키·스토리지 키 등)의 `pickle`은 코드네임이므로 이 상수와 무관하다.
 */
/** 일반 console surface와 brand lockup의 주 표시명. */
export const BRAND_NAME = 'Pickle'

/** 일반 UI 문장에서 사용하는 서비스 표시명. */
export const SERVICE_NAME = BRAND_NAME

/** 대표 identity surface에서 Pickle과 병치하는 통용명. */
export const PLATFORM_NAME = 'PNU Cloud'

/** 법적·공식 surface에서 사용하는 정식 명칭. */
export const OFFICIAL_SERVICE_NAME = '부산대학교 클라우드 플랫폼'

/** 푸터 식별 줄 — 통용명과 한국어 정식명의 병기(허용된 병행 표기 자리). */
export const SERVICE_TAGLINE = 'PNU Cloud — 부산대학교 클라우드 플랫폼'

/** 의견 접수 창구(외부 게시판) — 콘솔에서는 항상 새 탭으로 연다. */
export const FEEDBACK_URL = 'https://feedback.pnuops.com/'

/** 1:1 문의 창구 — 카카오 채널 채팅(외부 서비스, 새 탭). */
export const CONTACT_URL = 'https://pf.kakao.com/_xmxjxmUn/chat'

/** 사용법 문서 경로(콘솔 내부 라우트). 본문은 준비 중. */
export const DOCS_PATH = '/docs'
