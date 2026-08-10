/**
 * VM 신청 위저드 초안의 sessionStorage 키. 작성 페이지가 저장·복원하고,
 * 로그아웃 시 함께 제거해 같은 탭의 다음 사용자에게 초안이 새지 않게 한다.
 */
export const VM_REQUEST_DRAFT_KEY = 'pickle.vm-request-draft'

/**
 * 마지막으로 보던 워크스페이스를 기억하던 localStorage 키. 지금은 아무도 쓰지
 * 않는다 — 범위는 URL이 정한다. 이미 값이 남아 있는 브라우저가 있으므로
 * 로그아웃 시 함께 지워, 같은 브라우저의 다음 사용자에게 직전 사용자의
 * 워크스페이스 id가 남지 않게 한다.
 */
export const LEGACY_CONSOLE_SCOPE_KEY = 'pickle.console-scope'

/**
 * 로그인 직후 1회 환영 오버레이(다크 인증 → 라이트 콘솔 브릿지)를 띄우기 위한
 * sessionStorage 플래그. LoginPage가 설정하고 AppShell이 읽은 즉시 제거한다.
 */
export const POST_LOGIN_OVERLAY_KEY = 'pickle.post-login'
