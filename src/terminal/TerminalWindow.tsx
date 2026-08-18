import { useCallback, useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useOpenerTicket } from './useOpenerTicket'
import { useTerminalSocket, type TerminalPhase } from './useTerminalSocket'

/** resize 프레임 송신 디바운스 (ms). */
const RESIZE_DEBOUNCE_MS = 150

/**
 * 웹 터미널 팝업 창 — `/terminal/:vmId`.
 *
 * 콘솔 SPA의 라우트가 아니라 `main.tsx`가 주소를 보고 가르는 **별도 문서**다.
 * AuthProvider·QueryClient·ReauthProvider 중 무엇도 마운트하지 않으므로 이 창은
 * HTTP 요청을 한 건도 하지 않는다 — 접속 티켓도 VM 이름도 콘솔 탭이 postMessage로
 * 건네준다. 이유는 리프레시 토큰이 회전+재사용 탐지 방식이라, 팝업이 스스로
 * `/auth/refresh`를 치면 부모 탭과의 레이스에서 체인 전체가 폐기되어 모든 탭이
 * 로그아웃되기 때문이다.
 *
 * xterm 하드닝은 콘솔 안에 있던 시절 그대로다: 제안 API·투명도·창 조작
 * (windowOptions) 전부 비활성, OSC 8 하이퍼링크 무력화(linkHandler.activate no-op).
 * OSC 52 클립보드 쓰기는 xterm 코어가 구현하지 않으므로 별도 옵션 없이 비활성이다.
 */
export function TerminalWindow({ vmId }: { vmId: string }) {
  const opener = useOpenerTicket(vmId)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  const handleData = useCallback((bytes: Uint8Array) => {
    termRef.current?.write(bytes)
  }, [])

  const { phase, sendInput, sendResize, reconnect } = useTerminalSocket(
    vmId,
    handleData,
    opener.requestTicket,
    { enabled: opener.attached && !opener.shutdown },
  )

  const handleInput = useCallback((data: string) => sendInput(data), [sendInput])

  // xterm 생성 (마운트 1회).
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      allowProposedApi: false,
      allowTransparency: false,
      windowOptions: {}, // 모든 창 조작(OSC 창 이동·리사이즈·타이틀) 비활성
      linkHandler: { activate: () => {}, allowNonHttpProtocols: false },
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      theme: { background: '#0a0a0a', foreground: '#e5e5e5' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()
    const dataSub = term.onData(handleInput)

    termRef.current = term
    fitRef.current = fit

    return () => {
      dataSub.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [handleInput])

  // 창/컨테이너 크기 변화 → fit → 디바운스된 resize 프레임 송신.
  // 창 크기 조절이 이 화면의 주된 조작이므로 window 'resize'도 함께 듣는다
  // (ResizeObserver 하나로도 실 브라우저에서는 충분하지만, 타이머를 공유하므로
  // 두 경로가 같이 발화해도 프레임은 한 번만 나간다).
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const refit = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        fitRef.current?.fit()
        const term = termRef.current
        if (term) sendResize(term.cols, term.rows)
      }, RESIZE_DEBOUNCE_MS)
    }
    const observer = new ResizeObserver(refit)
    observer.observe(container)
    window.addEventListener('resize', refit)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
      window.removeEventListener('resize', refit)
    }
  }, [sendResize])

  // 연결 성립 시 fit·포커스·초기 크기 통지.
  useEffect(() => {
    if (phase.status !== 'open') return
    fitRef.current?.fit()
    const term = termRef.current
    term?.focus()
    if (term) sendResize(term.cols, term.rows)
  }, [phase.status, sendResize])

  // 창을 다시 클릭했을 때 커서가 살아 있도록.
  useEffect(() => {
    const focus = () => termRef.current?.focus()
    window.addEventListener('focus', focus)
    return () => window.removeEventListener('focus', focus)
  }, [])

  const label = opener.vm?.label ?? 'VM'

  useEffect(() => {
    document.title = `터미널 · ${label}`
  }, [label])

  if (opener.shutdown) {
    return (
      <WindowNotice
        title="세션이 종료되었습니다"
        body="콘솔에서 로그아웃되어 터미널 연결이 끊어졌습니다. 다시 로그인한 뒤 콘솔에서 열어 주세요."
      />
    )
  }

  if (!opener.attached) {
    return (
      <WindowNotice
        title="콘솔에서 열어 주세요"
        body="이 터미널 창은 콘솔의 '웹 터미널 열기'로 열어야 합니다. 주소를 직접 입력했거나 콘솔 탭이 닫혀 접속 티켓을 받을 수 없습니다."
      />
    )
  }

  return (
    <div className="flex h-svh w-full flex-col bg-[#0a0a0a]">
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-neutral-800 px-3 text-xs">
        <span className="truncate font-medium text-neutral-100">{label}</span>
        {opener.vm && opener.vm.name !== label && (
          <span className="truncate text-neutral-500">{opener.vm.name}</span>
        )}
        {/* 재연결 버튼은 종료 오버레이에만 둔다 — 헤더에도 두면 같은 이름의
            버튼이 둘이 되어 어느 쪽을 눌러야 하는지가 모호해진다. */}
        <ConnectionPill phase={phase} />
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="h-full w-full p-2" aria-label="터미널 화면" />

        {phase.status === 'closed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 px-6 text-center">
            <p className="max-w-md text-sm text-neutral-100">{phase.message}</p>
            {phase.canReconnect && (
              <button
                type="button"
                onClick={reconnect}
                className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white"
              >
                다시 연결
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ConnectionPill({ phase }: { phase: TerminalPhase }) {
  const [text, tone] =
    phase.status === 'open'
      ? (['연결됨', 'text-success-400'] as const)
      : phase.status === 'connecting'
        ? (['연결 중', 'text-neutral-400'] as const)
        : (['연결 끊김', 'text-danger-400'] as const)
  return <span className={tone}>{text}</span>
}

/** 터미널을 띄울 수 없는 창의 전체 화면 안내 — 콘솔로 가는 링크는 두지 않는다. */
function WindowNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-svh w-full flex-col items-center justify-center gap-4 bg-[#0a0a0a] px-8 text-center">
      <h1 className="text-base font-semibold text-neutral-100">{title}</h1>
      <p className="max-w-md text-sm leading-relaxed text-neutral-400">{body}</p>
      <button
        type="button"
        onClick={() => window.close()}
        className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
      >
        창 닫기
      </button>
    </div>
  )
}
