import { http, HttpResponse, type RequestHandler } from 'msw'
import type { components } from '../../../api/schema'

type Schemas = components['schemas']
type TerminalSessionView = Schemas['TerminalSessionView']

/** 기본 mint 응답 — 테스트가 WS URL·서브프로토콜을 검증하는 고정 티켓. */
export const MINT_TICKET: Schemas['TerminalSessionTicketResponse'] = {
  sessionId: '3f1c9a2e-8d4b-4f6a-9c27-5e8b1a0d4c33',
  ticket: 'test-ticket-abc',
  wsPath: '/terminal/ws',
  subprotocol: 'pickle.terminal.v1',
  expiresAt: '2026-07-20T03:15:30Z',
}

function initialSessions(): TerminalSessionView[] {
  return [
    {
      sessionId: 'aaaa1111-bbbb-2222-cccc-3333dddd4444',
      vmId: 56,
      vmName: 'algo-judge',
      orgId: 1,
      orgName: '정보컴퓨터공학부 실습지원센터',
      groupName: '캡스톤 3조',
      userId: 42,
      userEmail: 'example@pusan.ac.kr',
      userName: '홍길동',
      clientIp: '203.0.113.7',
      startedAt: '2026-07-20T02:50:00+09:00',
    },
    {
      sessionId: 'bbbb2222-cccc-3333-dddd-4444eeee5555',
      vmId: 61,
      vmName: 'ai-train',
      orgId: 2,
      orgName: 'SW교육센터',
      groupName: '딥러닝 스터디',
      userId: 58,
      userEmail: 'younghee.park@pusan.ac.kr',
      userName: '박영희',
      clientIp: '203.0.113.9',
      startedAt: '2026-07-20T02:55:00+09:00',
    },
  ]
}

export let terminalSessionStore: TerminalSessionView[] = initialSessions()

export function resetTerminalFixtures(): void {
  terminalSessionStore = initialSessions()
}

export const terminalHandlers: RequestHandler[] = [
  http.post('*/api/v1/vms/:vmId/terminal-sessions', () =>
    HttpResponse.json(MINT_TICKET, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    }),
  ),

  http.get('*/api/v1/admin/terminal-sessions', () =>
    HttpResponse.json(terminalSessionStore, { status: 200 }),
  ),

  http.post('*/api/v1/admin/terminal-sessions/:sessionId/terminate', ({ params }) => {
    // 멱등 204 — 미러에서 세션을 제거한다(알 수 없는 ID도 no-op 204).
    terminalSessionStore = terminalSessionStore.filter(
      (s) => s.sessionId !== params.sessionId,
    )
    return new HttpResponse(null, { status: 204 })
  }),
]
