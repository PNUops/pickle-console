import { useCallback, useEffect, useRef, useState } from 'react'
import type { TerminalSessionTicket } from '../api/queries'
import {
  TERMINAL_MESSAGE_VERSION,
  WINDOW_SOURCE,
  isConsoleMessage,
  ticketErrorToApiError,
} from './terminalWindowMessages'

/** 콘솔 탭이 티켓을 돌려줄 때까지 기다리는 시간. */
const TICKET_TIMEOUT_MS = 8000

const DETACHED_MESSAGE =
  '콘솔 탭과 연결되어 있지 않아 접속 티켓을 받을 수 없습니다. 콘솔에서 다시 열어 주세요.'
const TIMEOUT_MESSAGE = '콘솔 탭이 응답하지 않아 접속 티켓을 받지 못했습니다.'

export interface OpenerTicketSource {
  /** 티켓을 받아올 수 있는 콘솔 탭이 살아 있는가. */
  attached: boolean
  /** 콘솔에서 로그아웃되어 세션이 끝났는가. */
  shutdown: boolean
  /** 콘솔 탭이 알려준 표시 이름 — 팝업은 API를 부르지 않는다. */
  vm: { label: string; name: string } | null
  /** 소켓 훅에 넘길 mint 함수. */
  requestTicket: () => Promise<TerminalSessionTicket>
}

interface Pending {
  resolve: (ticket: TerminalSessionTicket) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * 터미널 팝업이 콘솔 탭(window.opener)에서 1회용 접속 티켓을 받아 오는 핸드셰이크.
 *
 * 팝업은 액세스 토큰이 없고 인증 스택도 마운트하지 않으므로 스스로 mint할 수
 * 없다. opener가 없는 창(주소 직접 입력·북마크·콘솔 탭이 닫힌 뒤)은 폴백으로
 * 인증을 부트스트랩하지 **않는다** — 그러면 리프레시 회전 레이스를 도로 불러들인다.
 */
export function useOpenerTicket(vmId: string): OpenerTicketSource {
  // opener는 문서가 아니라 브라우징 컨텍스트의 속성이라 같은 오리진 새로고침에도
  // 유지된다 — F5는 여기서 detached가 아니라 재핸드셰이크가 된다.
  const openerRef = useRef<Window | null>(typeof window === 'undefined' ? null : window.opener)
  const [attached, setAttached] = useState(() => isAlive(openerRef.current))
  const [shutdown, setShutdown] = useState(false)
  const [vm, setVm] = useState<{ label: string; name: string } | null>(null)

  const pendingRef = useRef(new Map<string, Pending>())
  const seqRef = useRef(0)

  useEffect(() => {
    const pending = pendingRef.current

    function handle(event: MessageEvent) {
      // ① 오리진 ② 보낸 창이 우리 opener인가 ③ 형태.
      if (event.origin !== window.location.origin) return
      if (event.source !== openerRef.current) return
      if (!isConsoleMessage(event.data)) return
      const message = event.data

      if (message.type === 'shutdown') {
        setShutdown(true)
        for (const [id, entry] of pending) {
          clearTimeout(entry.timer)
          entry.reject(new Error(DETACHED_MESSAGE))
          pending.delete(id)
        }
        return
      }

      const entry = pending.get(message.requestId)
      if (!entry) return // 만료됐거나 우리가 보낸 적 없는 응답.
      clearTimeout(entry.timer)
      pending.delete(message.requestId)

      if (message.type === 'ticket') {
        setVm({ label: message.vmLabel, name: message.vmName })
        entry.resolve(message.ticket)
      } else {
        entry.reject(ticketErrorToApiError(message.code, message.message))
      }
    }

    window.addEventListener('message', handle)
    return () => {
      window.removeEventListener('message', handle)
      for (const [id, entry] of pending) {
        clearTimeout(entry.timer)
        pending.delete(id)
      }
    }
  }, [])

  const requestTicket = useCallback((): Promise<TerminalSessionTicket> => {
    const opener = openerRef.current
    if (!isAlive(opener)) {
      setAttached(false)
      return Promise.reject(new Error(DETACHED_MESSAGE))
    }
    setAttached(true)

    seqRef.current += 1
    // 문서 안에서만 유일하면 충분하다 — 상대는 우리 opener 하나뿐이다.
    const requestId = `req-${seqRef.current}`

    return new Promise<TerminalSessionTicket>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRef.current.delete(requestId)
        reject(new Error(TIMEOUT_MESSAGE))
      }, TICKET_TIMEOUT_MS)
      pendingRef.current.set(requestId, { resolve, reject, timer })

      opener.postMessage(
        {
          source: WINDOW_SOURCE,
          v: TERMINAL_MESSAGE_VERSION,
          type: 'ticket-request',
          vmId,
          requestId,
        },
        window.location.origin,
      )
    })
  }, [vmId])

  return { attached, shutdown, vm, requestTicket }
}

function isAlive(win: Window | null): win is Window {
  try {
    return win != null && !win.closed
  } catch {
    // 창 접근이 막힌 경우(닫힌 뒤 등)는 없는 것으로 본다.
    return false
  }
}
