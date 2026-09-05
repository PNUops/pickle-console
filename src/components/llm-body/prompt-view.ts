/**
 * 기록된 프롬프트를 화면이 그릴 수 있는 모양으로 바꾼다.
 *
 * 서버는 `request`를 두 모양 중 하나로 준다. 보통은 보낸 messages 배열
 * 그대로이고, 길이 제한에 걸린 경우에는 앞부분을 담은 **문자열**이다. JSON
 * 배열을 중간에서 자르면 어느 파서도 받지 않는 것이 나오기 때문이다.
 *
 * 세 번째 갈래가 이 함수가 존재하는 이유다. 게이트웨이는 messages 배열을
 * 보낸 그대로 캡처하므로 `content`가 문자열이 아니라 **배열**일 수 있고(멀티
 * 파트 요청), 그것을 문자열로 취급하면 화면에 `[object Object]`가 뜨거나
 * 프롬프트가 통째로 비어 보인다. 서버가 그 안을 들여다보지 않으므로 방어는
 * 여기에 있어야 한다.
 *
 * `requestTruncated`로 모양을 추론하지 않는다. 그 플래그는 뒤가 잘렸다는
 * 뜻이지 값의 모양을 말하는 것이 아니다.
 */
export type PromptMessage = {
  role: string
  text: string
  /** 텍스트가 아니라 기록되지 않은 조각의 수 (이미지 등) */
  nonText: number
}

export type PromptView =
  | { kind: 'messages'; messages: PromptMessage[] }
  | { kind: 'text'; text: string }
  | { kind: 'raw'; text: string }

function readContent(content: unknown): { text: string; nonText: number } {
  if (typeof content === 'string') return { text: content, nonText: 0 }
  if (Array.isArray(content)) {
    const parts: string[] = []
    let nonText = 0
    for (const part of content) {
      if (part && typeof part === 'object' && (part as { type?: unknown }).type === 'text') {
        const value = (part as { text?: unknown }).text
        if (typeof value === 'string') {
          parts.push(value)
          continue
        }
      }
      nonText += 1
    }
    return { text: parts.join('\n'), nonText }
  }
  return { text: JSON.stringify(content ?? null), nonText: 0 }
}

export function readPrompt(request: unknown): PromptView | null {
  if (request === null || request === undefined) return null
  if (typeof request === 'string') return { kind: 'text', text: request }
  if (Array.isArray(request) && request.every((m) => m && typeof m === 'object')) {
    return {
      kind: 'messages',
      messages: request.map((message) => {
        const role = (message as { role?: unknown }).role
        const { text, nonText } = readContent((message as { content?: unknown }).content)
        return { role: typeof role === 'string' ? role : '(역할 없음)', text, nonText }
      }),
    }
  }
  return { kind: 'raw', text: JSON.stringify(request, null, 2) }
}
