
/** 로그인 후 돌아갈 내부 경로를 담아 두는 자리. */
export const OAUTH_RETURN_TO_KEY = 'pickle.oauth.returnTo'

/**
 * 구글 인가 화면으로 브라우저를 보낸다.
 *
 * 주소를 미리 알 수 없어 `<a href>` 로는 못 간다. 서버가 state 와 nonce 와 PKCE
 * verifier 를 만들어 저장한 **뒤에야** 인가 주소가 정해지고, 그 행은 단회 소비라 미리
 * 받아 두면 화면을 열어만 두고 안 누른 사람마다 죽은 행이 쌓인다. 그래서 누른 시점에
 * POST 하고 받은 주소로 이동한다.
 *
 * 이동을 별도 함수로 둔 것은 jsdom 이 `location.assign` 을 구현하지 않기 때문이다.
 * 테스트는 이 함수를 감시한다.
 */
export function navigateExternal(url: string): void {
  window.location.assign(url)
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
