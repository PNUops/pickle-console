import type { ReactNode } from 'react'
import { Select } from './ui'

/**
 * 관리자 목록 화면 공통 필터 바 — 상태 탭 + 기관 선택 + 추가 필터 슬롯.
 * `tabs`가 비어 있으면 탭 영역을 렌더링하지 않는다 (추가 필터 전용 바).
 *
 * 기관 선택지는 호출부가 계정이 지정할 수 있는 기관으로 좁혀 넘긴다 — 시스템
 * 계층은 전 기관, 기관 계층은 역할을 보유한 기관만 (계약 v0.46.0: 보유하지 않은
 * 기관을 지정하면 404). 고를 것이 하나뿐이면 선택기를 보이지 않는 것이 관례라
 * `showOrgFilter`는 보통 `orgOptions.length > 1`이다.
 */
export function FilterBar<S>({
  tabs,
  status,
  onStatus,
  showOrgFilter,
  orgId,
  onOrg,
  orgs,
  children,
}: {
  tabs: { label: string; status: S | undefined }[]
  status: S | undefined
  onStatus: (status: S | undefined) => void
  showOrgFilter: boolean
  orgId: string | undefined
  onOrg: (orgId: string | undefined) => void
  orgs: { id: string; name: string }[]
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {tabs.length > 0 && (
        // 탭처럼 보이지만 목록 필터 토글 버튼이다 — ARIA tabs 패턴(로빙
        // 탭인덱스·화살표 이동·tabpanel)을 구현하지 않으므로 tab 롤을 쓰지
        // 않는다. 진짜 탭은 ui/Tabs 컴포넌트를 쓴다.
        <div role="group" aria-label="상태 필터" className="flex flex-wrap gap-1">
          {tabs.map((tab) => {
            const selected = tab.status === status
            return (
              <button
                key={tab.label}
                type="button"
                aria-pressed={selected}
                onClick={() => onStatus(tab.status)}
                className={
                  'cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary-600 ' +
                  (selected
                    ? 'bg-primary-600 text-white'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900')
                }
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {children}
        {showOrgFilter && (
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            기관
            <Select
              aria-label="기관 필터"
              className="w-56"
              value={orgId ?? ''}
              // DOM 값은 언제나 문자열이고 기관 id도 이제 문자열이다 — 빈
              // 문자열("전체 기관")만 없음으로 접는다.
              onChange={(event) => onOrg(event.target.value || undefined)}
            >
              <option value="">전체 기관</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          </label>
        )}
      </div>
    </div>
  )
}
