/** ORG 계층 관리자가 마지막으로 선택한 유효 기관. URL `org`가 항상 우선한다. */
export const ADMIN_ORG_SCOPE_KEY = 'pickle.admin-org-scope'

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

/**
 * 프로필 안내를 이 세션에서 닫았다는 sessionStorage 표식.
 *
 * 프로필은 선택 입력이라 안내는 막지 않고 닫힌다. localStorage 가 아닌 이유는
 * 한 번 닫으면 영원히 안 뜨는 것과 선택 입력 사이의 거리다 — 다음 로그인에 한 번
 * 더 묻고, 채우면 그때부터 안 뜬다.
 */
export const PROFILE_PROMPT_DISMISSED_KEY = 'pickle.profile-prompt-dismissed'

/** 안내를 닫았는지. 저장소가 막혀 있으면 닫지 않은 것으로 본다. */
export function profilePromptDismissed(): boolean {
  try {
    return sessionStorage.getItem(PROFILE_PROMPT_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * 안내를 닫았다고 기록한다.
 *
 * 저장에 실패해도 삼킨다. 저장소가 막힌 브라우저에서 던지면 닫기 버튼이 아무것도
 * 하지 않는 것처럼 보이고, 그때는 안내가 진짜로 막는 장치가 된다.
 */
export function dismissProfilePrompt(): void {
  try {
    sessionStorage.setItem(PROFILE_PROMPT_DISMISSED_KEY, '1')
  } catch {
    // 이 세션 동안만 닫힌다.
  }
}

/**
 * 이번 세션에 이미 띄운 팝업 공지를 기억하는 sessionStorage 키. 값은
 * `공지 id → updatedAt` JSON 맵이다. 그냥 닫기(X·배경·Esc)가 여기에 기록되며,
 * 세션이 끝나면 함께 사라져 다음 로그인 때 같은 공지가 다시 뜬다.
 */
export const NOTICE_POPUP_SEEN_KEY = 'pickle.notice-popup-seen'

/**
 * '다시 보지 않기'로 눌러 둔 팝업 공지의 localStorage 키. 같은 모양의
 * `공지 id → updatedAt` 맵이고, 공지 본문이 수정되면 updatedAt이 달라져 다시
 * 뜬다. 로그아웃 시 지우지 않는다 — 이 억제는 계정이 아니라 브라우저의 것이다.
 */
export const NOTICE_POPUP_DISMISSED_KEY = 'pickle.notice-popup-dismissed'
