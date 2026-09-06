/**
 * 호출 종류 — 사용량 기록이 「이 요청이 어느 표면으로 들어왔나」를 말하는 축.
 *
 * `passthrough-endpoints.ts`에 얹지 않는다. 그쪽은 **부여**의 어휘이고 이쪽은
 * **호출**의 어휘라 값 집합이 다르다. 채팅은 부여 대상이 아니라 그쪽에 없고,
 * 카탈로그 조회는 이미지 부여에 딸려 오므로 그쪽에서 이름을 갖지 않는다. 둘을 한
 * 표에 합치면 컴파일러가 지켜 주는 것이 거짓 안전이 된다.
 *
 * **열린 어휘다.** 게이트웨이가 새 경로를 열면 여기 없는 값이 온다. 그때는 원문을
 * 그대로 보여 준다 — 모르는 값을 「기타」로 접으면 새 경로가 생긴 사실이 화면에서
 * 사라진다.
 */
const LABELS: Record<string, string> = {
  chat: '채팅',
  images: '이미지 생성',
  images_models: '이미지 모델 목록',
  embeddings: '임베딩',
}

/**
 * null은 「기타」가 아니다.
 *
 * 이 축은 2026-09-06에 생겼고, 그 전 요청은 경로가 **기록되지 않았을 뿐** 어딘가로
 * 들어오기는 했다. 「기타」는 잔여를 뜻하므로 그 자리에 두면 없는 범주를 만든다.
 */
export function endpointKindLabel(endpoint: string | null | undefined): string {
  if (endpoint == null || endpoint === '') return '종류 미상'
  return LABELS[endpoint] ?? endpoint
}
