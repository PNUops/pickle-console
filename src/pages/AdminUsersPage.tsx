import { AccessIncreaseDetails } from '../components/resource/AccessIncreaseReview'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  disableUser,
  enableUser,
  fetchAdminUser,
  fetchAdminUsers,
  fetchProfileOptions,
  resetUserMfa,
  updateUserProfile,
  updateUserRole,
  type AdminGlobalRole,
  type AdminUserSort,
  type UserAdminDetail,
  type UserAdminView,
  type UserRole,
  type UserStatus,
} from '../api/queries'
import { requestReaderKey } from '../api/request-review'
import { toApiError } from '../api/problem'
import { previewUserProfileImpact, type ProfileImpact, type AdminProfileUpdate } from '../api/admin-user-support'
import { ProfileImpactView, UserChangeOutcome } from '../components/UserSupport'
import { OTHER_DEPARTMENT } from '../components/profile/profile-values'
import type { components } from '../api/schema'
import { useAuth } from '../auth/auth-context'
import { isSysAdminOnly, isSysTier } from '../auth/permissions'
import { hasWork, workSources, SYS_ADMIN, SYS_READERS } from '../auth/institution-authority'
import {
  Checkbox,
  Alert,
  Badge,
  Button,
  Card,
  Drawer,
  FormField,
  Input,
  Modal,
  Pagination,
  Select,
  Spinner,
  DataTable,
  TBody,
  TD,
  Textarea,
  TH,
  THead,
  TR,
  SortableTH,
  useToast,
  type BadgeVariant,
} from '../components/ui'
import { FilterBar } from '../components/FilterBar'
import { cn } from '../lib/cn'
import { fieldErrorsOf } from '../lib/field-errors'
import { formatDateTime } from '../lib/format'
import { labelForWorkspaceKind, USER_ROLE_LABELS, USER_STATUS_LABELS } from '../lib/labels'
import { useDebouncedValue } from '../lib/use-debounced-value'
import { useAdminScope } from '../lib/use-admin-scope'
import { adminPaths } from '../lib/paths'
import { useListUrl } from '../lib/use-list-url'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'
import { userListParams, userListState } from '../lib/user-list'
import { withListReturn } from '../lib/list-url'
import { useActiveResult } from '../lib/use-active-result'

type SortKey = 'name' | 'email' | 'createdAt'

const PAGE_SIZE = 10

const STATUS_TABS: { label: string; status: UserStatus | undefined }[] = [
  { label: '전체', status: undefined },
  { label: USER_STATUS_LABELS.ACTIVE, status: 'ACTIVE' },
  { label: USER_STATUS_LABELS.PENDING_VERIFICATION, status: 'PENDING_VERIFICATION' },
  { label: USER_STATUS_LABELS.DISABLED, status: 'DISABLED' },
  { label: USER_STATUS_LABELS.WITHDRAWN, status: 'WITHDRAWN' },
]

const ROLE_OPTIONS: UserRole[] = [
  'USER',
  'ORG_VIEWER',
  'ORG_MANAGER',
  'ORG_ADMIN',
  'SYS_VIEWER',
  'SYS_MANAGER',
  'SYS_ADMIN',
]

const GLOBAL_ROLE_OPTIONS: AdminGlobalRole[] = ['USER', 'SYS_VIEWER', 'SYS_MANAGER', 'SYS_ADMIN']

const STATUS_VARIANT: Record<UserStatus, BadgeVariant> = {
  ACTIVE: 'success',
  PENDING_VERIFICATION: 'warning',
  DISABLED: 'danger',
  WITHDRAWN: 'neutral',
}

function UserStatusBadge({ status }: { status: UserStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{USER_STATUS_LABELS[status]}</Badge>
}

/** Would the VM list have anything to show for this workspace under this scope? */
function vmsReachable(vmOrgIds: string[] | null | undefined, activeOrgId: string | undefined): boolean {
  return vmOrgIds != null && (activeOrgId === undefined ? vmOrgIds.length > 0 : vmOrgIds.includes(activeOrgId))
}

export function AdminUsersPage() {
  const { user } = useAuth()
  const viewerRole = user?.role
  // The one admin read the server does not narrow by organisation, because the
  // people an administrator most needs to reach are derived into none. So this
  // screen ignores the global admin scope and narrows only through its 기관
  // filter. Account disable, enable and MFA reset stay SYS_ADMIN-only.
  const isSystemTier = !!viewerRole && isSysTier(viewerRole)
  const canManageAccounts = !!viewerRole && isSysAdminOnly(viewerRole)
  const { activeOrgId, options: orgOptions } = useAdminScope()
  const location = useLocation()
  const [urlParams, changeUrl, normalize] = useListUrl()
  const state = userListState(urlParams)
  const { status, role, filterOrgId, sort, page, selectedId } = state
  const qInput = state.q
  const setStatus = (value: UserStatus | undefined) => changeUrl({ status: value, selected: undefined }, true)
  const setRole = (value: UserRole | undefined) => changeUrl({ role: value, selected: undefined }, true)
  const setFilterOrgId = (value: string | undefined) => changeUrl({ filterOrg: value, selected: undefined }, true)
  const setQInput = (value: string) => changeUrl({ q: value, selected: undefined }, true, true)
  const setSort = (value: AdminUserSort | undefined) => changeUrl({ sort: value, selected: undefined }, true)
  const setPage = (value: number) => changeUrl({ page: value })
  const setSelectedId = (id: string | null) => changeUrl({ selected: id ?? undefined })
  const searchRef = useRef<HTMLInputElement>(null)
  const close = () => {
    changeUrl({ selected: undefined }, false, true)
    requestAnimationFrame(() => {
      const trigger = selectedId && isUuid(selectedId)
        ? document.querySelector<HTMLButtonElement>(`[data-user-id="${selectedId}"]`)
        : null
      ;(trigger ?? searchRef.current)?.focus()
    })
  }
  const canonical = userListParams(state, activeOrgId).toString()
  useEffect(() => { normalize(canonical) }, [canonical, normalize])

  const debouncedQ = useDebouncedValue(qInput).trim()
  const q = debouncedQ.length > 0 ? debouncedQ : undefined

  // The server withholds system-tier accounts from the org tier, so offering
  // those roles here would only ever filter to nothing.
  const roleOptions = isSystemTier ? ROLE_OPTIONS : ROLE_OPTIONS.filter((r) => !isSysTier(r))

  const users = useQuery({
    queryKey: [
      'admin',
      'users',
      {
        status: status ?? null,
        role: role ?? null,
        orgId: filterOrgId ?? null,
        q: q ?? null,
        sort: sort ?? null,
        page,
        size: PAGE_SIZE,
        reader: requestReaderKey(user),
      },
    ],
    queryFn: () =>
      fetchAdminUsers({ status, role, orgId: filterOrgId, q, sort, page, size: PAGE_SIZE }),
  })
  useEffect(() => {
    if (!users.isSuccess) return
    const lastPage = Math.max(0, users.data.totalPages - 1)
    if (page > lastPage) normalize(userListParams({ ...state, page: lastPage }, activeOrgId).toString())
  }, [users.data, users.isSuccess, page, state, activeOrgId, normalize])

  const sortDirection = (key: SortKey) =>
    sort === key ? ('asc' as const) : sort === `-${key}` ? ('desc' as const) : null
  const onSort = (key: SortKey) => (next: 'asc' | 'desc' | null) => {
    setSort(next === null ? undefined : next === 'asc' ? key : (`-${key}` as AdminUserSort))
    setPage(0)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">사용자 관리</h1>
        <p className="mt-1 text-sm text-neutral-500">
          이 목록은 관리 범위와 무관하게 모든 기관에서 찾습니다.
        </p>
      </div>

      <FilterBar
        tabs={STATUS_TABS}
        status={status}
        onStatus={(next) => {
          setStatus(next)
          setPage(0)
        }}
        // Unlike every other list, one option here still means a choice: 전체 기관
        // against that one organisation.
        showOrgFilter={orgOptions.length > 0}
        orgId={filterOrgId}
        onOrg={(next) => {
          setFilterOrgId(next)
          setPage(0)
        }}
        orgs={orgOptions}
      >
        <Input
          ref={searchRef}
          type="search"
          maxLength={200}
          aria-label="사용자 검색"
          placeholder="이메일/이름 검색"
          className="w-52"
          value={qInput}
          onChange={(event) => {
            setQInput(event.target.value)
            setPage(0)
          }}
        />
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          역할
          <Select
            aria-label="역할 필터"
            className="w-40"
            value={role ?? ''}
            onChange={(event) => {
              setRole(event.target.value ? (event.target.value as UserRole) : undefined)
              setPage(0)
            }}
          >
            <option value="">전체 역할</option>
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {USER_ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </label>
      </FilterBar>

      {users.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="사용자 목록 불러오는 중" />
        </div>
      )}
      {users.isError && <Alert variant="danger">{users.error.message}</Alert>}
      {users.isSuccess && users.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          {status || role || filterOrgId || q
            ? '조건에 맞는 사용자가 없습니다.'
            : '표시할 사용자가 없습니다.'}
        </Card>
      )}
      {users.isSuccess && users.data.content.length > 0 && (
        <>
          <DataTable caption="관리자 사용자 목록">
              <THead>
                <TR>
                  <SortableTH direction={sortDirection('name')} onSort={onSort('name')}>
                    이름
                  </SortableTH>
                  <SortableTH direction={sortDirection('email')} onSort={onSort('email')}>
                    이메일
                  </SortableTH>
                  <TH>역할</TH>
                  <TH>상태</TH>
                  <SortableTH
                    direction={sortDirection('createdAt')}
                    onSort={onSort('createdAt')}
                  >
                    가입일
                  </SortableTH>
                </TR>
              </THead>
              <TBody>
                {users.data.content.map((row: UserAdminView) => (
                  <TR
                    key={row.id}
                    className={cn(
                      'cursor-pointer',
                      row.id === selectedId && 'bg-primary-50 hover:bg-primary-50',
                    )}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <TD>
                      <button
                        type="button"
                        data-user-id={row.id}
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelectedId(row.id)
                        }}
                        className="cursor-pointer font-medium text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-primary-600"
                      >
                        {row.name}
                      </button>
                    </TD>
                    <TD className="text-neutral-600">{row.email}</TD>
                    <TD>{USER_ROLE_LABELS[row.role]}</TD>
                    <TD>
                      <UserStatusBadge status={row.status} />
                    </TD>
                    <TD className="whitespace-nowrap">{formatDateTime(row.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
          </DataTable>
          <Pagination
            page={users.data.page}
            totalPages={users.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      <Drawer
        open={selectedId !== null}
        onClose={close}
        title="사용자 상세"
      >
        {selectedId !== null && (
          !isUuid(selectedId) ? <Alert variant="danger">{INVALID_ID_MESSAGE}</Alert>
            : <UserDetailBody key={`${selectedId}:${activeOrgId ?? 'all'}:${requestReaderKey(user)}`} userId={selectedId} canManage={canManageAccounts}
                supportPath={withListReturn(adminPaths.userSupport(selectedId, activeOrgId), `${location.pathname}${location.search}`)} />
        )}
      </Drawer>
    </div>
  )
}

/* ─── 상세 드로어 본문 (행 선택 시) ─── */

export function UserDetailBody({ userId, canManage, supportPath, children }: { userId: string; canManage: boolean; supportPath?: string; children?: ReactNode }) {
  const viewer = useAuth().user
  const [changeResult, setChangeResult] = useState<{ impact: ProfileImpact; status: UserStatus } | null>(null)
  const { activeOrgId } = useAdminScope()
  const detail = useQuery({
    queryKey: ['admin', 'users', 'detail', userId, activeOrgId ?? null, requestReaderKey(viewer)],
    queryFn: () => fetchAdminUser(userId),
  })

  if (detail.isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="사용자 상세 불러오는 중" />
      </div>
    )
  }
  if (detail.isError) {
    return <Alert variant="danger">{detail.error.message}</Alert>
  }

  const user = detail.data
  const canCorrectProfile = user.supportCapabilities?.canCorrectProfile === true && hasWork(viewer, 'student.profile.correct', {}, SYS_ADMIN)
  return (
    <div className="space-y-6 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 text-lg font-semibold text-neutral-900">{user.name}</h3>
        <UserStatusBadge status={user.status} />
      </div>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Field label="이메일" value={user.email} />
        <Field label="역할" value={USER_ROLE_LABELS[user.role]} />
        <Field label="가입일" value={formatDateTime(user.createdAt)} />
        <Field label="활성 VM 수" value={user.activeVmCount == null ? '제공되지 않음' : String(user.activeVmCount)} />
        <Field label="2단계 인증" value={user.mfaEnabled == null ? '제공되지 않음' : user.mfaEnabled ? '사용' : '미사용'} />
        {user.disabledReason && <Field label="비활성화 사유" value={user.disabledReason} />}
      </dl>

      {supportPath && <Link to={supportPath} className="inline-flex text-sm font-medium text-primary-700 hover:underline">관계와 지원 상세 열기</Link>}
      {(canCorrectProfile || canManage) && changeResult && <UserChangeOutcome key={`${changeResult.impact.observedAt}-${changeResult.impact.action}`} impact={changeResult.impact} actualStatus={changeResult.status} />}
      {children}
      <UserProfileSection user={user} canManage={canCorrectProfile} onChanged={(updated, impact) => setChangeResult({ impact, status: updated.status })} />

      {!children && <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-800">워크스페이스 멤버십</h3>
        {user.memberships == null ? <p className="text-sm text-neutral-500">워크스페이스 관계는 현재 업무로 제공되지 않습니다.</p> : user.memberships.length === 0 ? (
          <p className="text-sm text-neutral-500">소속된 워크스페이스가 없습니다.</p>
        ) : (
          <ul className="space-y-1 text-sm text-neutral-700">
            {user.memberships.map((m) => (
              <li key={m.workspaceId}>
                {m.workspaceName}{' '}
                <span className="text-neutral-400">
                  ({labelForWorkspaceKind(m.workspaceKind)} · {m.role})
                </span>{' '}
                {/*
                 * The directory spans organisations, the VM list does not, so a
                 * link that cannot resolve lands on an empty list that reads as
                 * "no virtual machines" rather than "not yours to see".
                 */}
                {vmsReachable(m.vmOrgIds, activeOrgId) && (
                  <Link
                    to={adminPaths.vms(activeOrgId, m.workspaceId)}
                    className="text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-primary-600"
                  >
                    VM 보기
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-800">상태 변경 이력</h3>
        {user.statusChanges == null ? <p className="text-sm text-neutral-500">상태 이력은 현재 업무로 제공되지 않습니다.</p> : user.statusChanges.length === 0 ? (
          <p className="text-sm text-neutral-500">변경 이력이 없습니다.</p>
        ) : (
          <ul className="space-y-1 text-sm text-neutral-600">
            {user.statusChanges.map((change, i) => (
              <li key={i}>
                {formatDateTime(change.changedAt)} · {USER_STATUS_LABELS[change.fromStatus]} →{' '}
                {USER_STATUS_LABELS[change.toStatus]}
                {/* 누가 바꿨는지는 이름으로 읽힌다 — 이름이 없는 행만 이메일로 되돌아간다. */}
                {(change.actorName ?? change.actorEmail) && (
                  <span className="text-neutral-400">
                    {' '}
                    ({change.actorName ?? change.actorEmail})
                  </span>
                )}
                {change.reason && <span className="text-neutral-400"> — {change.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {user.relationshipsLimited && <Alert>현재 업무와 대상 범위에서 제공된 관계입니다. 제공되지 않은 항목은 관계가 없다는 뜻이 아닙니다.</Alert>}
      <UserPermissionsSection user={user} canManageGlobal={canManage} />

      {canManage && (
        <UserStatusActions userId={userId} status={user.status} mfaEnabled={user.mfaEnabled === true} canEnable={user.supportCapabilities?.canEnableAccount === true} onEnabled={(updated, impact) => setChangeResult({ impact, status: updated.status })} />
      )}
    </div>
  )
}

/** Profile metadata and correction use the common support boundary. */
function UserProfileSection({
  user,
  canManage,
  onChanged,
}: {
  user: UserAdminDetail
  canManage: boolean
  onChanged: (updated: UserAdminDetail, impact: ProfileImpact) => void
}) {
  const queryClient = useQueryClient()
  const active = useActiveResult()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const visible = user.supportCapabilities?.profileVisible === true
  const options = useQuery({
    queryKey: ['meta', 'profile-options'],
    queryFn: fetchProfileOptions,
    staleTime: 60 * 60 * 1000,
    enabled: visible,
  })

  if (!visible) {
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-800">프로필</h3>
        <p className="text-sm text-neutral-500">
          프로필을 조회할 지원 권한이 없습니다.
        </p>
      </section>
    )
  }

  // 직책 라벨은 서버가 카탈로그와 함께 내려보낸다. 여기서 상수 표를 두면 직책이 하나
  // 늘 때마다 콘솔 배포가 있어야 서버와 일치한다.
  const positionLabel = options.data?.positions.find((item) => item.code === user.position)?.label
  const department = user.departmentOther ?? user.departmentName

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-800">프로필</h3>
        {canManage && (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            정정
          </Button>
        )}
      </div>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Field label="직책" value={positionLabel ?? '입력하지 않음'} />
        <Field label="학번" value={user.studentNo ?? '입력하지 않음'} />
        <Field label="소속" value={department ?? '입력하지 않음'} />
      </dl>
      {open && (
        <UserProfileCorrectionModal
          user={user}
          onClose={() => setOpen(false)}
          onSaved={async (updated, impact) => {
            if (active.current) onChanged(updated, impact)
            await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
            if (!active.current) return
            toast.success(`${updated.name}님의 프로필을 정정했습니다. 관계와 신청 결과를 갱신했습니다.`)
            setOpen(false)
          }}
        />
      )}
    </section>
  )
}

/**
 * 정정 폼. 본인 경로와 달리 값을 비울 수 있다.
 *
 * 열 때 저장된 값을 채우고 **네 필드를 항상 보낸다.** 그러므로 빈 칸은 비우기이고,
 * 텍스트를 지우는 것이 비우겠다는 표현이다. 부분 전송으로 바꾸면 「건드리지 않기」와
 * 「비우기」를 구분할 수 있지만, 그때는 서버가 absent 를 유지로 읽는다는 사실에 화면이
 * 의존하게 되므로 모의 핸들러도 같은 의미론이어야 한다.
 *
 * 무변경 저장은 저장값 재전송이라 값은 그대로지만 **감사 기록과 본인 알림은 발생한다**
 * (서버가 변경 여부를 따지지 않는다). 실수로 눌러도 「관리자가 프로필을 정정했습니다」가
 * 가므로 아래에서 바뀐 것이 없으면 아예 보내지 않는다.
 */
function UserProfileCorrectionModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserAdminDetail
  onClose: () => void
  onSaved: (updated: UserAdminDetail, impact: ProfileImpact) => Promise<void> | void
}) {
  const viewer = useAuth().user
  const [accessPurpose, setAccessPurpose] = useState('')
  const [confirmedAccess, setConfirmedAccess] = useState<string | null>(null)
  const [position, setPosition] = useState(user.position ?? '')
  const [studentNo, setStudentNo] = useState(user.studentNo ?? '')
  const [departmentCode, setDepartmentCode] = useState(user.departmentCode ?? '')
  const [departmentOther, setDepartmentOther] = useState(user.departmentOther ?? '')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const options = useQuery({
    queryKey: ['meta', 'profile-options'],
    queryFn: fetchProfileOptions,
    staleTime: 60 * 60 * 1000,
  })

  // 「기타」는 「목록에 없다」는 표시일 뿐 소속이 아니다. 직접 입력 없이 그 코드만 저장하면
  // 소속이 무의미한 값으로 굳고, 본인은 잠금 때문에 되돌릴 수 없다. 서버에 이 규칙이 없고
  // CHECK 도 허용하므로 막을 곳이 화면뿐인데, **정정 경로에도 서 있어야 한다** — 여기가
  // 그 상태를 고치러 오는 화면이면서 같은 상태를 다시 만들 수 있는 화면이다.
  const departmentIncomplete =
    departmentCode === OTHER_DEPARTMENT && departmentOther.trim() === ''

  // 저장값과 같으면 요청 자체를 보내지 않는다. 서버는 no-op 으로 흡수하지만 감사와
  // 알림은 남으므로, 실수 클릭이 본인에게 「관리자가 정정했습니다」로 가게 된다.
  const unchanged =
    (position || null) === (user.position ?? null) &&
    (studentNo.trim() || null) === (user.studentNo ?? null) &&
    (departmentCode || null) === (user.departmentCode ?? null) &&
    (departmentOther.trim() || null) === (user.departmentOther ?? null)

  const profile = {
    position: (position || null) as components['schemas']['UserPosition'] | null,
    studentNo: studentNo.trim() || null,
    departmentCode: departmentCode || null,
    departmentOther: departmentOther.trim() || null,
    reason: reason.trim() || null,
  }
  const profileText = JSON.stringify(profile)
  const debouncedProfile = useDebouncedValue(profileText)
  const impact = useQuery({
    queryKey: ['admin', 'users', 'profile-impact', user.id, requestReaderKey(viewer), debouncedProfile],
    queryFn: () => previewUserProfileImpact(user.id, 'PROFILE', JSON.parse(debouncedProfile)),
    enabled: !unchanged && !departmentIncomplete,
  })
  const impactReady = impact.isSuccess && !impact.isFetching && profileText === debouncedProfile
  const actorImpact = impactReady ? impact.data.actorAccessImpact : undefined
  const needsAccessConfirmation = !!actorImpact && (actorImpact.increases.length > 0 || actorImpact.pendingResourceOwners.length > 0)
  const accessConfirmed = !needsAccessConfirmation || (!!accessPurpose.trim() && confirmedAccess === actorImpact?.fingerprint)
  const impactFields = impact.isError ? fieldErrorsOf(toApiError(impact.error, '프로필 변경 영향을 확인하지 못했습니다.').problem) : {}

  const save = useMutation({
    mutationFn: (submitted: { profile: AdminProfileUpdate; impact: ProfileImpact }) => updateUserProfile(user.id, { ...submitted.profile, ...(needsAccessConfirmation && submitted.impact.actorAccessImpact ? { confirmation: { purpose: accessPurpose.trim(), fingerprint: submitted.impact.actorAccessImpact.fingerprint, confirmed: true } } : {}) }),
    onSuccess: async (updated, submitted) => {
      setError(null)
      setFieldErrors({})
      await onSaved(updated, submitted.impact)
    },
    onError: (err) => {
      const apiError = toApiError(err, '프로필을 정정하지 못했습니다.')
      const mapped = fieldErrorsOf(apiError.problem)
      setFieldErrors(mapped)
      if (mapped.confirmation) { setConfirmedAccess(null); void impact.refetch() }
      setError(Object.keys(mapped).length > 0 ? null : apiError.message)
    },
  })

  return (
    <Modal open onClose={() => { if (!save.isPending) onClose() }} title="프로필 정정">
      <form
          onSubmit={(event) => {
          event.preventDefault()
          setError(null)
          if (unchanged) {
            onClose()
            return
          }
          if (impactReady && accessConfirmed) save.mutate({ profile, impact: impact.data })
        }}
        className="space-y-4"
        noValidate
      >
        <fieldset disabled={save.isPending} className="space-y-4">
        {error && <Alert variant="danger">{error}</Alert>}
        <p className="text-sm text-neutral-600">
          문의로 접수된 내용을 확인한 뒤 정정해 주세요. 변경 사실은 본인에게 알림으로 갑니다.
        </p>
        <FormField label="직책" error={fieldErrors.position ?? impactFields.position}>
          <Select value={position} onChange={(event) => setPosition(event.target.value)}>
            <option value="">비움</option>
            {options.data?.positions.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="학번" error={fieldErrors.studentNo ?? impactFields.studentNo}>
          <Input
            value={studentNo}
            maxLength={20}
            autoComplete="off"
            onChange={(event) => setStudentNo(event.target.value)}
          />
        </FormField>
        <FormField label="소속 학과 코드" error={fieldErrors.departmentCode ?? impactFields.departmentCode}>
          <Select
            value={departmentCode}
            onChange={(event) => setDepartmentCode(event.target.value)}
          >
            <option value="">비움</option>
            {options.data?.departments.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="소속 직접 입력" error={fieldErrors.departmentOther ?? impactFields.departmentOther}>
          <Input
            value={departmentOther}
            maxLength={100}
            autoComplete="off"
            onChange={(event) => setDepartmentOther(event.target.value)}
          />
          {departmentIncomplete && (
            <p className="mt-1 text-xs text-danger-700">
              소속 학과 코드를 「기타」로 두려면 실제 소속을 직접 입력해 주세요. 코드만으로는
              소속이 「기타」라는 값으로 굳습니다.
            </p>
          )}
        </FormField>
        {/*
          감사 기록은 학번을 값이 아니라 있음/없음으로만 남긴다. 사유에 값을 적으면
          그 보장이 습관 하나로 깨진다.
        */}
        <FormField label="사유" error={fieldErrors.reason ?? impactFields.reason}>
          <Input
            value={reason}
            maxLength={200}
            autoComplete="off"
            placeholder="예: 본인 확인 후 학번 정정"
            onChange={(event) => setReason(event.target.value)}
          />
          <p className="mt-1 text-xs text-neutral-500">
            감사 기록에 남습니다. 학번이나 그 밖의 값 자체는 적지 마세요.
          </p>
        </FormField>
        {!unchanged && impact.isFetching && <Spinner label="프로필 변경 영향 확인 중" />}
        {!unchanged && impact.isError && Object.keys(impactFields).length === 0 && <Alert variant="danger">{impact.error.message}<Button variant="secondary" size="sm" onClick={() => void impact.refetch()}>변경 영향 다시 조회</Button></Alert>}
        {!unchanged && impactReady && <ProfileImpactView impact={impact.data} />}
        {needsAccessConfirmation && actorImpact && <section aria-label="회원님의 권한 증가 확인" className="space-y-3">
          <Alert variant="warning">이 정정으로 회원님의 권한이 늘어납니다. 정확한 대상과 얻는 권한을 확인해 주세요.</Alert>
          <AccessIncreaseDetails impact={actorImpact} />
          <FormField label="권한을 얻는 목적" required error={fieldErrors.confirmation}><Input value={accessPurpose} onChange={(event) => { setAccessPurpose(event.target.value); setConfirmedAccess(null) }} maxLength={200} /></FormField>
          <Checkbox label="목적과 정확한 대상, 얻는 권한을 확인했습니다" checked={confirmedAccess === actorImpact.fingerprint} onChange={(event) => setConfirmedAccess(event.target.checked ? actorImpact.fingerprint : null)} />
        </section>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" loading={save.isPending} disabled={departmentIncomplete || (!unchanged && (!impactReady || !accessConfirmed))}>
            저장
          </Button>
        </div>
        </fieldset>
      </form>
    </Modal>
  )
}

/* ─── 권한 — 기관별 역할과 전역 역할은 한 section에서 서로의 경계를 설명한다 ─── */

function UserPermissionsSection({
  user,
  canManageGlobal,
}: {
  user: UserAdminDetail
  canManageGlobal: boolean
}) {
  return (
    <section className="space-y-5 rounded-lg border border-neutral-200 p-4">
      <div>
        <h3 className="text-sm font-semibold text-neutral-800">권한 관리</h3>
      </div>
      <UserOrgRolesSection user={user} />
      {canManageGlobal && (
        <div className="border-t border-neutral-200 pt-5">
          <UserGlobalRoleSection user={user} />
        </div>
      )}
    </section>
  )
}

/** Institution changes use the complete explicit-assignment editor. */
function UserOrgRolesSection({ user }: { user: UserAdminDetail }) {
  const viewer = useAuth().user
  const scope = useAdminScope()
  const editable = viewer?.role === 'SYS_ADMIN' ? scope.options : workSources(viewer, 'institution.delegate').map((source) => ({ id: source.institutionId, name: source.institutionName }))
  if (user.managedOrgs == null) return <p className="text-sm text-neutral-500">기관 담당 정보는 현재 업무로 제공되지 않습니다.</p>
  return <div className="space-y-3"><h4 className="text-sm font-semibold">기관 담당 정보</h4>
    {user.managedOrgs.length === 0 ? <p className="text-sm text-neutral-500">배정된 기관 업무가 없습니다.</p>
      : <ul className="space-y-2">{user.managedOrgs.map((org) => <li key={org.orgId} className="rounded-md bg-neutral-50 p-3 text-sm">
        {org.orgName} · {USER_ROLE_LABELS[org.role]}{' '}
        {['institution.staff.read', 'institution.delegate', 'institution.request-mail.read', 'institution.request-mail.configure'].some((work) => hasWork(viewer, work, { orgId: org.orgId }, SYS_READERS))
          && <Link to={adminPaths.orgOperations(org.orgId)} className="text-primary-700 hover:underline">업무와 수신 설정 확인</Link>}
      </li>)}</ul>}
    {editable.length > 0 && <nav aria-label="기관 업무 편집" className="flex flex-wrap gap-3 text-sm">{editable.map((institution) => <Link key={institution.id} to={adminPaths.orgOperations(institution.id)} className="text-primary-700 hover:underline">{institution.name} 업무 편집</Link>)}</nav>}
    <p className="text-xs text-neutral-500">표시 역할을 선택해 권한을 부여하지 않습니다. 기관 운영에서 FULL 또는 SELECTED 업무와 범위를 확인한 뒤 변경합니다.</p>
  </div>
}

/* 전역 역할 관리 (SYS_ADMIN 전용). */

function UserGlobalRoleSection({ user }: { user: UserAdminDetail }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const initialRole: AdminGlobalRole =
    user.role === 'SYS_VIEWER' || user.role === 'SYS_MANAGER' || user.role === 'SYS_ADMIN'
      ? user.role
      : 'USER'
  const [role, setRole] = useState<AdminGlobalRole>(initialRole)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const update = useMutation({
    mutationFn: () => updateUserRole(user.id, { role }),
    onSuccess: async (updated) => {
      setError(null)
      setFieldErrors({})
      toast.success(
        `${updated.name}(${updated.email})님의 역할을 ${USER_ROLE_LABELS[updated.role]}(으)로 변경했습니다.`,
      )
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (err) => {
      const apiError = toApiError(err, '사용자 역할을 변경하지 못했습니다.')
      const mapped = fieldErrorsOf(apiError.problem)
      setFieldErrors(mapped)
      setError(Object.keys(mapped).length > 0 ? null : apiError.message)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    update.mutate()
  }

  if (user.managedOrgs == null) return <Alert>기관 업무를 확인할 수 없어 전역 역할을 변경할 수 없습니다.</Alert>
  if (user.managedOrgs.length > 0) {
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-neutral-800">전역 역할</h4>
        <Alert variant="info">
          전역 역할을 변경하려면 위 기관별 역할을 하나씩 모두 회수해 주세요. 마지막 기관을
          회수하면 일반 사용자로 전환되고 전역 역할 변경 폼이 열립니다.
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-neutral-800">전역 역할</h4>
      <p className="text-sm text-neutral-500">
        일반 사용자와 시스템 계층 역할만 관리합니다. 역할이 바뀌면 기존 로그인 세션은
        무효화됩니다.
      </p>
      {error && <Alert variant="danger">{error}</Alert>}
      <form onSubmit={submit} className="flex flex-wrap items-start gap-4" noValidate>
        <FormField label="역할" required error={fieldErrors.role}>
          <Select
            value={role}
            onChange={(event) => setRole(event.target.value as AdminGlobalRole)}
            className="w-40"
          >
            {GLOBAL_ROLE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {USER_ROLE_LABELS[value]}
              </option>
            ))}
          </Select>
        </FormField>
        <Button
          type="submit"
          loading={update.isPending}
          className="mt-6"
        >
          역할 변경
        </Button>
      </form>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium text-neutral-900">{value}</dd>
    </div>
  )
}

/* ─── 비활성화/해제 (수행은 SYS_ADMIN 전용, 표시는 전 관리자) ─── */

function UserStatusActions({
  canEnable,
  userId,
  status,
  mfaEnabled,
  onEnabled,
}: {
  userId: string
  status: UserStatus
  mfaEnabled: boolean
  canEnable: boolean
  onEnabled: (updated: UserAdminDetail, impact: ProfileImpact) => void
}) {
  const queryClient = useQueryClient()
  const active = useActiveResult()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [mfaResetOpen, setMfaResetOpen] = useState(false)
  const viewer = useAuth().user
  const [enableOpen, setEnableOpen] = useState(false)
  const enableImpact = useQuery({
    queryKey: ['admin', 'users', 'enable-impact', userId, status, requestReaderKey(viewer)],
    queryFn: () => previewUserProfileImpact(userId, 'ENABLE'),
    enabled: canEnable && enableOpen && status === 'DISABLED',
    staleTime: 0,
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
  }

  const mfaReset = useMutation({
    mutationFn: () => resetUserMfa(userId),
    onSuccess: async (data) => {
      await invalidate()
      if (!active.current) return
      setMfaResetOpen(false)
      setError(null)
      toast.success(data.message)
    },
    onError: (err) => {
      setMfaResetOpen(false)
      setError(toApiError(err, '2단계 인증을 초기화하지 못했습니다.').message)
    },
  })

  const disable = useMutation({
    mutationFn: () => disableUser(userId, reason.trim()),
    onSuccess: async () => {
      await invalidate()
      if (!active.current) return
      setOpen(false)
      setReason('')
      setError(null)
      setFieldErrors({})
    },
    onError: (err) => {
      const apiError = toApiError(err, '사용자를 비활성화하지 못했습니다.')
      const fields = fieldErrorsOf(apiError.problem)
      setFieldErrors(fields)
      setError(Object.keys(fields).length > 0 ? null : apiError.message)
    },
  })

  const enable = useMutation({
    mutationFn: (_impact: ProfileImpact) => enableUser(userId),
    onSuccess: async (updated, submittedImpact) => { if (active.current) onEnabled(updated, submittedImpact); await invalidate(); if (active.current) { setEnableOpen(false); toast.success('재활성화 결과와 연결된 신청 상태를 갱신했습니다.') } },
    onError: (err) => setError(toApiError(err, '사용자를 활성화하지 못했습니다.').message),
  })

  if (status === 'WITHDRAWN') {
    return (
      <p className="text-sm text-neutral-500">탈퇴한 계정은 상태를 변경할 수 없습니다.</p>
    )
  }

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-800">계정 상태 관리</h3>
      {error && <Alert variant="danger">{error}</Alert>}
      {status === 'DISABLED' ? (
        <>
          <p className="text-sm text-neutral-500">
            비활성화 직전 상태로 복원합니다. 미인증 상태였던 계정은 다시 인증 대기로 돌아갑니다.
            별도로 회수한 기관 역할과 자원 권한은 재활성화해도 복원되지 않습니다.
          </p>
          <Button
            variant="secondary"
            loading={enable.isPending}
            disabled={!canEnable}
            onClick={() => setEnableOpen(true)}
          >
            비활성화 해제
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-neutral-500">
            워크스페이스와 자원, 구성원과 기관 역할, 자원에 부여된 권한은 유지됩니다.
            필요한 권한 회수는 별도로 처리합니다.
          </p>
          <Button variant="danger" onClick={() => setOpen(true)}>
            계정 비활성화
          </Button>
        </>
      )}

      <Modal open={enableOpen} onClose={() => { if (!enable.isPending) setEnableOpen(false) }} title="계정 재활성화 영향 확인"
        footer={<><Button variant="secondary" disabled={enable.isPending} onClick={() => setEnableOpen(false)}>취소</Button>
          <Button loading={enable.isPending} disabled={!enableImpact.isSuccess || enableImpact.isFetching} onClick={() => { if (enableImpact.data) enable.mutate(enableImpact.data) }}>영향 확인 후 재활성화</Button></>}>
        {enableImpact.isPending || enableImpact.isFetching ? <Spinner label="재활성화 영향 확인 중" />
          : enableImpact.isError ? <Alert variant="danger">{enableImpact.error.message}<Button variant="secondary" size="sm" onClick={() => void enableImpact.refetch()}>변경 영향 다시 조회</Button></Alert>
            : <ProfileImpactView impact={enableImpact.data} />}
      </Modal>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="계정 비활성화"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              돌아가기
            </Button>
            <Button
              variant="danger"
              loading={disable.isPending}
              disabled={reason.trim().length === 0}
              onClick={() => disable.mutate()}
            >
              비활성화
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Alert variant="warning">
            비활성화 즉시 대상 계정의 모든 세션이 종료되고 로그인·SSH 접속이 차단됩니다. 사유는
            대상 사용자와 시스템 관리자에게 통지됩니다.
          </Alert>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-neutral-700">비활성화 사유</span>
            <Textarea
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="비활성화 사유를 입력하세요 (이력·감사에 기록됩니다)."
            />
            {fieldErrors.reason && (
              <span className="text-sm text-danger-600" role="alert">
                {fieldErrors.reason}
              </span>
            )}
          </label>
        </div>
      </Modal>

      {mfaEnabled && (
        <div className="space-y-2 border-t border-neutral-200 pt-3">
          <p className="text-sm text-neutral-500">
            인증 앱과 복구 코드를 모두 분실한 사용자에게만, 오프라인 본인 확인을 마친 뒤에
            수행해 주세요.
          </p>
          <Button variant="secondary" onClick={() => setMfaResetOpen(true)}>
            2단계 인증 초기화
          </Button>
        </div>
      )}

      <Modal
        open={mfaResetOpen}
        onClose={() => setMfaResetOpen(false)}
        title="2단계 인증 초기화"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMfaResetOpen(false)}>
              돌아가기
            </Button>
            <Button variant="danger" loading={mfaReset.isPending} onClick={() => mfaReset.mutate()}>
              초기화
            </Button>
          </>
        }
      >
        <Alert variant="warning">
          초기화하면 대상 사용자의 2단계 인증 등록과 복구 코드가 삭제됩니다. 이후 비밀번호만으로
          로그인할 수 있으며, 감사 기록과 사용자 통지가 남습니다.
        </Alert>
      </Modal>
    </section>
  )
}
