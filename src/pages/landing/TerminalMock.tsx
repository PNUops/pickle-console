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

  const typingDone = typedLength >= COMMAND.length

  // 타이핑 진행 — updater는 순수하게 길이만 늘리고, 타이머 정리는 effect가 맡는다.
  useEffect(() => {
    if (reduced || !inView || typingDone) return
    const typeTimer = setInterval(
      () => setTypedLength((current) => Math.min(current + 1, COMMAND.length)),
      52,
    )
    return () => clearInterval(typeTimer)
  }, [inView, reduced, typingDone])

  // 타이핑 완료 후 잠깐 쉬었다가 출력 라인을 페이드 인.
  useEffect(() => {
    if (done || !typingDone) return
    const doneTimer = setTimeout(() => setDone(true), 420)
    return () => clearTimeout(doneTimer)
  }, [done, typingDone])

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
        <span className="ml-2 font-mono text-xs text-neutral-400">ssh — 피클 게이트웨이</span>
      </div>
      {/* 세션 */}
      <div className="min-h-44 p-5 font-mono text-[13px] leading-7 text-neutral-300">
        <p>
          <span className="text-primary-400">$</span> {COMMAND.slice(0, typedLength)}
          {!done && (
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 animate-blink bg-primary-400 motion-reduce:animate-none"
            />
          )}
        </p>
        <div className={cn('transition-opacity duration-500', done ? 'opacity-100' : 'opacity-0')}>
          <p className="text-neutral-400">Welcome to Ubuntu 24.04 LTS (GNU/Linux x86_64)</p>
          <p className="text-neutral-400">
            내부 IP <span className="text-neutral-300">172.29.x.x</span> · 세션은 내 이름으로
            기록됩니다
          </p>
          <p>
            <span className="text-success-400">student@my-vm</span>
            <span className="text-neutral-400">:~$</span>
            {done && (
              <span
                aria-hidden="true"
                className="ml-1.5 inline-block h-4 w-2 translate-y-0.5 animate-blink bg-neutral-400 motion-reduce:animate-none"
              />
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
