import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { MockFitAddon, MockTerminal, mockTerminals, resetXtermMock } from '../test/xtermMock'
import { StubWebSocket } from '../test/StubWebSocket'
import { uuid } from '../test/msw/ids'
import { MINT_TICKET } from '../test/msw/handlers/terminal'
import { CONSOLE_SOURCE, TERMINAL_MESSAGE_VERSION, WINDOW_SOURCE } from './terminalWindowMessages'
import { TerminalWindow } from './TerminalWindow'

vi.mock('@xterm/xterm', () => ({ Terminal: MockTerminal }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: MockFitAddon }))
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

const VM_ID = uuid(56)

/**
 * jsdom에서 opener를 흉내낸다 — iframe의 contentWindow는 진짜 Window라
 * `event.source === window.opener` 검증을 약화시키지 않고 그대로 통과시킬 수 있다.
 */
let frame: HTMLIFrameElement
let opener: Window
let postSpy: ReturnType<typeof vi.spyOn>

function setOpener(value: Window | null) {
  Object.defineProperty(window, 'opener', { value, configurable: true, writable: true })
}

/** 콘솔 탭이 보낸 것처럼 메시지를 주입한다. */
function fromOpener(data: unknown, options?: { origin?: string; source?: Window }) {
  const event = new MessageEvent('message', {
    data,
    origin: options?.origin ?? window.location.origin,
  })
  // MessageEvent init의 source 지원이 환경마다 흔들려 확정적으로 심는다.
  Object.defineProperty(event, 'source', { value: options?.source ?? opener })
  act(() => {
    window.dispatchEvent(event)
  })
}

/** 팝업이 보낸 ticket-request 중 마지막 것의 requestId. */
function lastRequestId(): string {
  const calls = postSpy.mock.calls
  return (calls[calls.length - 1][0] as { requestId: string }).requestId
}

function sendTicket(requestId = lastRequestId()) {
  fromOpener({
    source: CONSOLE_SOURCE,
    v: TERMINAL_MESSAGE_VERSION,
    type: 'ticket',
    requestId,
    ticket: MINT_TICKET,
    vmLabel: '알고리즘 채점기',
    vmName: 'algo-judge',
  })
}

beforeEach(() => {
  frame = document.createElement('iframe')
  document.body.append(frame)
  opener = frame.contentWindow!
  setOpener(opener)
  postSpy = vi.spyOn(opener, 'postMessage')
})

afterEach(() => {
  postSpy.mockRestore()
  frame.remove()
  setOpener(null)
  resetXtermMock()
})

describe('TerminalWindow — 티켓 핸드셰이크', () => {
  test('마운트하면 opener에게 티켓을 요청한다 (targetOrigin 고정)', async () => {
    render(<TerminalWindow vmId={VM_ID} />)
    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1))
    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        source: WINDOW_SOURCE,
        v: TERMINAL_MESSAGE_VERSION,
        type: 'ticket-request',
        vmId: VM_ID,
      }),
      window.location.origin,
    )
  })

  test('티켓을 받으면 그 티켓으로 WS에 접속한다', async () => {
    render(<TerminalWindow vmId={VM_ID} />)
    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1))
    sendTicket()
    await waitFor(() => expect(StubWebSocket.instances).toHaveLength(1))
    const ws = StubWebSocket.last()
    expect(ws.url).toBe(`ws://${window.location.host}/terminal/ws`)
    expect(ws.protocols).toEqual(['pickle.terminal.v1', 'ticket.test-ticket-abc'])
    expect(ws.binaryType).toBe('arraybuffer')
  })

  test('VM 이름은 티켓과 함께 온 값을 쓴다 (팝업은 API를 부르지 않는다)', async () => {
    render(<TerminalWindow vmId={VM_ID} />)
    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1))
    sendTicket()
    expect(await screen.findByText('알고리즘 채점기')).toBeInTheDocument()
  })
})

describe('TerminalWindow — 메시지 출처 검증', () => {
  test('다른 오리진의 티켓은 무시한다', async () => {
    render(<TerminalWindow vmId={VM_ID} />)
    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1))
    fromOpener(
      {
        source: CONSOLE_SOURCE,
        v: TERMINAL_MESSAGE_VERSION,
        type: 'ticket',
        requestId: lastRequestId(),
        ticket: MINT_TICKET,
        vmLabel: 'evil',
        vmName: 'evil',
      },
      { origin: 'https://evil.example' },
    )
    expect(StubWebSocket.instances).toHaveLength(0)
  })

  test('opener가 아닌 창이 보낸 티켓은 무시한다 (세션 고정 방어)', async () => {
    render(<TerminalWindow vmId={VM_ID} />)
    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1))
    fromOpener(
      {
        source: CONSOLE_SOURCE,
        v: TERMINAL_MESSAGE_VERSION,
        type: 'ticket',
        requestId: lastRequestId(),
        ticket: MINT_TICKET,
        vmLabel: 'evil',
        vmName: 'evil',
      },
      { source: window },
    )
    expect(StubWebSocket.instances).toHaveLength(0)
  })

  test('요청하지 않은 requestId의 티켓은 무시한다', async () => {
    render(<TerminalWindow vmId={VM_ID} />)
    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1))
    sendTicket('req-does-not-exist')
    expect(StubWebSocket.instances).toHaveLength(0)
  })
})

describe('TerminalWindow — 실패와 재연결', () => {
  test('mint 실패는 Problem code에 맞는 한국어 사유로 표시된다', async () => {
    render(<TerminalWindow vmId={VM_ID} />)
    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1))
    fromOpener({
      source: CONSOLE_SOURCE,
      v: TERMINAL_MESSAGE_VERSION,
      type: 'ticket-error',
      requestId: lastRequestId(),
      code: 'TERMINAL_DISABLED',
      message: '서버 상세 메시지',
    })
    expect(
      await screen.findByText('웹 터미널 기능이 현재 비활성화되어 있습니다.'),
    ).toBeInTheDocument()
    expect(StubWebSocket.instances).toHaveLength(0)
  })

  test('재연결은 새 requestId로 티켓을 다시 요청한다', async () => {
    render(<TerminalWindow vmId={VM_ID} />)
    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1))
    const first = lastRequestId()
    sendTicket(first)
    await waitFor(() => expect(StubWebSocket.instances).toHaveLength(1))
    const ws = StubWebSocket.last()
    act(() => ws.simulateOpen())
    act(() => ws.simulateServerClose(1000))

    const button = await screen.findByRole('button', { name: '다시 연결' })
    act(() => button.click())
    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(2))
    expect(lastRequestId()).not.toBe(first)
  })

  test('관리자 종료(4002)에는 재연결 버튼이 없다', async () => {
    render(<TerminalWindow vmId={VM_ID} />)
    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1))
    sendTicket()
    await waitFor(() => expect(StubWebSocket.instances).toHaveLength(1))
    const ws = StubWebSocket.last()
    act(() => ws.simulateOpen())
    act(() => ws.simulateServerClose(4002))
    expect(await screen.findByText('관리자가 세션을 종료했습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 연결' })).not.toBeInTheDocument()
  })
})

describe('TerminalWindow — opener 없음 / 종료 통지', () => {
  test('opener가 없으면 요청도 접속도 하지 않고 안내만 띄운다', async () => {
    setOpener(null)
    render(<TerminalWindow vmId={VM_ID} />)
    expect(await screen.findByText('콘솔에서 열어 주세요')).toBeInTheDocument()
    expect(postSpy).not.toHaveBeenCalled()
    expect(StubWebSocket.instances).toHaveLength(0)
  })

  test('shutdown을 받으면 소켓을 닫고 재연결 없이 마감한다', async () => {
    render(<TerminalWindow vmId={VM_ID} />)
    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1))
    sendTicket()
    await waitFor(() => expect(StubWebSocket.instances).toHaveLength(1))
    const ws = StubWebSocket.last()
    act(() => ws.simulateOpen())

    fromOpener({
      source: CONSOLE_SOURCE,
      v: TERMINAL_MESSAGE_VERSION,
      type: 'shutdown',
    })
    expect(await screen.findByText('세션이 종료되었습니다')).toBeInTheDocument()
    expect(ws.closedByClient?.code).toBe(1000)
    expect(screen.queryByRole('button', { name: '다시 연결' })).not.toBeInTheDocument()
  })
})

describe('TerminalWindow — 답하지 않는 opener', () => {
  test('티켓 요청이 시간 초과하면 재시도 대신 안내로 마감한다', async () => {
    // 콘솔 탭이 새로고침되면 그쪽 리스너와 창 기록이 옛 문서와 함께 사라진다.
    // opener 자체는 살아 있으므로 요청은 나가지만 아무도 답하지 않고, 다시
    // 눌러 봐야 같은 결과다 — 유일한 복구는 콘솔에서 다시 여는 것이다.
    vi.useFakeTimers()
    try {
      render(<TerminalWindow vmId={VM_ID} />)
      await vi.waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(9000)
      })

      expect(screen.getByText('콘솔에서 열어 주세요')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '다시 연결' })).not.toBeInTheDocument()
      expect(StubWebSocket.instances).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('TerminalWindow — 입출력과 크기', () => {
  test('바이너리 프레임은 터미널에 쓰이고, 입력은 바이너리로 나간다', async () => {
    render(<TerminalWindow vmId={VM_ID} />)
    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1))
    sendTicket()
    await waitFor(() => expect(StubWebSocket.instances).toHaveLength(1))
    const ws = StubWebSocket.last()
    act(() => ws.simulateOpen())

    const term = mockTerminals[mockTerminals.length - 1]
    act(() => ws.simulateBinary(new TextEncoder().encode('hello')))
    expect(term.write).toHaveBeenCalledTimes(1)

    act(() => term.emitData('ls\n'))
    expect(ws.sentBinaryAsText()).toContain('ls\n')
  })

  test('창 크기가 바뀌면 fit 후 resize 프레임을 보낸다', async () => {
    vi.useFakeTimers()
    try {
      render(<TerminalWindow vmId={VM_ID} />)
      await vi.waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1))
      sendTicket()
      await vi.waitFor(() => expect(StubWebSocket.instances).toHaveLength(1))
      const ws = StubWebSocket.last()
      act(() => ws.simulateOpen())
      const before = ws.sentText().length

      act(() => {
        window.dispatchEvent(new Event('resize'))
      })
      act(() => {
        vi.advanceTimersByTime(200)
      })
      expect(ws.sentText().slice(before)).toEqual([
        JSON.stringify({ type: 'resize', cols: 80, rows: 24 }),
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  test('xterm은 창 조작·하이퍼링크가 막힌 상태로 만들어진다', async () => {
    render(<TerminalWindow vmId={VM_ID} />)
    const term = mockTerminals[mockTerminals.length - 1]
    const options = term.options as {
      allowProposedApi: boolean
      windowOptions: Record<string, unknown>
      linkHandler: { allowNonHttpProtocols: boolean }
    }
    expect(options.allowProposedApi).toBe(false)
    expect(options.windowOptions).toEqual({})
    expect(options.linkHandler.allowNonHttpProtocols).toBe(false)
  })
})
