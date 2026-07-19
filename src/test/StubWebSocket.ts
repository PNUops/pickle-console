/**
 * jsdom에는 WebSocket이 없다 — 웹 터미널 훅 테스트용 스텁.
 *
 * 인스턴스를 추적하고, 서브프로토콜을 기록하며, 서버 프레임 주입과 close를
 * 시뮬레이션한다. setup.ts에서 전역 WebSocket에 주입한다.
 */
/**
 * 인스턴스 레지스트리는 globalThis에 둔다. vitest는 setupFile과 일반 import에서
 * 이 모듈을 각각 평가할 수 있어(클래스 정체성 이중화), static 필드로는 setup이
 * 주입한 클래스와 테스트가 읽는 클래스가 배열을 공유하지 못한다. 잘 알려진
 * 전역 키에 배열을 두면 어느 사본이든 같은 레지스트리를 본다.
 */
const REGISTRY_KEY = '__pickleStubWebSockets__'

function registry(): StubWebSocket[] {
  const g = globalThis as unknown as Record<string, StubWebSocket[] | undefined>
  return (g[REGISTRY_KEY] ??= [])
}

export class StubWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3

  /** 생성된 모든 스텁 인스턴스 (테스트가 최신 것을 조회). */
  static get instances(): StubWebSocket[] {
    return registry()
  }

  url: string
  /** 핸드셰이크에 넘긴 서브프로토콜 배열 (2요소 검증용). */
  protocols: string[]
  readyState: number = StubWebSocket.CONNECTING
  binaryType: 'blob' | 'arraybuffer' = 'blob'

  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null

  /** send()로 나간 프레임 (문자열=텍스트, Uint8Array=바이너리). */
  sent: Array<string | ArrayBufferLike | ArrayBufferView> = []
  /** 클라이언트가 close()한 코드 (언마운트 정리 검증용). */
  closedByClient: { code?: number; reason?: string } | null = null

  constructor(url: string, protocols?: string | string[]) {
    this.url = url
    this.protocols =
      protocols == null ? [] : Array.isArray(protocols) ? protocols : [protocols]
    registry().push(this)
  }

  send(data: string | ArrayBufferLike | ArrayBufferView): void {
    this.sent.push(data)
  }

  close(code?: number, reason?: string): void {
    this.readyState = StubWebSocket.CLOSED
    this.closedByClient = { code, reason }
  }

  addEventListener(): void {}
  removeEventListener(): void {}

  /* ── 테스트 헬퍼 ── */

  simulateOpen(): void {
    this.readyState = StubWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  simulateBinary(bytes: Uint8Array): void {
    this.onmessage?.({ data: bytes.buffer } as MessageEvent)
  }

  simulateText(text: string): void {
    this.onmessage?.({ data: text } as MessageEvent)
  }

  /** 서버발 close(코드+reason) 시뮬레이션. */
  simulateServerClose(code: number, reason = ''): void {
    this.readyState = StubWebSocket.CLOSED
    this.onclose?.({ code, reason } as CloseEvent)
  }

  /** 나간 바이너리 프레임을 UTF-8 문자열로 디코드. */
  sentBinaryAsText(): string[] {
    const decoder = new TextDecoder()
    // 크로스-렐름 instanceof를 피하려 "문자열이 아닌 것 = 바이너리"로 판별한다.
    return this.sent
      .filter((f) => typeof f !== 'string')
      .map((f) => decoder.decode(f as ArrayBufferView))
  }

  /** 나간 텍스트 프레임(JSON 등). */
  sentText(): string[] {
    return this.sent.filter((f): f is string => typeof f === 'string')
  }

  static reset(): void {
    registry().length = 0
  }

  static last(): StubWebSocket {
    const ws = registry().at(-1)
    if (!ws) throw new Error('StubWebSocket 인스턴스가 없습니다.')
    return ws
  }
}
