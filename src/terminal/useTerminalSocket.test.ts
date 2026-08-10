import { act, renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, test, vi } from 'vitest'
import { setAccessToken } from '../api/token'
import { problemResponse } from '../test/msw/handlers/auth'
import { StubWebSocket } from '../test/StubWebSocket'
import { server } from '../test/msw/server'
import { useTerminalSocket } from './useTerminalSocket'
import { uuid } from '../test/msw/ids'

function render(vmId = uuid(56), onData: (b: Uint8Array) => void = () => {}) {
  setAccessToken('access-user')
  return renderHook(() => useTerminalSocket(vmId, onData))
}

/** mint 성공 후 WS가 생성되고 open까지 진행된 상태를 만든다. */
async function connectAndOpen(onData?: (b: Uint8Array) => void) {
  const hook = render(uuid(56), onData)
  await waitFor(() => expect(StubWebSocket.instances).toHaveLength(1))
  const ws = StubWebSocket.last()
  act(() => ws.simulateOpen())
  await waitFor(() => expect(hook.result.current.phase.status).toBe('open'))
  return { hook, ws }
}

describe('useTerminalSocket — 핸드셰이크', () => {
  test('mint 후 same-origin WS URL과 2요소 서브프로토콜로 접속한다', async () => {
    render()
    await waitFor(() => expect(StubWebSocket.instances).toHaveLength(1))
    const ws = StubWebSocket.last()
    expect(ws.url).toBe(`ws://${window.location.host}/terminal/ws`)
    expect(ws.protocols).toEqual(['pickle.terminal.v1', 'ticket.test-ticket-abc'])
    expect(ws.binaryType).toBe('arraybuffer')
  })

  test('open 시 phase가 open으로 전이한다', async () => {
    const { hook } = await connectAndOpen()
    expect(hook.result.current.phase.status).toBe('open')
  })
})

describe('useTerminalSocket — 프레임 프로토콜', () => {
  test('수신 바이너리 프레임은 onData로 전달된다', async () => {
    const onData = vi.fn()
    const { ws } = await connectAndOpen(onData)
    act(() => ws.simulateBinary(new TextEncoder().encode('hello')))
    expect(onData).toHaveBeenCalledTimes(1)
    expect(new TextDecoder().decode(onData.mock.calls[0][0])).toBe('hello')
  })

  test('sendInput은 UTF-8 바이너리 프레임으로 송신된다', async () => {
    const { hook, ws } = await connectAndOpen()
    act(() => hook.result.current.sendInput('ls\n'))
    expect(ws.sentBinaryAsText()).toEqual(['ls\n'])
    expect(ws.sentText()).toHaveLength(0)
  })

  test('sendResize는 resize 텍스트 프레임(JSON)으로 송신된다', async () => {
    const { hook, ws } = await connectAndOpen()
    act(() => hook.result.current.sendResize(120, 40))
    expect(ws.sentText()).toEqual([JSON.stringify({ type: 'resize', cols: 120, rows: 40 })])
  })

  test('서버 exit 텍스트 프레임의 전문이 close 폴백보다 우선한다', async () => {
    const { hook, ws } = await connectAndOpen()
    act(() =>
      ws.simulateText(
        JSON.stringify({ type: 'exit', code: 4002, message: '관리자에 의해 종료되었습니다(전문).' }),
      ),
    )
    act(() => ws.simulateServerClose(4002))
    await waitFor(() => expect(hook.result.current.phase.status).toBe('closed'))
    const phase = hook.result.current.phase
    expect(phase).toMatchObject({
      status: 'closed',
      code: 4002,
      message: '관리자에 의해 종료되었습니다(전문).',
      canReconnect: false,
    })
  })
})

describe('useTerminalSocket — 종료 코드 폴백 매핑', () => {
  test.each([
    [1000, '세션이 종료되었습니다.', true],
    [1001, '서버 점검으로 연결이 종료되었습니다. 잠시 후 다시 연결해 주세요.', true],
    [4000, '접속 티켓이 유효하지 않거나 만료되었습니다.', true],
    [4001, '15분 동안 입력이 없어 연결이 종료되었습니다.', true],
    [4002, '관리자가 세션을 종료했습니다.', false],
    [4003, 'VM이 실행 중이 아닙니다.', true],
    [4004, '접근 권한이 변경되어 연결이 종료되었습니다.', true],
    [4005, '웹 터미널 기능이 현재 비활성화되어 있습니다.', false],
    [4006, '연결에 실패했습니다 (호스트 키 불일치 또는 전송 오류).', true],
    [4999, '알 수 없는 오류로 연결이 종료되었습니다.', true],
  ])('close %i → "%s" (재연결 가능=%s)', async (code, message, canReconnect) => {
    const { hook, ws } = await connectAndOpen()
    act(() => ws.simulateServerClose(code as number))
    await waitFor(() => expect(hook.result.current.phase.status).toBe('closed'))
    expect(hook.result.current.phase).toMatchObject({ code, message, canReconnect })
  })
})

describe('useTerminalSocket — mint 실패 매핑', () => {
  test.each([
    [503, 'TERMINAL_DISABLED', '웹 터미널 기능이 현재 비활성화되어 있습니다.'],
    [
      409,
      'TERMINAL_SESSION_LIMIT',
      '동시 터미널 세션 상한을 초과했습니다. 사용 중인 세션을 닫은 뒤 다시 시도해 주세요.',
    ],
    [429, 'RATE_LIMITED', '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.'],
    [403, 'ACCESS_DENIED', '관리자가 이 VM의 원격 접속을 차단했습니다. 관리자에게 문의하세요.'],
    [
      403,
      'WORKSPACE_ROLE_INSUFFICIENT',
      '웹 터미널은 워크스페이스 참여자(MEMBER) 이상만 사용할 수 있습니다.',
    ],
  ])('%i %s → 한국어 메시지, WS는 열리지 않는다', async (status, code, message) => {
    server.use(
      http.post('*/api/v1/vms/:vmId/terminal-sessions', () =>
        problemResponse({
          type: 'about:blank',
          title: '터미널 접속 불가',
          status: status as number,
          detail: '서버 상세 메시지',
          code: code as string,
        }),
      ),
    )
    const { result } = render()
    await waitFor(() => expect(result.current.phase.status).toBe('closed'))
    expect(result.current.phase).toMatchObject({ message, canReconnect: true })
    expect(StubWebSocket.instances).toHaveLength(0)
  })
})

describe('useTerminalSocket — 재연결·정리', () => {
  test('재연결 가능 종료 후 reconnect()는 mint부터 다시 시작한다', async () => {
    const { hook, ws } = await connectAndOpen()
    act(() => ws.simulateServerClose(1000))
    await waitFor(() => expect(hook.result.current.phase.status).toBe('closed'))

    act(() => hook.result.current.reconnect())
    expect(hook.result.current.phase.status).toBe('connecting')
    await waitFor(() => expect(StubWebSocket.instances).toHaveLength(2))
  })

  test('언마운트 시 WS를 1000으로 닫는다', async () => {
    const { hook, ws } = await connectAndOpen()
    hook.unmount()
    expect(ws.closedByClient?.code).toBe(1000)
  })
})
