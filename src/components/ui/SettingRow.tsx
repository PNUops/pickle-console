import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface SettingRowProps {
  /** 왼쪽에 굵게 놓이는 항목 이름. */
  label: string
  /** 이름 아래 한 줄. 지금 값이거나, 값이 없으면 그 사실. */
  description?: ReactNode
  /** 오른쪽 동작. 보통 `<Button size="sm">`. */
  action?: ReactNode
  /** 값 아래 한 줄 더. 왜 못 하는지 같은 사유를 적는다. */
  note?: ReactNode
  className?: string
}

/**
 * 레이블과 현재 값과 동작 버튼 한 줄.
 *
 * <p>폼을 카드 안에 펼쳐 두면 자주 쓰지 않는 것이 첫 화면을 차지하고 그 아래가
 * 안 보인다. 계정 화면은 비밀번호 입력 칸 셋으로 시작해서 2단계 인증과 회원
 * 탈퇴가 접힘선 밖에 있었다. 값은 한 줄로 보이고 고치는 일은 모달이 맡는다.
 *
 * <p>`VmDetailPage` 의 VM 설정 목록과 관리자 설정 표가 이미 이 모양이다.
 * 여기 있는 것은 그 껍데기이고, 세 번째 방언을 만들지 않기 위한 것이다.
 */
export function SettingRow({ label, description, action, note, className }: SettingRowProps) {
  return (
    <div className={cn('space-y-2 py-4 first:pt-0 last:pb-0', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground-primary">{label}</p>
          {description && <p className="mt-0.5 text-sm text-foreground-muted">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {note && <p className="text-xs text-foreground-muted">{note}</p>}
    </div>
  )
}
