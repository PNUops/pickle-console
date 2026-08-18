import { useCallback } from 'react'
import { useToast } from '../components/ui'
import { openTerminalWindow, type TerminalWindowTarget } from './openTerminalWindow'

const POPUP_BLOCKED_MESSAGE =
  '브라우저가 팝업을 차단해 터미널 창을 열지 못했습니다. 이 사이트의 팝업 차단을 해제한 뒤 다시 시도해 주세요.'

/** 터미널 창 열기 + 팝업 차단 안내 — 여는 곳 둘이 같은 문구를 쓰게 묶는다. */
export function useOpenTerminalWindow(): (target: TerminalWindowTarget) => void {
  const toast = useToast()
  return useCallback(
    (target: TerminalWindowTarget) => {
      if (!openTerminalWindow(target)) toast.error(POPUP_BLOCKED_MESSAGE)
    },
    [toast],
  )
}
