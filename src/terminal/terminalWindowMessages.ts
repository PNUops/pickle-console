import { ApiError, type Problem } from '../api/problem'
import type { TerminalSessionTicket } from '../api/queries'

/**
 * 콘솔 탭 ↔ 터미널 팝업 창 사이의 postMessage 규약.
 *
 * 팝업은 콘솔의 인증 스택(AuthProvider·ReauthProvider·QueryClient)을 마운트하지
 * 않는 별도 문서다 — 스스로 `/auth/refresh`를 칠 수 없고, 쳐서도 안 된다(리프레시
 * 토큰 회전+재사용 탐지가 부모 탭과 레이스를 일으키면 체인 전체가 폐기되어 모든
 * 탭이 로그아웃된다). 그래서 접속 티켓은 액세스 토큰을 쥔 콘솔 탭이 mint해서
 * 이 채널로 건네준다.
 *
 * **같은 오리진이라도 메시지를 신뢰하지 않는다.** 확장 프로그램도, 다른 탭도 같은
 * 오리진에서 postMessage를 보낼 수 있다. 수신 측은 origin·source·형태를 모두
 * 확인하고, 송신 측은 targetOrigin을 정확한 오리진으로 고정한다('*' 금지).
 */

export const TERMINAL_MESSAGE_VERSION = 1

/**
 * Where the console announces that the session ended.
 *
 * The `postMessage` registry above only reaches windows the *current* console
 * document opened, so a console tab that reloaded — or a second tab doing the
 * logging out — could not tell an open terminal anything, and the window stayed
 * a usable shell. A broadcast reaches every same-origin context regardless of
 * who opened whom.
 *
 * This carries no credential and needs no coordination, which is why it is
 * acceptable here while a broadcast-based *session refresh* is not: that would
 * mean electing a leader and putting an access token on the channel.
 */
export const SESSION_CHANNEL = 'pickle-session'

export interface SessionEndedBroadcast {
  source: typeof CONSOLE_SOURCE
  v: typeof TERMINAL_MESSAGE_VERSION
  type: 'session-ended'
}

export function isSessionEnded(value: unknown): value is SessionEndedBroadcast {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { source?: unknown }).source === CONSOLE_SOURCE &&
    (value as { v?: unknown }).v === TERMINAL_MESSAGE_VERSION &&
    (value as { type?: unknown }).type === 'session-ended'
  )
}

/** 팝업 → 콘솔 탭. */
export const WINDOW_SOURCE = 'pickle-terminal-window'
/** 콘솔 탭 → 팝업. */
export const CONSOLE_SOURCE = 'pickle-console'

export interface TicketRequestMessage {
  source: typeof WINDOW_SOURCE
  v: typeof TERMINAL_MESSAGE_VERSION
  type: 'ticket-request'
  vmId: string
  requestId: string
}

export interface TicketMessage {
  source: typeof CONSOLE_SOURCE
  v: typeof TERMINAL_MESSAGE_VERSION
  type: 'ticket'
  requestId: string
  ticket: TerminalSessionTicket
  /** 표시용 이름 — 팝업은 API를 부르지 않으므로 부모가 실어 보낸다. */
  vmLabel: string
  vmName: string
}

export interface TicketErrorMessage {
  source: typeof CONSOLE_SOURCE
  v: typeof TERMINAL_MESSAGE_VERSION
  type: 'ticket-error'
  requestId: string
  /** Problem code — 팝업이 한국어 사유로 되살린다. */
  code: string | null
  message: string
}

/** 콘솔에서 로그아웃(또는 세션 만료)됐으니 창을 닫으라는 통지. */
export interface ShutdownMessage {
  source: typeof CONSOLE_SOURCE
  v: typeof TERMINAL_MESSAGE_VERSION
  type: 'shutdown'
}

export type ConsoleMessage = TicketMessage | TicketErrorMessage | ShutdownMessage

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isTicketShape(value: unknown): value is TerminalSessionTicket {
  return (
    isRecord(value) &&
    typeof value.ticket === 'string' &&
    typeof value.wsPath === 'string' &&
    typeof value.subprotocol === 'string'
  )
}

export function isTicketRequest(value: unknown): value is TicketRequestMessage {
  return (
    isRecord(value) &&
    value.source === WINDOW_SOURCE &&
    value.v === TERMINAL_MESSAGE_VERSION &&
    value.type === 'ticket-request' &&
    typeof value.vmId === 'string' &&
    typeof value.requestId === 'string'
  )
}

export function isConsoleMessage(value: unknown): value is ConsoleMessage {
  if (!isRecord(value)) return false
  if (value.source !== CONSOLE_SOURCE || value.v !== TERMINAL_MESSAGE_VERSION) return false
  if (value.type === 'shutdown') return true
  if (typeof value.requestId !== 'string') return false
  if (value.type === 'ticket') return isTicketShape(value.ticket)
  if (value.type === 'ticket-error') {
    return (
      (value.code === null || typeof value.code === 'string') &&
      typeof value.message === 'string'
    )
  }
  return false
}

/**
 * 채널을 건너온 mint 실패를 훅이 아는 형태로 되살린다 — 그래야 팝업에서도
 * Problem code별 한국어 문구 분기가 콘솔과 똑같이 동작한다.
 */
export function ticketErrorToApiError(code: string | null, message: string): ApiError {
  const problem: Problem | null = code
    ? { code, status: 502, title: message, detail: message }
    : null
  return new ApiError(problem, message)
}
