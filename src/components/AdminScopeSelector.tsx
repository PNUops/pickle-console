import { Building24Regular } from '@fluentui/react-icons'
import { USER_ROLE_LABELS } from '../lib/labels'
import { useAdminScope } from '../lib/use-admin-scope'
import { Select } from './ui'

/**
 * 관리자 전체 화면의 기관 context picker. native select를 사용해 keyboard, touch,
 * platform zoom 동작을 그대로 얻고, 한 줄 고정 폭을 두지 않아 400%에서도 접힌다.
 */
export function AdminScopeSelector() {
  const scope = useAdminScope()
  const value = scope.activeOrgId ?? ''

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground-muted">
        <Building24Regular aria-hidden="true" className="size-4 shrink-0" />
        관리 범위
      </div>
      <Select
        aria-label="관리 기관 선택"
        className="min-w-0 max-w-full"
        value={value}
        disabled={scope.resolving || scope.options.length === 0}
        onChange={(event) => scope.setActiveOrgId(event.target.value || undefined)}
      >
        {scope.tier === 'system' && <option value="">전체 플랫폼</option>}
        {scope.tier === 'org' && scope.requiresSelection && (
          <option value="" disabled>
            {scope.options.length === 0 ? '관리 기관이 없습니다' : '기관을 선택하세요'}
          </option>
        )}
        {scope.options.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
            {org.role ? ` · ${USER_ROLE_LABELS[org.role]}` : ''}
          </option>
        ))}
      </Select>
      {scope.error && (
        <div role="alert" className="space-y-1 text-xs text-danger-700">
          <p>기관 목록을 불러오지 못했습니다.</p>
          <button
            type="button"
            onClick={scope.retry}
            className="cursor-pointer font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-focus-ring"
          >
            기관 목록 다시 시도
          </button>
        </div>
      )}
    </div>
  )
}
