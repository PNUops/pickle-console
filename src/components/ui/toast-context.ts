import { createContext, useContext } from 'react'

export interface ToastApi {
  /** 화면 전환이 없는 작업의 성공 확인용 토스트. */
  success: (message: string) => void
  /** 인라인 표시가 마땅치 않은 실패 알림용 토스트. */
  error: (message: string) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast는 ToastProvider 안에서만 사용할 수 있습니다.')
  return api
}
