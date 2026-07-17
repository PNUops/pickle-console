import { useEffect, useState } from 'react'

/**
 * 빠르게 바뀌는 값(자유 텍스트 필터 등)의 지연 반영본을 돌려준다.
 * 입력 UI에는 원본 값을 그대로 바인딩해 즉시 에코하고, 쿼리 키에는 이 훅의
 * 반환값을 써서 타이핑이 멎은 뒤에만 요청이 나가게 한다.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
