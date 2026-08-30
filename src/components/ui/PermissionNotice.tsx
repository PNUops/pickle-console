import type { ReactNode } from 'react'

/**
 * 사용자 콘솔에서 권한 부족의 이유를 설명하는 안내 문구. 같은 워크스페이스
 * 안에서 더 높은 리소스 등급을 받을 수 있는 사용자에게만 기능의 존재와 차단
 * 이유를 함께 보여 준다. 관리자 콘솔은 수행할 수 없는 액션을 렌더하지 않는다.
 */
export function PermissionNotice({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="text-sm text-neutral-400">
      {children}
    </p>
  )
}
