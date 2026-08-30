import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  disableUser,
  enableUser,
  fetchAdminUser,
  fetchAdminUsers,
  fetchOrgs,
  fetchProfileOptions,
  grantOrgRole,
  resetUserMfa,
  revokeOrgRole,
  updateUserProfile,
  updateUserRole,
  type AdminUserSort,
  type UserAdminDetail,
  type UserAdminView,
  type UserRole,
  type UserStatus,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { OTHER_DEPARTMENT } from '../components/profile/profile-values'
import type { components } from '../api/schema'
import { useAuth, type ManagedOrg } from '../auth/auth-context'
import { administeredOrgs, isOrgTier, isSysAdminOnly, isSysTier } from '../auth/permissions'
import {
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
  Table,
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
import { cn } from '../lib/cn'
import { fieldErrorsOf } from '../lib/field-errors'
import { formatDateTime } from '../lib/format'
import { WORKSPACE_KIND_LABELS, USER_ROLE_LABELS, USER_STATUS_LABELS } from '../lib/labels'
import { useDebouncedValue } from '../lib/use-debounced-value'
import { useAdminScope } from '../lib/use-admin-scope'
import { adminPaths } from '../lib/paths'

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

const STATUS_VARIANT: Record<UserStatus, BadgeVariant> = {
  ACTIVE: 'success',
  PENDING_VERIFICATION: 'warning',
  DISABLED: 'danger',
  WITHDRAWN: 'neutral',
}

function UserStatusBadge({ status }: { status: UserStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{USER_STATUS_LABELS[status]}</Badge>
}

export function AdminUsersPage() {
  const { user } = useAuth()
  const { activeOrgId } = useAdminScope()
  const viewerRole = user?.role
  // 사용자 목록도 전역 관리 범위를 따른다. 시스템 계층의 전체 플랫폼에서는 전원을,
  // 기관 scope에서는 그 기관과 연결된 계정을 본다. 계정 비활성화, 해제, MFA
  // 초기화는 SYS_ADMIN 전용(§4).
  const isSysAdmin = !!viewerRole && isSysTier(viewerRole)
  const canManageAccounts = !!viewerRole && isSysAdminOnly(viewerRole)
  const [status, setStatus] = useState<UserStatus | undefined>(undefined)
  const [role, setRole] = useState<UserRole | undefined>(undefined)
  const [qInput, setQInput] = useState('')
  const [sort, setSort] = useState<AdminUserSort | undefined>(undefined)
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const debouncedQ = useDebouncedValue(qInput).trim()
  const q = debouncedQ.length > 0 ? debouncedQ : undefined

  const users = useQuery({
    queryKey: [
      'admin',
      'users',
      {
        status: status ?? null,
        role: role ?? null,
        orgId: activeOrgId ?? null,
        q: q ?? null,
        sort: sort ?? null,
        page,
        size: PAGE_SIZE,
      },
    ],
    queryFn: () =>
      fetchAdminUsers({ status, role, orgId: activeOrgId, q, sort, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

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
          전체 사용자를 조회하고
          {isSysAdmin ? ' 계정 비활성화와 해제를 관리합니다.' : ' 상세 정보를 확인합니다.'}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 필터 토글 버튼 그룹 — ARIA tabs 패턴 미구현이므로 tab 롤 미사용 (진짜 탭은 ui/Tabs) */}
        <div role="group" aria-label="계정 상태 필터" className="flex flex-wrap gap-1">
          {STATUS_TABS.map((tab) => {
            const isSelected = tab.status === status
            return (
              <button
                key={tab.label}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  setStatus(tab.status)
                  setPage(0)
                }}
                className={cn(
                  'cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary-600',
                  isSelected
                    ? 'bg-primary-600 text-white'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                )}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="search"
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
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {USER_ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>

      {users.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="사용자 목록 불러오는 중" />
        </div>
      )}
      {users.isError && <Alert variant="danger">{users.error.message}</Alert>}
      {users.isSuccess && users.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">표시할 사용자가 없습니다.</Card>
      )}
      {users.isSuccess && users.data.content.length > 0 && (
        <>
          <Card>
            <Table>
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
            </Table>
          </Card>
          <Pagination
            page={users.data.page}
            totalPages={users.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      <Drawer
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
        title="사용자 상세"
      >
        {selectedId !== null && (
          <UserDetailBody key={selectedId} userId={selectedId} canManage={canManageAccounts} />
        )}
      </Drawer>
    </div>
  )
}

/* ─── 상세 드로어 본문 (행 선택 시) ─── */

function UserDetailBody({ userId, canManage }: { userId: string; canManage: boolean }) {
  const { activeOrgId } = useAdminScope()
  const detail = useQuery({
    queryKey: ['admin', 'users', 'detail', userId],
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
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-900">{user.name}</h3>
        <UserStatusBadge status={user.status} />
      </div>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Field label="이메일" value={user.email} />
        <Field label="역할" value={USER_ROLE_LABELS[user.role]} />
        <Field label="가입일" value={formatDateTime(user.createdAt)} />
        <Field label="활성 VM 수" value={String(user.activeVmCount)} />
        <Field label="2단계 인증" value={user.mfaEnabled ? '사용' : '미사용'} />
        {user.disabledReason && <Field label="비활성화 사유" value={user.disabledReason} />}
      </dl>

      <UserProfileSection user={user} canManage={canManage} />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-800">워크스페이스 멤버십</h3>
        {user.memberships.length === 0 ? (
          <p className="text-sm text-neutral-500">소속된 워크스페이스가 없습니다.</p>
        ) : (
          <ul className="space-y-1 text-sm text-neutral-700">
            {user.memberships.map((m) => (
              <li key={m.workspaceId}>
                {m.workspaceName}{' '}
                <span className="text-neutral-400">
                  ({WORKSPACE_KIND_LABELS[m.workspaceKind]} · {m.role})
                </span>{' '}
                <Link
                  to={adminPaths.vms(activeOrgId, m.workspaceId)}
                  className="text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-primary-600"
                >
                  VM 보기
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-800">상태 변경 이력</h3>
        {user.statusChanges.length === 0 ? (
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

      <UserOrgRolesSection user={user} />

      {canManage && <UserRoleSection user={user} />}

      {canManage && (
        <UserStatusActions userId={userId} status={user.status} mfaEnabled={user.mfaEnabled} />
      )}
    </div>
  )
}

/* ─── 프로필 (조회는 시스템 계층, 정정은 SYS_ADMIN) ─── */

/**
 * 직책·학번·소속의 표시와 정정.
 *
 * 본인은 이 세 값을 한 번만 쓸 수 있으므로(v0.51.0) 그 뒤의 변경은 여기가 유일한
 * 경로다. 잠금과 이 폼은 한 쌍이다 — 처음 입력한 값이 오타여도 되돌릴 사람이 없으면
 * 잠금은 함정이다.
 *
 * **값은 시스템 계층에만 온다.** 이 엔드포인트는 기관이 다른 기관 직원에게 주는
 * ORG_VIEWER 까지 받고 기관 범위로 좁히지도 않으므로, 학번을 기관 계층에 채워 보내면
 * 모든 기관의 직원이 모든 계정의 식별자를 읽는다. 그래서 서버가 비워서 보내고, 화면은
 * **값이 없는 것과 볼 권한이 없는 것을 구분해서** 적는다. 「입력하지 않음」으로 찍으면
 * 거짓말이 된다.
 */
function UserProfileSection({
  user,
  canManage,
}: {
  user: UserAdminDetail
  canManage: boolean
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const viewer = useAuth().user
  const visible = !!viewer && isSysTier(viewer.role)
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
          직책과 학번과 소속은 시스템 계층에서만 조회할 수 있습니다.
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
          onSaved={async (updated) => {
            toast.success(`${updated.name}님의 프로필을 정정했습니다.`)
            await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
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
  onSaved: (updated: UserAdminDetail) => Promise<void> | void
}) {
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

  const save = useMutation({
    mutationFn: () =>
      updateUserProfile(user.id, {
        // 빈 문자열은 null 로 보낸다. 관리자 경로에서 비우기는 허용되고, 애초에
        // 들어가면 안 됐던 값은 교체가 아니라 제거가 필요하다.
        position: (position || null) as components['schemas']['UserPosition'] | null,
        studentNo: studentNo.trim() || null,
        departmentCode: departmentCode || null,
        departmentOther: departmentOther.trim() || null,
        reason: reason.trim() || null,
      }),
    onSuccess: async (updated) => {
      setError(null)
      setFieldErrors({})
      await onSaved(updated)
    },
    onError: (err) => {
      const apiError = toApiError(err, '프로필을 정정하지 못했습니다.')
      const mapped = fieldErrorsOf(apiError.problem)
      setFieldErrors(mapped)
      setError(Object.keys(mapped).length > 0 ? null : apiError.message)
    },
  })

  return (
    <Modal open onClose={onClose} title="프로필 정정">
      <form
          onSubmit={(event) => {
          event.preventDefault()
          setError(null)
          if (unchanged) {
            onClose()
            return
          }
          save.mutate()
        }}
        className="space-y-4"
        noValidate
      >
        {error && <Alert variant="danger">{error}</Alert>}
        <p className="text-sm text-neutral-600">
          본인은 이 값을 바꿀 수 없습니다. 문의로 접수된 내용을 확인한 뒤 정정해 주세요.
          변경 사실은 본인에게 알림으로 갑니다.
        </p>
        <FormField label="직책" error={fieldErrors.position}>
          <Select value={position} onChange={(event) => setPosition(event.target.value)}>
            <option value="">비움</option>
            {options.data?.positions.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="학번" error={fieldErrors.studentNo}>
          <Input
            value={studentNo}
            maxLength={20}
            autoComplete="off"
            onChange={(event) => setStudentNo(event.target.value)}
          />
        </FormField>
        <FormField label="소속 학과 코드" error={fieldErrors.departmentCode}>
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
        <FormField label="소속 직접 입력" error={fieldErrors.departmentOther}>
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
        <FormField label="사유" error={fieldErrors.reason}>
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
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" loading={save.isPending} disabled={departmentIncomplete}>
            저장
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/* ─── 기관 역할 (계약 v0.46.0 — 기관마다 하나씩 주고 뺀다) ─── */

/**
 * 한 계정이 여러 기관의 관리자를 겸할 수 있으므로, 기관 역할은 통째로 덮어쓰는
 * 위 역할 관리와 별개로 기관 단위로 붙이고 뗀다. 기관 관리자는 자기가 관리자로
 * 있는 기관의 행만 건드릴 수 있고, 그 밖의 기관은 API가 404로 답한다.
 *
 * 열람 역할(ORG_VIEWER)도 여기서 부여한다 — 기관이 다른 기관의 직원에게 자기
 * 기관을 보게 하되 손대지 못하게 하는 통로다.
 */
function UserOrgRolesSection({ user }: { user: UserAdminDetail }) {
  const { user: viewer } = useAuth()
  const scope = useAdminScope()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const [addOrgId, setAddOrgId] = useState('')
  const [addRole, setAddRole] = useState<UserRole>('ORG_MANAGER')
  const [confirmRevoke, setConfirmRevoke] = useState<ManagedOrg | null>(null)

  const isSysAdmin = viewer?.role === 'SYS_ADMIN'
  const canStaff = isSysAdmin || scope.activeOrgRole === 'ORG_ADMIN'
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs, enabled: isSysAdmin })
  // 시스템 관리자는 전 기관에, 기관 관리자는 자기가 관리자로 있는 기관에만 부여한다.
  const grantable = isSysAdmin
    ? (orgs.data ?? []).map((org) => ({ id: org.id, name: org.name }))
    : administeredOrgs(viewer?.managedOrgs ?? [])
      .filter((org) => org.orgId === scope.activeOrgId)
      .map((org) => ({
        id: org.orgId,
        name: org.orgName,
      }))
  // 자기 자신과 시스템 계층 계정은 API가 403으로 거부하므로 변경 액션을
  // 렌더하지 않는다.
  const isSelf = viewer?.id === user.id
  const targetIsSysTier = isSysTier(user.role)
  const blockedReason = isSelf
    ? '자신의 기관 역할은 변경할 수 없습니다.'
    : targetIsSysTier
      ? '시스템 관리자 계정의 기관 역할은 변경할 수 없습니다.'
      : null

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })

  const grant = useMutation({
    mutationFn: () => grantOrgRole(user.id, addOrgId, addRole),
    onSuccess: async (updated) => {
      setError(null)
      setAddOrgId('')
      toast.success(`${updated.name}님에게 기관 역할을 부여했습니다.`)
      await invalidate()
    },
    onError: (err) => setError(toApiError(err, '기관 역할을 부여하지 못했습니다.').message),
  })

  const revoke = useMutation({
    mutationFn: (orgId: string) => revokeOrgRole(user.id, orgId),
    onSuccess: async (updated) => {
      setError(null)
      setConfirmRevoke(null)
      toast.success(
        updated.role === 'USER'
          ? `${updated.name}님의 마지막 관리 기관을 회수했습니다. 이제 일반 사용자입니다.`
          : `${updated.name}님의 기관 역할을 회수했습니다.`,
      )
      await invalidate()
    },
    onError: (err) => {
      setConfirmRevoke(null)
      setError(toApiError(err, '기관 역할을 회수하지 못했습니다.').message)
    },
  })

  const alreadyHeld = new Set(user.managedOrgs.map((org) => org.orgId))
  const addable = grantable.filter((org) => !alreadyHeld.has(org.id))

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-800">기관 역할</h3>
      <p className="text-sm text-neutral-500">
        한 계정이 여러 기관의 관리자를 겸할 수 있습니다. 기관 관리자는 자기가 관리자로 있는
        기관만 더하고 뺄 수 있습니다.
      </p>
      {error && <Alert variant="danger">{error}</Alert>}

      {user.managedOrgs.length === 0 ? (
        <p className="text-sm text-neutral-500">관리하는 기관이 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {user.managedOrgs.map((org) => {
            const mine = grantable.some((option) => option.id === org.orgId)
            return (
              <li
                key={org.orgId}
                className="flex items-center justify-between gap-3 rounded-md bg-neutral-50 px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium text-neutral-900">{org.orgName}</span>{' '}
                  <Badge variant="neutral">{USER_ROLE_LABELS[org.role]}</Badge>
                </span>
                {canStaff && mine && blockedReason == null && (
                  <Button size="sm" variant="secondary" onClick={() => setConfirmRevoke(org)}>
                    회수
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {canStaff && blockedReason == null && (
        <div className="flex flex-wrap items-end gap-3">
          <FormField label="부여할 기관">
            <Select
              className="w-56"
              value={addOrgId}
              disabled={addable.length === 0}
              onChange={(event) => setAddOrgId(event.target.value)}
            >
              <option value="">기관 선택</option>
              {addable.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="부여할 역할">
            <Select
              className="w-40"
              value={addRole}
              onChange={(event) => setAddRole(event.target.value as UserRole)}
            >
              <option value="ORG_VIEWER">{USER_ROLE_LABELS.ORG_VIEWER}</option>
              <option value="ORG_MANAGER">{USER_ROLE_LABELS.ORG_MANAGER}</option>
              <option value="ORG_ADMIN">{USER_ROLE_LABELS.ORG_ADMIN}</option>
            </Select>
          </FormField>
          <Button
            disabled={!addOrgId}
            loading={grant.isPending}
            onClick={() => grant.mutate()}
          >
            부여
          </Button>
        </div>
      )}

      <Modal
        open={confirmRevoke != null}
        onClose={() => setConfirmRevoke(null)}
        title="기관 역할 회수"
      >
        <p className="text-sm text-neutral-600">
          {confirmRevoke?.orgName} 기관에서 {user.name}님의 역할을 회수합니다.
          {user.managedOrgs.length === 1 && (
            <>
              {' '}
              <strong className="text-neutral-900">
                마지막 관리 기관이므로 이 계정은 일반 사용자가 되고 기존 로그인 세션이
                무효화됩니다.
              </strong>
            </>
          )}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmRevoke(null)}>
            취소
          </Button>
          <Button
            variant="danger"
            loading={revoke.isPending}
            onClick={() => confirmRevoke && revoke.mutate(confirmRevoke.orgId)}
          >
            회수
          </Button>
        </div>
      </Modal>
    </section>
  )
}

/* ─── 역할 관리 (수행은 SYS_ADMIN 전용, 표시는 전 관리자) ─── */

function UserRoleSection({ user }: { user: UserAdminDetail }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [role, setRole] = useState<UserRole>(user.role)
  const [orgId, setOrgId] = useState(user.managedOrgs[0]?.orgId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs })

  const update = useMutation({
    mutationFn: () =>
      updateUserRole(user.id, { role, orgId: isOrgTier(role) ? orgId : null }),
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
    if (isOrgTier(role) && !orgId) {
      setFieldErrors({ orgId: '기관 계층 역할은 관리할 기관을 선택해야 합니다.' })
      return
    }
    setFieldErrors({})
    update.mutate()
  }

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-800">역할 관리</h3>
      <p className="text-sm text-neutral-500">
        전역 역할을 변경합니다. 역할이 바뀌면 이 사용자의 기존 로그인 세션은 무효화됩니다.
      </p>
      {error && <Alert variant="danger">{error}</Alert>}
      <form onSubmit={submit} className="flex flex-wrap items-start gap-4" noValidate>
        <FormField label="역할" required error={fieldErrors.role}>
          <Select
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
            className="w-40"
          >
            {(Object.keys(USER_ROLE_LABELS) as UserRole[]).map((value) => (
              <option key={value} value={value}>
                {USER_ROLE_LABELS[value]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          label="관리 기관"
          required={isOrgTier(role)}
          error={fieldErrors.orgId}
          description="기관 계층 역할일 때만 지정합니다."
        >
          <Select
            value={orgId}
            disabled={!isOrgTier(role)}
            onChange={(event) => setOrgId(event.target.value)}
            className="w-56"
          >
            <option value="">선택 안 함</option>
            {orgs.data?.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
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
    </section>
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
  userId,
  status,
  mfaEnabled,
}: {
  userId: string
  status: UserStatus
  mfaEnabled: boolean
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [mfaResetOpen, setMfaResetOpen] = useState(false)

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
  }

  const mfaReset = useMutation({
    mutationFn: () => resetUserMfa(userId),
    onSuccess: async (data) => {
      setMfaResetOpen(false)
      setError(null)
      toast.success(data.message)
      await invalidate()
    },
    onError: (err) => {
      setMfaResetOpen(false)
      setError(toApiError(err, '2단계 인증을 초기화하지 못했습니다.').message)
    },
  })

  const disable = useMutation({
    mutationFn: () => disableUser(userId, reason.trim()),
    onSuccess: async () => {
      setOpen(false)
      setReason('')
      setError(null)
      setFieldErrors({})
      await invalidate()
    },
    onError: (err) => {
      const apiError = toApiError(err, '사용자를 비활성화하지 못했습니다.')
      const fields = fieldErrorsOf(apiError.problem)
      setFieldErrors(fields)
      setError(Object.keys(fields).length > 0 ? null : apiError.message)
    },
  })

  const enable = useMutation({
    mutationFn: () => enableUser(userId),
    onSuccess: invalidate,
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
          </p>
          <Button
            variant="secondary"
            loading={enable.isPending}
            onClick={() => enable.mutate()}
          >
            비활성화 해제
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-neutral-500">
            계정을 비활성화하면 즉시 로그인·SSH 접속이 차단됩니다. 워크스페이스·VM은 유지되며 해제 시
            원상 복귀됩니다.
          </p>
          <Button variant="danger" onClick={() => setOpen(true)}>
            계정 비활성화
          </Button>
        </>
      )}

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
            인증 앱·복구 코드를 모두 분실한 사용자의 2단계 인증을 초기화합니다. 오프라인 본인 확인
            후에만 수행해야 하는 민감 작업입니다.
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
