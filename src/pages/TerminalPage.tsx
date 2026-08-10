import { useCallback, useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { fetchVm } from '../api/queries'
import { Alert, Button, Spinner } from '../components/ui'
import { useTerminalSocket } from '../terminal/useTerminalSocket'
import { isUuid } from '../lib/validation'

/** resize 프레임 송신 디바운스 (ms). */
const RESIZE_DEBOUNCE_MS = 150

/**
 * 웹 터미널 페이지 — `/console/vms/:vmId/terminal`.
 *
 * xterm.js + FitAddon으로 브리지(LXC 102)와 raw 바이트를 주고받는다.
 * 하드닝: 제안 API·투명도·창 조작(windowOptions) 전부 비활성, OSC 8 하이퍼링크
 * 무력화(linkHandler.activate no-op). OSC 52 클립보드 쓰기는 xterm 코어가
 * 구현하지 않으므로(애드온 미탑재) 별도 옵션 없이 비활성이다.
 */
export function TerminalPage() {
  const params = useParams()
  const vmId = params.vmId ?? ''

  const vm = useQuery({
    queryKey: ['vms', vmId],
    queryFn: () => fetchVm(vmId),
    // 형식부터 틀린 주소는 서버에 물어볼 것이 없다 — 소켓 훅이 사유를 표시한다.
    enabled: isUuid(vmId),
  })

  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  // 수신 바이너리 프레임 → 터미널 출력. 안정 콜백(ref로 term 접근).
  const handleData = useCallback((bytes: Uint8Array) => {
    termRef.current?.write(bytes)
  }, [])

  const { phase, sendInput, sendResize, reconnect } = useTerminalSocket(vmId, handleData)

  // 안정 콜백: xterm onData → 사용자 입력 송신.
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

  // 컨테이너 크기 변화 → fit → 디바운스된 resize 프레임 송신.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        fitRef.current?.fit()
        const term = termRef.current
        if (term) sendResize(term.cols, term.rows)
      }, RESIZE_DEBOUNCE_MS)
    })
    observer.observe(container)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
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

  // 이름을 아직(또는 끝내) 모를 때의 폴백. 식별자는 UUID라 제목에 넣어도
  // 읽는 사람에게 알려주는 것이 없으므로 종류만 밝힌다.
  const title = vm.data ? vm.data.displayName || vm.data.name : 'VM'

  return (
    <div className="space-y-4">
      <nav className="text-sm">
        <Link to={`/console/vms/${vmId}`} className="text-primary-700 hover:underline">
          ← {vm.data?.name ?? 'VM 상세'}
        </Link>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">웹 터미널 · {title}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            브라우저에서 직접 VM 셸에 접속합니다. 15분 동안 입력이 없으면 자동으로
            연결이 종료됩니다.
          </p>
        </div>
      </div>

      {vm.isError && <Alert variant="danger">{vm.error.message}</Alert>}

      <div className="relative overflow-hidden rounded-lg border border-neutral-800 bg-[#0a0a0a]">
        {/* xterm 렌더 영역 — 화면 높이에 맞춰 넓게 잡는다. */}
        <div ref={containerRef} className="h-[70vh] w-full p-2" aria-label="터미널 화면" />

        {phase.status === 'connecting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Spinner label="터미널에 연결하는 중" />
          </div>
        )}

        {phase.status === 'closed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 px-6 text-center">
            <p className="max-w-md text-sm text-neutral-100">{phase.message}</p>
            {phase.canReconnect && (
              <Button onClick={reconnect}>다시 연결</Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
