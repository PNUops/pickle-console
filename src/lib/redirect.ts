/**
 * 내부 경로만 통과시킨다.
 *
 * `//evil.com` 은 프로토콜 상대 URL 이라 브라우저가 외부 호스트로 읽는다. 로그인 후
 * 이동할 곳을 주소나 저장소에서 받아 오는 자리가 둘이 됐으므로(로그인 화면의
 * `location.state`, 구글 왕복의 세션 저장소) 판정을 한 곳에 둔다. 복붙하면 한쪽만 고쳐진다.
 *
 * 백슬래시도 막는다. URL 표준은 http(s) 에서 `\` 를 `/` 와 같이 읽으므로 `/\evil.com`
 * 은 브라우저에게 `https://evil.com/` 이다. 지금 이 값을 받는 곳이 react-router 뿐이라
 * 실제로 넘어가지는 않지만, 이 함수가 약속하는 것은 "내부 경로만"이고 다음 소비자가
 * `location.href` 일 수 있다.
 */
export function safeInternalPath(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  return value.includes('\\') ? null : value
}
