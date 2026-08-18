import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { setAccessToken } from '../api/token'
import { problemResponse } from '../test/msw/handlers/auth'
import { server } from '../test/msw/server'
import { uuid } from '../test/msw/ids'
import { CONSOLE_SOURCE, TERMINAL_MESSAGE_VERSION, WINDOW_SOURCE } from './terminalWindowMessages'
import { closeTerminalWindows, openTerminalWindow } from './openTerminalWindow'

const VM_ID = uuid(56)
const OTHER_VM_ID = uuid(61)

interface FakeWindow {
  closed: boolean
  focus: ReturnType<typeof vi.fn>
  postMessage: ReturnType<typeof vi.fn>
}

function fakeWindow(): FakeWindow {
  return { closed: false, focus: vi.fn(), postMessage: vi.fn() }
}

function target(vmId = VM_ID) {
  return { vmId, label: '알고리즘 채점기', name: 'algo-judge' }
}

/** 팝업이 보낸 것처럼 티켓 요청을 흘려 넣는다. */
function requestTicket(source: unknown, vmId = VM_ID, requestId = 'req-1') {
  const event = new MessageEvent('message', {
    data: {
      source: WINDOW_SOURCE,
      v: TERMINAL_MESSAGE_VERSION,
      type: 'ticket-request',
      vmId,
      requestId,
    },
    origin: window.location.origin,
  })
  Object.defineProperty(event, 'source', { value: source })
  window.dispatchEvent(event)
}

let openSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  setAccessToken('access-user')
  openSpy = vi.spyOn(window, 'open')
})

afterEach(() => {
  // 모듈 싱글턴이 테스트 사이에 창을 물고 있지 않게 비운다.
  closeTerminalWindows()
  openSpy.mockRestore()
})

describe('openTerminalWindow — 창 열기', () => {
  test('팝업 주소·창 이름으로 열고, noopener는 주지 않는다', () => {
    const win = fakeWindow()
    openSpy.mockReturnValue(win as unknown as Window)
    expect(openTerminalWindow(target())).toBe(true)

    const [url, name, features] = openSpy.mock.calls[0] as [string, string, string]
    expect(url).toBe(`/terminal/${VM_ID}`)
    expect(name).toBe(`pickle-terminal-${VM_ID}`)
    // noopener를 주면 opener가 null이 되어 티켓 핸드셰이크가 성립하지 않는다.
    expect(features).not.toContain('noopener')
    expect(features).toContain('popup=yes')
    expect(win.focus).toHaveBeenCalled()
  })

  test('같은 VM을 다시 열면 새 창 대신 기존 창을 앞으로 가져온다', () => {
    const win = fakeWindow()
    openSpy.mockReturnValue(win as unknown as Window)
    openTerminalWindow(target())
    openTerminalWindow(target())
    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(win.focus).toHaveBeenCalledTimes(2)
  })

  test('닫힌 창은 정리하고 새로 연다', () => {
    const first = fakeWindow()
    openSpy.mockReturnValue(first as unknown as Window)
    openTerminalWindow(target())
    first.closed = true

    const second = fakeWindow()
    openSpy.mockReturnValue(second as unknown as Window)
    openTerminalWindow(target())
    expect(openSpy).toHaveBeenCalledTimes(2)
  })

  test('팝업이 차단되면 false를 돌려준다', () => {
    openSpy.mockReturnValue(null)
    expect(openTerminalWindow(target())).toBe(false)
  })
})

describe('openTerminalWindow — 티켓 중계', () => {
  test('우리가 연 창의 요청에는 mint한 티켓으로 답한다', async () => {
    const win = fakeWindow()
    openSpy.mockReturnValue(win as unknown as Window)
    openTerminalWindow(target())

    requestTicket(win)
    await vi.waitFor(() => expect(win.postMessage).toHaveBeenCalledTimes(1))
    expect(win.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: CONSOLE_SOURCE,
        type: 'ticket',
        requestId: 'req-1',
        vmLabel: '알고리즘 채점기',
        ticket: expect.objectContaining({ ticket: 'test-ticket-abc' }),
      }),
      window.location.origin,
    )
  })

  test('mint 실패는 사유 코드와 함께 되돌려 준다', async () => {
    server.use(
      http.post('*/api/v1/vms/:vmId/terminal-sessions', () =>
        problemResponse({
          type: 'about:blank',
          title: '터미널 접속 불가',
          status: 503,
          detail: '서버 상세 메시지',
          code: 'TERMINAL_DISABLED',
        }),
      ),
    )
    const win = fakeWindow()
    openSpy.mockReturnValue(win as unknown as Window)
    openTerminalWindow(target())

    requestTicket(win)
    await vi.waitFor(() => expect(win.postMessage).toHaveBeenCalledTimes(1))
    expect(win.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ticket-error', code: 'TERMINAL_DISABLED' }),
      window.location.origin,
    )
  })

  test('우리가 열지 않은 창의 요청에는 답하지 않는다', async () => {
    const ours = fakeWindow()
    openSpy.mockReturnValue(ours as unknown as Window)
    openTerminalWindow(target())

    const stranger = fakeWindow()
    requestTicket(stranger)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(stranger.postMessage).not.toHaveBeenCalled()
    expect(ours.postMessage).not.toHaveBeenCalled()
  })

  test('창에 배정되지 않은 VM의 티켓은 발급하지 않는다', async () => {
    const win = fakeWindow()
    openSpy.mockReturnValue(win as unknown as Window)
    openTerminalWindow(target())

    requestTicket(win, OTHER_VM_ID)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(win.postMessage).not.toHaveBeenCalled()
  })
})

describe('openTerminalWindow — mint 중복 제거', () => {
  test('같은 창의 동시 요청은 티켓 하나를 나눠 쓴다', async () => {
    // 개발 모드 이중 마운트와 재연결 연타가 같은 창에서 두 번 물어 온다. 티켓은
    // 상환 여부와 무관하게 60초 동안 세션 상한을 차지하므로, 하나를 나눠 준다.
    const win = fakeWindow()
    openSpy.mockReturnValue(win as unknown as Window)
    openTerminalWindow(target())

    let mints = 0
    server.use(
      http.post('*/api/v1/vms/:vmId/terminal-sessions', () => {
        mints += 1
        return HttpResponse.json(
          {
            sessionId: '3f1c9a2e-8d4b-4f6a-9c27-5e8b1a0d4c33',
            ticket: 'test-ticket-abc',
            wsPath: '/terminal/ws',
            subprotocol: 'pickle.terminal.v1',
            expiresAt: '2026-08-18T03:15:30Z',
          },
          { status: 201 },
        )
      }),
    )

    requestTicket(win, VM_ID, 'req-1')
    requestTicket(win, VM_ID, 'req-2')
    await vi.waitFor(() => expect(win.postMessage).toHaveBeenCalledTimes(2))

    expect(mints).toBe(1)
    const ids = win.postMessage.mock.calls.map((c) => (c[0] as { requestId: string }).requestId)
    expect(ids).toEqual(['req-1', 'req-2'])
  })
})

describe('closeTerminalWindows', () => {
  test('열린 창 전부에 shutdown을 통지한다', () => {
    const win = fakeWindow()
    openSpy.mockReturnValue(win as unknown as Window)
    openTerminalWindow(target())

    closeTerminalWindows()
    expect(win.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ source: CONSOLE_SOURCE, type: 'shutdown' }),
      window.location.origin,
    )
  })
})
