/**
 * 호출 종류 — 사용량 기록이 「이 요청이 어느 표면으로 들어왔나」를 말하는 축.
 *
 * Not folded into `passthrough-endpoints.ts`: that is the vocabulary of a
 * **grant**, this one of a **call**, and the sets differ. The catalogue read
 * comes with the images grant and has no name there; web search is a feature
 * inside a call, not a kind of call. One table would have the compiler guard
 * a false equivalence. Chat reads the same in both.
 *
 * **열린 어휘다.** 게이트웨이가 새 경로를 열면 여기 없는 값이 온다. 그때는 원문을
 * 그대로 보여 준다 — 모르는 값을 「기타」로 접으면 새 경로가 생긴 사실이 화면에서
 * 사라진다.
 */
const LABELS: Record<string, string> = {
  chat: 'Chat',
  messages: 'Messages',
  responses: 'Responses',
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
