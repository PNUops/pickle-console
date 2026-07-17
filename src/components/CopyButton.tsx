import { useEffect, useRef, useState } from 'react'
import { Button } from './ui'

export interface CopyButtonProps {
  value: string
  label: string
  size?: 'sm' | 'md'
}

/** 값을 클립보드로 복사하고 잠깐 "복사됨"을 표시한다 (권한 없으면 조용히 무시). */
export function CopyButton({ value, label, size = 'sm' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 언마운트 후 setState가 호출되지 않게 대기 중인 타이머를 정리한다.
  useEffect(
    () => () => {
      if (timerRef.current != null) clearTimeout(timerRef.current)
    },
    [],
  )

  return (
    <Button
      variant="secondary"
      size={size}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          if (timerRef.current != null) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => setCopied(false), 2000)
        } catch {
          // 클립보드 권한이 없으면 값은 화면에 그대로 보이므로 무시한다.
        }
      }}
    >
      {copied ? '복사됨' : label}
    </Button>
  )
}
