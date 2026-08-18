import { toApiError } from '../api/problem'
import { createTerminalSession } from '../api/queries'
import { onSessionExpired } from '../api/token'
import { terminalWindowName, terminalWindowPath } from '../lib/paths'
import {
  CONSOLE_SOURCE,
  TERMINAL_MESSAGE_VERSION,
  isTicketRequest,
  type ConsoleMessage,
} from './terminalWindowMessages'

/**
 * 콘솔 탭 쪽 터미널 창 관리자.
 *
 * React 컨텍스트가 아니라 모듈 싱글턴인 이유: 창을 여는 곳이 둘로 흩어져 있고
 * (VM 상세, 대시보드 행), message 리스너가 라우트 전환보다 오래 살아야 한다.
 */

interface OpenWindow {
  win: Window
  vmId: string
  label: string
  name: string
}

export interface TerminalWindowTarget {
  vmId: string
  /** 표시 이름(displayName 우선). */
  label: string
  /** 슬러그 등 보조 이름. */
  name: string
}

const windows = new Map<string, OpenWindow>()
let installed = false

const MINT_FALLBACK_MESSAGE = '터미널 접속 티켓을 발급하지 못했습니다.'

/** 팝업 크기 — 부모 창 기준으로 가운데 정렬한다. */
const WIDTH = 1024
const HEIGHT = 700

function features(): string {
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - WIDTH) / 2))
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - HEIGHT) / 2))
  // noopener는 절대 넣지 않는다 — 넣으면 열린 창의 window.opener가 null이 되어
  // 티켓 핸드셰이크가 성립하지 않는다. 여는 문서는 우리 오리진의 우리 번들이므로
  // noopener가 막으려는 위험(제3자 페이지가 우리 창 핸들을 쥐는 것)이 애초에 없다.
  return [
    'popup=yes',
    'resizable=yes',
    'scrollbars=no',
    `width=${WIDTH}`,
    `height=${HEIGHT}`,
    `left=${left}`,
    `top=${top}`,
  ].join(',')
}

function post(win: Window, message: ConsoleMessage): void {
  // targetOrigin은 정확한 오리진으로 고정한다 — '*'는 창이 다른 문서로 이동한
  // 뒤에도 메시지를 흘린다.
  if (!win.closed) win.postMessage(message, window.location.origin)
}

function pruneClosed(): void {
  for (const [vmId, entry] of windows) {
    if (entry.win.closed) windows.delete(vmId)
  }
}

async function mintAndReply(entry: OpenWindow, requestId: string): Promise<void> {
  try {
    const ticket = await createTerminalSession(entry.vmId)
    post(entry.win, {
      source: CONSOLE_SOURCE,
      v: TERMINAL_MESSAGE_VERSION,
      type: 'ticket',
      requestId,
      ticket,
      vmLabel: entry.label,
      vmName: entry.name,
    })
  } catch (err) {
    const apiError = toApiError(err, MINT_FALLBACK_MESSAGE)
    post(entry.win, {
      source: CONSOLE_SOURCE,
      v: TERMINAL_MESSAGE_VERSION,
      type: 'ticket-error',
      requestId,
      code: apiError.code,
      message: apiError.message,
    })
  }
}

function onMessage(event: MessageEvent): void {
  // ① 오리진 ② 형태 ③ 우리가 연 창인가 ④ 그 창에 배정된 VM인가.
  if (event.origin !== window.location.origin) return
  if (!isTicketRequest(event.data)) return
  const entry = [...windows.values()].find((candidate) => candidate.win === event.source)
  if (!entry || entry.vmId !== event.data.vmId) return
  void mintAndReply(entry, event.data.requestId)
}

function install(): void {
  if (installed) return
  installed = true
  window.addEventListener('message', onMessage)
  // 401을 리프레시로 회복하지 못한 경우도 로그아웃과 같게 취급한다.
  onSessionExpired(closeTerminalWindows)
}

/**
 * 터미널 창을 연다(이미 열려 있으면 그 창을 앞으로).
 *
 * @returns 팝업 차단으로 열지 못하면 false — 호출부가 안내한다.
 */
export function openTerminalWindow(target: TerminalWindowTarget): boolean {
  install()
  pruneClosed()

  const existing = windows.get(target.vmId)
  if (existing) {
    // 같은 VM을 다시 열면 재로드 없이 기존 창을 띄운다(진행 중 세션 보존).
    existing.label = target.label
    existing.name = target.name
    existing.win.focus()
    return true
  }

  const win = window.open(
    terminalWindowPath(target.vmId),
    terminalWindowName(target.vmId),
    features(),
  )
  if (!win) return false

  windows.set(target.vmId, { win, ...target })
  win.focus()
  return true
}

/**
 * 열린 터미널 창에 종료를 통지한다 — 로그아웃·세션 만료 시.
 *
 * 이것은 클라이언트측 best-effort다. 브리지의 재검증은 tokenVersion·멤버십·킬
 * 스위치만 보고 로그아웃은 tokenVersion을 올리지 않으므로, 통지가 닿지 않으면
 * 서버측 세션은 유휴 타임아웃까지 남는다.
 */
export function closeTerminalWindows(): void {
  for (const entry of windows.values()) {
    post(entry.win, {
      source: CONSOLE_SOURCE,
      v: TERMINAL_MESSAGE_VERSION,
      type: 'shutdown',
    })
  }
  windows.clear()
}
