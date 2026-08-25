import { API_BASE } from '../api/client'

/** 로그인 후 돌아갈 내부 경로를 담아 두는 자리. */
export const OAUTH_RETURN_TO_KEY = 'pickle.oauth.returnTo'

/**
 * 구글 인가를 시작하는 주소.
 *
 * 전체 페이지 이동이라 `fetch`가 아니라 `<a href>`로 간다. 구글 동의 화면은 CORS 도
 * iframe 도 받지 않으므로 다른 방법이 없다.
 */
export function googleStartHref(path: string): string {
  return `${API_BASE}${path}`
}

/**
 * 돌아갈 경로를 세션 저장소에 남긴다.
 *
 * React Router 의 `location.state`는 history 엔트리별 메모리라 **전체 페이지 이동을 넘어
 * 살아남지 못한다**. `RequireRole`이 넣어 주는 `state.from`은 구글 왕복에서 사라지므로
 * 여기에 옮겨 둔다. 같은 탭 왕복이면 충분하고 계약을 바꿀 필요도 없다.
 */
export function rememberReturnTo(path: string | null | undefined): void {
  try {
    if (path) sessionStorage.setItem(OAUTH_RETURN_TO_KEY, path)
    else sessionStorage.removeItem(OAUTH_RETURN_TO_KEY)
  } catch {
    // 시크릿 창이나 저장소 차단. 돌아갈 곳만 잃을 뿐 로그인은 된다.
  }
}

/** 남겨 둔 경로를 한 번만 꺼낸다. */
export function takeReturnTo(): string | null {
  try {
    const value = sessionStorage.getItem(OAUTH_RETURN_TO_KEY)
    sessionStorage.removeItem(OAUTH_RETURN_TO_KEY)
    return value
  } catch {
    return null
  }
}
