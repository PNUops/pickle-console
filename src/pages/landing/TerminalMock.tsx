import { useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'

const COMMAND = 'ssh my-vm@ssh.pickle.pnuops.com'

/**
 * SSH 접속을 그대로 보여 주는 터미널 목업 — 화면에 들어오면 명령을 타이핑한다.
 * reduced-motion이면 타이핑 없이 완성된 화면을 즉시 렌더한다.
 */
export function TerminalMock() {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-96px' })
  const [typedLength, setTypedLength] = useState(reduced ? COMMAND.length : 0)
  const [done, setDone] = useState(Boolean(reduced))

  useEffect(() => {
    if (reduced || !inView || done) return
    let doneTimer: ReturnType<typeof setTimeout> | undefined
    const typeTimer = setInterval(() => {
      setTypedLength((current) => {
        if (current >= COMMAND.length) {
          clearInterval(typeTimer)
          doneTimer = setTimeout(() => setDone(true), 420)
          return current
        }
        return current + 1
      })
    }, 52)
    return () => {
      clearInterval(typeTimer)
      if (doneTimer) clearTimeout(doneTimer)
    }
  }, [inView, reduced, done])

  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 shadow-overlay"
    >
      {/* 타이틀 바 */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span aria-hidden="true" className="size-3 rounded-full bg-danger-400/80" />
        <span aria-hidden="true" className="size-3 rounded-full bg-warning-400/80" />
        <span aria-hidden="true" className="size-3 rounded-full bg-success-400/80" />
        <span className="ml-2 font-mono text-xs text-neutral-500">ssh — 피클 게이트웨이</span>
      </div>
      {/* 세션 */}
      <div className="min-h-44 p-5 font-mono text-[13px] leading-7 text-neutral-300">
        <p>
          <span className="text-primary-400">$</span> {COMMAND.slice(0, typedLength)}
          {!done && (
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 animate-blink bg-primary-400"
            />
          )}
        </p>
        <div className={cn('transition-opacity duration-500', done ? 'opacity-100' : 'opacity-0')}>
          <p className="text-neutral-500">Welcome to Ubuntu 24.04 LTS (GNU/Linux x86_64)</p>
          <p className="text-neutral-500">
            내부 IP <span className="text-neutral-400">172.29.x.x</span> · 세션은 내 이름으로
            기록됩니다
          </p>
          <p>
            <span className="text-success-400">student@my-vm</span>
            <span className="text-neutral-500">:~$</span>
            {done && (
              <span
                aria-hidden="true"
                className="ml-1.5 inline-block h-4 w-2 translate-y-0.5 animate-blink bg-neutral-400"
              />
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
