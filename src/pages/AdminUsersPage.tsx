import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  disableUser,
  enableUser,
  fetchAdminUser,
  fetchAdminUsers,
  fetchOrgs,
  resetUserMfa,
  updateUserRole,
  type AdminUserSort,
  type UserAdminDetail,
  type UserAdminView,
  type UserRole,
  type UserStatus,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { isOrgTier, isSysAdminOnly, isSysTier } from '../auth/permissions'
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
  PermissionNotice,
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
import { GROUP_KIND_LABELS, USER_ROLE_LABELS, USER_STATUS_LABELS } from '../lib/labels'
import { useDebouncedValue } from '../lib/use-debounced-value'

type SortKey = 'name' | 'email' | 'createdAt'

const PAGE_SIZE = 10

const STATUS_TABS: { label: string; status: UserStatus | undefined }[] = [
  { label: '전체', status: undefined },
  { label: USER_STATUS_LABELS.ACTIVE, status: 'ACTIVE' },
  { label: USER_STATUS_LABELS.PENDING_VERIFICATION, status: 'PENDING_VERIFICATION' },
  { label: USER_STATUS_LABELS.DISABLED, status: 'DISABLED' },
  { label: USER_STATUS_LABELS.WITHDRAWN, status: 'WITHDRAWN' },
]

const ROLE_OPTIONS: UserRole[] = ['USER', 'ORG_MANAGER', 'ORG_ADMIN', 'SYS_MANAGER', 'SYS_ADMIN']

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
  const viewerRole = user?.role
  // 전체/우리 기관 조회 범위는 시스템 계층. 계정 비활성화·해제·MFA 초기화는
  // SYS_ADMIN 전용(§4).
  const isSysAdmin = !!viewerRole && isSysTier(viewerRole)
  const canManageAccounts = !!viewerRole && isSysAdminOnly(viewerRole)
  const [status, setStatus] = useState<UserStatus | undefined>(undefined)
  const [role, setRole] = useState<UserRole | undefined>(undefined)
  const [orgId, setOrgId] = useState<number | undefined>(undefined)
  const [qInput, setQInput] = useState('')
  const [sort, setSort] = useState<AdminUserSort | undefined>(undefined)
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const debouncedQ = useDebouncedValue(qInput).trim()
  const q = debouncedQ.length > 0 ? debouncedQ : undefined

  const users = useQuery({
    queryKey: [
      'admin',
      'users',
      {
        status: status ?? null,
        role: role ?? null,
        orgId: orgId ?? null,
        q: q ?? null,
        sort: sort ?? null,
        page,
        size: PAGE_SIZE,
      },
    ],
    queryFn: () => fetchAdminUsers({ status, role, orgId, q, sort, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  const orgs = useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs, enabled: isSysAdmin })

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
          {isSysAdmin ? '전체' : '우리 기관에 소속된'} 사용자를 조회하고
          {isSysAdmin ? ' 계정 비활성화·해제를 관리합니다.' : ' 상세 정보를 확인합니다.'}
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
          {isSysAdmin && (
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              기관
              <Select
                aria-label="기관 필터"
                className="w-56"
                value={orgId ?? ''}
                onChange={(event) => {
                  setOrgId(event.target.value ? Number(event.target.value) : undefined)
                  setPage(0)
                }}
              >
                <option value="">전체 기관</option>
                {orgs.data?.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
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

function UserDetailBody({ userId, canManage }: { userId: number; canManage: boolean }) {
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

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-800">그룹 멤버십</h3>
        {user.memberships.length === 0 ? (
          <p className="text-sm text-neutral-500">소속된 그룹이 없습니다.</p>
        ) : (
          <ul className="space-y-1 text-sm text-neutral-700">
            {user.memberships.map((m) => (
              <li key={m.groupId}>
                {m.groupName}{' '}
                <span className="text-neutral-400">
                  ({GROUP_KIND_LABELS[m.groupKind]} · {m.role})
                </span>{' '}
                <Link
                  to={`/admin/vms?groupId=${m.groupId}`}
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
                {change.actorEmail && <span className="text-neutral-400"> ({change.actorEmail})</span>}
                {change.reason && <span className="text-neutral-400"> — {change.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <UserRoleSection user={user} canManage={canManage} />

      <UserStatusActions
        userId={userId}
        status={user.status}
        mfaEnabled={user.mfaEnabled}
        canManage={canManage}
      />
    </div>
  )
}

/* ─── 역할 관리 (수행은 SYS_ADMIN 전용, 표시는 전 관리자) ─── */

function UserRoleSection({ user, canManage }: { user: UserAdminDetail; canManage: boolean }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [role, setRole] = useState<UserRole>(user.role)
  const [orgId, setOrgId] = useState(user.orgId != null ? String(user.orgId) : '')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs, enabled: canManage })

  const update = useMutation({
    mutationFn: () =>
      updateUserRole(user.id, { role, orgId: isOrgTier(role) ? Number(orgId) : null }),
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
      setFieldErrors({ orgId: '기관 관리자·기관 운영자는 관리할 기관을 선택해야 합니다.' })
      return
    }
    setFieldErrors({})
    update.mutate()
  }

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-800">역할 관리</h3>
      {!canManage && (
        <PermissionNotice>역할 변경은 시스템 관리자만 수행할 수 있습니다.</PermissionNotice>
      )}
      <p className="text-sm text-neutral-500">
        전역 역할을 변경합니다. 역할이 바뀌면 이 사용자의 기존 로그인 세션은 무효화됩니다.
      </p>
      {error && <Alert variant="danger">{error}</Alert>}
      <form onSubmit={submit} className="flex flex-wrap items-start gap-4" noValidate>
        <FormField label="역할" required error={fieldErrors.role}>
          <Select
            value={role}
            disabled={!canManage}
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
          description="기관 관리자·기관 운영자 역할일 때만 지정합니다."
        >
          <Select
            value={orgId}
            disabled={!canManage || !isOrgTier(role)}
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
          disabled={!canManage}
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
  canManage,
}: {
  userId: number
  status: UserStatus
  mfaEnabled: boolean
  canManage: boolean
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
      {!canManage && (
        <PermissionNotice>
          계정 상태 변경과 2단계 인증 초기화는 시스템 관리자만 수행할 수 있습니다.
        </PermissionNotice>
      )}
      {error && <Alert variant="danger">{error}</Alert>}
      {status === 'DISABLED' ? (
        <>
          <p className="text-sm text-neutral-500">
            비활성화 직전 상태로 복원합니다. 미인증 상태였던 계정은 다시 인증 대기로 돌아갑니다.
          </p>
          <Button
            variant="secondary"
            loading={enable.isPending}
            disabled={!canManage}
            onClick={() => enable.mutate()}
          >
            비활성화 해제
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-neutral-500">
            계정을 비활성화하면 즉시 로그인·SSH 접속이 차단됩니다. 그룹·VM은 유지되며 해제 시
            원상 복귀됩니다.
          </p>
          <Button variant="danger" disabled={!canManage} onClick={() => setOpen(true)}>
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
          <Button variant="secondary" disabled={!canManage} onClick={() => setMfaResetOpen(true)}>
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
