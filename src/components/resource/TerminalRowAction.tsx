import type { ResourceSummary } from '../../api/queries'
import { useOpenTerminalWindow } from '../../terminal/useOpenTerminalWindow'

/**
 * 목록 행의 웹 터미널 단축키.
 *
 * 링크가 아니라 버튼인 것은 터미널이 콘솔 라우트가 아니라 별도 팝업 창이기
 * 때문이다 — 이동할 주소가 있는 것이 아니라 창을 여는 조작이다.
 */
export function TerminalRowAction({ resource }: { resource: ResourceSummary }) {
  const openTerminal = useOpenTerminalWindow()
  return (
    <button
      type="button"
      onClick={() =>
        openTerminal({
          vmId: resource.id,
          label: resource.displayName || resource.name,
          name: resource.name,
        })
      }
      className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
    >
      웹 터미널
    </button>
  )
}
