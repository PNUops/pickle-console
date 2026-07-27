import type { ReactNode } from 'react'

/**
 * 권한이 없어 비활성화된 액션 옆에 사유를 밝히는 안내 문구. 액션 자체를
 * 숨기면 기능의 존재를 알 수 없으므로, 보이되 비활성 + 이 문구가 관례다.
 */
export function PermissionNotice({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="text-sm text-neutral-400">
      {children}
    </p>
  )
}
