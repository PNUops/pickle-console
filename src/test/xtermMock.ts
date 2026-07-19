import { vi } from 'vitest'

/**
 * xterm.js는 jsdom에서 무겁고(캔버스·DOM 측정) 실 렌더가 불필요하므로 목으로 대체.
 * TerminalPage 테스트에서 `vi.mock('@xterm/xterm', …)`으로 주입한다.
 */

export const mockTerminals: MockTerminal[] = []

export class MockTerminal {
  options: unknown
  cols = 80
  rows = 24
  write = vi.fn()
  focus = vi.fn()
  dispose = vi.fn()
  loadAddon = vi.fn()
  open = vi.fn()
  private dataCb: ((data: string) => void) | null = null

  constructor(options: unknown) {
    this.options = options
    mockTerminals.push(this)
  }

  onData(cb: (data: string) => void): { dispose: () => void } {
    this.dataCb = cb
    return { dispose: vi.fn() }
  }

  /** 테스트에서 사용자 입력을 흉내낸다. */
  emitData(data: string): void {
    this.dataCb?.(data)
  }
}

export class MockFitAddon {
  activate = vi.fn()
  fit = vi.fn()
  dispose = vi.fn()
}

export function resetXtermMock(): void {
  mockTerminals.length = 0
}
