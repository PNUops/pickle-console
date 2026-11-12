import { useCallback } from 'react'
import { useToast } from '../components/ui'
import { openTerminalWindow, type TerminalWindowTarget } from './openTerminalWindow'

const POPUP_BLOCKED_MESSAGE =
  '터미널 창을 열지 못했어요. 이 사이트의 팝업을 허용한 뒤 다시 열어 주세요.'

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
