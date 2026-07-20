import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

/**
 * 스크롤 진입 시 페이드+슬라이드로 나타나는 래퍼(랜딩 전용).
 * prefers-reduced-motion이면 애니메이션 없이 즉시 렌더한다.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  if (reduced) {
    return <div className={className}>{children}</div>
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-64px' }}
      transition={{ duration: 0.6, ease: 'easeOut', delay }}
    >
      {children}
    </motion.div>
  )
}
