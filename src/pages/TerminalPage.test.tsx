import { screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { http } from 'msw'
import { describe, expect, test, vi } from 'vitest'
import { problemResponse, refreshSuccessHandler } from '../test/msw/handlers/auth'
import { StubWebSocket } from '../test/StubWebSocket'
import { mockTerminals, resetXtermMock } from '../test/xtermMock'
import { server } from '../test/msw/server'
import { renderApp } from '../test/render'

// xterm.js는 jsdom에서 무거우므로 목으로 대체한다.
vi.mock('@xterm/xterm', async () => {
  const { MockTerminal } = await import('../test/xtermMock')
  return { Terminal: MockTerminal }
})
vi.mock('@xterm/addon-fit', async () => {
  const { MockFitAddon } = await import('../test/xtermMock')
  return { FitAddon: MockFitAddon }
})
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

function renderTerminal(vmId = 56) {
  resetXtermMock()
  server.use(refreshSuccessHandler('access-user'))
  renderApp(`/console/vms/${vmId}/terminal`)
}

/** WS 인스턴스가 생성될 때까지 대기하고 반환한다. */
async function waitForWs(): Promise<StubWebSocket> {
  await waitFor(() => expect(StubWebSocket.instances.length).toBeGreaterThan(0))
  return StubWebSocket.last()
}

describe('TerminalPage — 연결·프레임', () => {
  test('VM 이름 헤더를 보여주고 mint→WS로 연결한다', async () => {
    renderTerminal(56)
    expect(await screen.findByText('웹 터미널 · algo-judge')).toBeInTheDocument()
    const ws = await waitForWs()
    expect(ws.protocols).toEqual(['pickle.terminal.v1', 'ticket.test-ticket-abc'])
  })

  test('수신 바이너리 프레임은 터미널에 write된다', async () => {
    renderTerminal(56)
    const ws = await waitForWs()
    act(() => ws.simulateOpen())
    act(() => ws.simulateBinary(new TextEncoder().encode('hi')))
    const term = mockTerminals.at(-1)!
    await waitFor(() => expect(term.write).toHaveBeenCalled())
  })

  test('터미널 입력(onData)은 바이너리 프레임으로 송신된다', async () => {
    renderTerminal(56)
    const ws = await waitForWs()
    act(() => ws.simulateOpen())
    const term = mockTerminals.at(-1)!
    act(() => term.emitData('whoami\n'))
    expect(ws.sentBinaryAsText()).toContain('whoami\n')
  })

  test('open 시 초기 resize 프레임을 보낸다', async () => {
    renderTerminal(56)
    const ws = await waitForWs()
    act(() => ws.simulateOpen())
    await waitFor(() =>
      expect(ws.sentText()).toContain(
        JSON.stringify({ type: 'resize', cols: 80, rows: 24 }),
      ),
    )
  })
})

describe('TerminalPage — 종료 오버레이', () => {
  test('일반 종료는 사유와 다시 연결 버튼을 보여준다', async () => {
    renderTerminal(56)
    const ws = await waitForWs()
    act(() => ws.simulateOpen())
    act(() => ws.simulateServerClose(1000))
    expect(await screen.findByText('세션이 종료되었습니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 연결' })).toBeInTheDocument()
  })

  test('관리자 종료(4002)는 다시 연결 버튼을 숨긴다', async () => {
    renderTerminal(56)
    const ws = await waitForWs()
    act(() => ws.simulateOpen())
    act(() => ws.simulateServerClose(4002))
    expect(await screen.findByText('관리자가 세션을 종료했습니다.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 연결' })).not.toBeInTheDocument()
  })

  test('기능 비활성(4005)도 다시 연결 버튼을 숨긴다', async () => {
    renderTerminal(56)
    const ws = await waitForWs()
    act(() => ws.simulateOpen())
    act(() => ws.simulateServerClose(4005))
    expect(
      await screen.findByText('웹 터미널 기능이 현재 비활성화되어 있습니다.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 연결' })).not.toBeInTheDocument()
  })

  test('mint 실패(503)는 한국어 사유 오버레이를 보여준다', async () => {
    server.use(
      http.post('*/api/v1/vms/:vmId/terminal-sessions', () =>
        problemResponse({
          type: 'about:blank',
          title: '웹 터미널을 사용할 수 없습니다',
          status: 503,
          detail: '웹 터미널 기능이 현재 비활성화되어 있습니다.',
          code: 'TERMINAL_DISABLED',
        }),
      ),
    )
    renderTerminal(56)
    expect(
      await screen.findByText('웹 터미널 기능이 현재 비활성화되어 있습니다.'),
    ).toBeInTheDocument()
    expect(StubWebSocket.instances).toHaveLength(0)
  })
})
