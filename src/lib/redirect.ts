/**
 * 내부 경로만 통과시킨다.
 *
 * `//evil.com` 은 프로토콜 상대 URL 이라 브라우저가 외부 호스트로 읽는다. 로그인 후
 * 이동할 곳을 주소나 저장소에서 받아 오는 자리가 둘이 됐으므로(로그인 화면의
 * `location.state`, 구글 왕복의 세션 저장소) 판정을 한 곳에 둔다. 복붙하면 한쪽만 고쳐진다.
 */
export function safeInternalPath(value: string | null | undefined): string | null {
  if (!value) return null
  return value.startsWith('/') && !value.startsWith('//') ? value : null
}
