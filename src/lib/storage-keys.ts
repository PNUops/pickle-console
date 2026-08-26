/**
 * 리소스 신청 위저드 초안의 sessionStorage 키. 작성 페이지가 저장·복원하고,
 * 로그아웃 시 함께 제거해 같은 탭의 다음 사용자에게 초안이 새지 않게 한다.
 * 초안은 종류 판별자(kind)와 공통부·종류별 스펙부를 담는다 — 키 이름과 값은
 * VM 전용이던 시절의 것이지만, 바꾸면 이미 저장된 초안이 로그아웃 정리를
 * 비켜가므로 그대로 둔다.
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

/**
 * 기관 계층 2FA 권유 배너를 세션 동안 닫아둔 상태로 기억하는 sessionStorage
 * 플래그. 로그아웃 시 함께 지워, 같은 탭의 다음 사용자가 이전 사용자의 닫음을
 * 물려받아 권유를 못 보는 일이 없게 한다.
 */
export const MFA_NUDGE_DISMISS_KEY = 'pickle.mfa-nudge-dismissed'

/**
 * 환영 오버레이를 예약한다.
 *
 * 저장소가 막힌 브라우저에서 `setItem` 은 던진다. 이 호출은 **토큰을 세우고 프로필을
 * 받아온 뒤**에 오므로, 여기서 던지면 로그인은 이미 됐는데 화면은 실패를 말하고 이동은
 * 일어나지 않는다. 연출 하나가 세션을 삼키게 두지 않는다.
 */
export function schedulePostLoginOverlay(): void {
  try {
    sessionStorage.setItem(POST_LOGIN_OVERLAY_KEY, '1')
  } catch {
    // 연출만 건너뛴다.
  }
}
