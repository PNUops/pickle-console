import { useCallback, useEffect, useRef, useState } from 'react'
import { toApiError } from '../api/problem'
import { createTerminalSession } from '../api/queries'

/**
 * 웹 터미널 WebSocket 연결 훅.
 *
 * 흐름: ① mint (`POST /vms/{vmId}/terminal-sessions`) → ② 반환된 티켓으로
 * `wss://<host>/terminal/ws`에 2요소 서브프로토콜(`[subprotocol, "ticket.<t>"]`)로
 * 접속 → ③ 브리지(LXC 102)가 종단. **자동 재연결은 하지 않는다** — 종료 사유만
 * 상태로 노출하고, 재연결은 사용자가 `reconnect()`로 mint부터 다시 시작한다.
 *
 * 프레임 프로토콜:
 *   - 바이너리 프레임 = 터미널 raw 바이트(양방향).
 *   - 텍스트 프레임 = JSON. 송신 `{"type":"resize","cols":N,"rows":N}`,
 *     수신 `{"type":"exit","code":int,"message":"…"}`(close 직전 서버 전송 —
 *     오면 보관했다가 종료 사유로 우선 표시).
 */

/** WebSocket close 코드 → 한국어 폴백 메시지 (서버 exit 프레임이 없을 때). */
const CLOSE_MESSAGES: Record<number, string> = {
  1000: '세션이 종료되었습니다.',
  1001: '서버 점검으로 연결이 종료되었습니다. 잠시 후 다시 연결해 주세요.',
  4000: '접속 티켓이 유효하지 않거나 만료되었습니다.',
  4001: '15분 동안 입력이 없어 연결이 종료되었습니다.',
  4002: '관리자가 세션을 종료했습니다.',
  4003: 'VM이 실행 중이 아닙니다.',
  4004: '접근 권한이 변경되어 연결이 종료되었습니다.',
  4005: '웹 터미널 기능이 현재 비활성화되어 있습니다.',
  4006: '연결에 실패했습니다 (호스트 키 불일치 또는 전송 오류).',
}

const UNKNOWN_CLOSE_MESSAGE = '알 수 없는 오류로 연결이 종료되었습니다.'

/** 재연결 버튼을 숨기는 종료 코드 — 관리자 종료(4002)·기능 비활성(4005). */
const NO_RECONNECT_CODES = new Set([4002, 4005])

/** mint 실패 Problem code → 한국어 메시지 (없으면 서버 detail 폴백). */
const MINT_ERROR_MESSAGES: Record<string, string> = {
  TERMINAL_DISABLED: '웹 터미널 기능이 현재 비활성화되어 있습니다.',
  TERMINAL_SESSION_LIMIT:
    '동시 터미널 세션 상한을 초과했습니다. 사용 중인 세션을 닫은 뒤 다시 시도해 주세요.',
  RATE_LIMITED: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
  VM_INVALID_STATE: 'VM이 실행 중이 아닙니다.',
  ACCESS_DENIED: '관리자가 이 VM의 원격 접속을 차단했습니다. 관리자에게 문의하세요.',
  WORKSPACE_ROLE_INSUFFICIENT: '웹 터미널은 워크스페이스 참여자(MEMBER) 이상만 사용할 수 있습니다.',
}

const MINT_FALLBACK_MESSAGE = '터미널 접속 티켓을 발급하지 못했습니다.'

export type TerminalPhase =
  | { status: 'connecting' }
  | { status: 'open' }
  | { status: 'closed'; code: number; message: string; canReconnect: boolean }

interface ExitFrame {
  code: number
  message: string
}

export interface TerminalConnection {
  phase: TerminalPhase
  /** 사용자 입력(문자열) → UTF-8 바이너리 프레임 송신. */
  sendInput: (data: string) => void
  /** resize 텍스트 프레임 송신. */
  sendResize: (cols: number, rows: number) => void
  /** mint부터 다시 시작. */
  reconnect: () => void
}

/** http→ws, https→wss. 운영은 wss(nginx TLS 종단), dev는 ws. */
function wsUrl(wsPath: string): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}${wsPath}`
}

function isExitFrame(value: unknown): value is ExitFrame {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'exit' &&
    typeof (value as { code?: unknown }).code === 'number'
  )
}

/**
 * @param vmId  접속 대상 VM
 * @param onData  수신 바이너리 프레임(터미널 출력) 콜백 — term.write에 연결한다.
 * @param onOpen  WS open 콜백(선택) — 포커스·초기 fit 등.
 */
export function useTerminalSocket(
  vmId: number,
  onData: (bytes: Uint8Array) => void,
  onOpen?: () => void,
): TerminalConnection {
  const [phase, setPhase] = useState<TerminalPhase>({ status: 'connecting' })
  const [nonce, setNonce] = useState(0)

  // 콜백은 ref에 담아 연결 effect의 의존성에서 제외한다(재연결 churn 방지).
  const onDataRef = useRef(onData)
  const onOpenRef = useRef(onOpen)
  onDataRef.current = onData
  onOpenRef.current = onOpen

  const wsRef = useRef<WebSocket | null>(null)

  const reconnect = useCallback(() => {
    setPhase({ status: 'connecting' })
    setNonce((n) => n + 1)
  }, [])

  const sendInput = useCallback((data: string) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(new TextEncoder().encode(data))
    }
  }, [])

  const sendResize = useCallback((cols: number, rows: number) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }))
    }
  }, [])

  useEffect(() => {
    // 언마운트/재연결 시 이전 연결의 콜백을 무력화하는 가드.
    let disposed = false
    let ws: WebSocket | null = null
    // 서버가 close 직전 보낸 exit 프레임을 보관했다가 종료 사유로 우선 표시한다.
    let pendingExit: ExitFrame | null = null

    async function connect() {
      let ticket
      try {
        ticket = await createTerminalSession(vmId)
      } catch (err) {
        if (disposed) return
        const apiError = toApiError(err, MINT_FALLBACK_MESSAGE)
        const message =
          (apiError.code && MINT_ERROR_MESSAGES[apiError.code]) || apiError.message
        // mint 실패는 재연결 가능한 종료로 표현한다(코드 0 = WS 미개통).
        setPhase({ status: 'closed', code: 0, message, canReconnect: true })
        return
      }
      if (disposed) return

      ws = new WebSocket(wsUrl(ticket.wsPath), [
        ticket.subprotocol,
        `ticket.${ticket.ticket}`,
      ])
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        if (disposed) return
        setPhase({ status: 'open' })
        onOpenRef.current?.()
      }

      ws.onmessage = (event: MessageEvent) => {
        if (disposed) return
        if (typeof event.data === 'string') {
          try {
            const frame: unknown = JSON.parse(event.data)
            if (isExitFrame(frame)) {
              pendingExit = { code: frame.code, message: frame.message }
            }
          } catch {
            // 프로토콜 외 텍스트는 무시한다(내용 로그 금지).
          }
          return
        }
        // binaryType='arraybuffer'이므로 나머지는 ArrayBuffer(=raw 터미널 바이트).
        onDataRef.current(new Uint8Array(event.data as ArrayBuffer))
      }

      ws.onclose = (event: CloseEvent) => {
        if (disposed) return
        const code = pendingExit?.code ?? event.code
        const message =
          pendingExit?.message ?? CLOSE_MESSAGES[code] ?? UNKNOWN_CLOSE_MESSAGE
        setPhase({
          status: 'closed',
          code,
          message,
          canReconnect: !NO_RECONNECT_CODES.has(code),
        })
      }
      // onerror는 항상 뒤이어 onclose가 오므로 별도 처리하지 않는다.
    }

    void connect()

    return () => {
      disposed = true
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onclose = null
        ws.onerror = null
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000)
        }
      }
      if (wsRef.current === ws) wsRef.current = null
    }
  }, [vmId, nonce])

  return { phase, sendInput, sendResize, reconnect }
}
