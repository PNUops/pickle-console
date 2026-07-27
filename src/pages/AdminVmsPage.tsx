import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelScheduledVmDeletion,
  fetchAdminGroups,
  forceDeleteVm,
  fetchAdminVms,
  fetchOrgs,
  scheduleVmDeletion,
  updateVmGatewayBlock,
  type AdminVmSort,
  type VmStatus,
  type VmSummary,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { canManageVmDeletion, isSysAdminOnly, isSysTier } from '../auth/permissions'
import { ExtendVmPeriodModal } from '../components/ExtendVmPeriodModal'
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmNameModal,
  Drawer,
  FormField,
  Input,
  Modal,
  Pagination,
  PermissionNotice,
  Select,
  SortableTH,
  Spinner,
  Table,
  TBody,
  TD,
  Textarea,
  TH,
  THead,
  TR,
  VmStatusBadge,
} from '../components/ui'
import { cn } from '../lib/cn'
import { fieldErrorsOf } from '../lib/field-errors'
import { formatDateTime, formatSpec, minScheduleDate } from '../lib/format'
import { useDebouncedValue } from '../lib/use-debounced-value'
import { VM_STATUS_LABELS } from '../lib/status'

/** 정렬 가능한 컬럼 키 (계약 sort 화이트리스트의 축). */
type SortKey = 'name' | 'endDate' | 'createdAt'

const PAGE_SIZE = 10

// 관리자 신청 큐와 같은 탭 패턴. 기본은 전체 (운영 개입 대상을 넓게 훑는 화면).
const STATUS_TABS: { label: string; status: VmStatus | undefined }[] = [
  { label: '전체', status: undefined },
  { label: VM_STATUS_LABELS.RUNNING, status: 'RUNNING' },
  { label: VM_STATUS_LABELS.STOPPED, status: 'STOPPED' },
  { label: VM_STATUS_LABELS.CREATING, status: 'CREATING' },
  { label: VM_STATUS_LABELS.DELETING, status: 'DELETING' },
  { label: VM_STATUS_LABELS.NEEDS_ADMIN, status: 'NEEDS_ADMIN' },
  { label: VM_STATUS_LABELS.ERROR, status: 'ERROR' },
]

/** URL 쿼리의 양의 정수 파라미터. 그 외 값은 필터 미적용으로 취급한다. */
function idParam(value: string | null): number | undefined {
  const parsed = Number(value)
  return value && Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

export function AdminVmsPage() {
  const { user } = useAuth()
  const role = user?.role
  // 전체/우리 기관 조회 범위는 시스템 계층. 삭제 라이프사이클(예약·취소)은
  // ORG_ADMIN·SYS_ADMIN만, 강제 삭제는 SYS_ADMIN만(§3.11/§4).
  const isSysAdmin = !!role && isSysTier(role)
  const canDelete = !!role && canManageVmDeletion(role)
  const canForceDelete = !!role && isSysAdminOnly(role)
  // 교차 링크(사용자 상세의 그룹 → VM 보기 등)를 위해 기관·그룹 필터는 URL
  // 쿼리로 초기화한다. 읽기 전용 초기화만이며, 이후 필터 조작은 URL에
  // 되돌려 쓰지 않는다(의도된 절단).
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<VmStatus | undefined>(undefined)
  const [orgId, setOrgId] = useState<number | undefined>(() => idParam(searchParams.get('orgId')))
  const [groupId, setGroupId] = useState<number | undefined>(() =>
    idParam(searchParams.get('groupId')),
  )
  const [qInput, setQInput] = useState('')
  const [sort, setSort] = useState<AdminVmSort | undefined>(undefined)
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  // 작업 결과 메시지는 페이지 수준에서 관리한다 — 강제 삭제 등으로 VM이 필터된
  // 목록에서 사라져 패널이 언마운트돼도 접수 확인이 함께 사라지지 않게.
  const [message, setMessage] = useState<string | null>(null)

  const selectVm = (id: number) => {
    if (id !== selectedId) setMessage(null) // 다른 VM의 결과가 남아 오독되지 않게
    setSelectedId(id)
  }

  // 입력은 즉시 에코하되 쿼리 키는 디바운스된 값으로만 바꿔 타이핑마다
  // 요청이 나가지 않게 한다.
  const debouncedQ = useDebouncedValue(qInput).trim()
  const q = debouncedQ.length > 0 ? debouncedQ : undefined

  const vms = useQuery({
    queryKey: [
      'admin',
      'vms',
      {
        status: status ?? null,
        orgId: orgId ?? null,
        groupId: groupId ?? null,
        q: q ?? null,
        sort: sort ?? null,
        page,
        size: PAGE_SIZE,
      },
    ],
    queryFn: () => fetchAdminVms({ status, orgId, groupId, q, sort, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  const sortDirection = (key: SortKey) =>
    sort === key ? ('asc' as const) : sort === `-${key}` ? ('desc' as const) : null
  const onSort = (key: SortKey) => (next: 'asc' | 'desc' | null) => {
    setSort(next === null ? undefined : next === 'asc' ? key : (`-${key}` as AdminVmSort))
    setPage(0)
  }
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs, enabled: isSysAdmin })
  // ORG_ADMIN은 자기 기관 그룹으로 고정, SYS_ADMIN은 선택한 기관으로 좁혀진다.
  const groups = useQuery({
    queryKey: ['admin', 'groups', { orgId: orgId ?? null }],
    queryFn: () => fetchAdminGroups(orgId !== undefined ? { orgId } : {}),
  })

  const selected = vms.data?.content.find((vm) => vm.id === selectedId) ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">VM 관리</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {isSysAdmin ? '전체' : '우리 기관'} VM을 조회하고 일반 삭제 접수·취소 등 관리
          작업을 수행합니다.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="VM 상태 필터" className="flex flex-wrap gap-1">
          {STATUS_TABS.map((tab) => {
            const isSelected = tab.status === status
            return (
              <button
                key={tab.label}
                type="button"
                role="tab"
                aria-selected={isSelected}
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
            aria-label="VM 검색"
            placeholder="이름/호스트네임 검색"
            className="w-52"
            value={qInput}
            onChange={(event) => {
              setQInput(event.target.value)
              setPage(0)
            }}
          />
          {isSysAdmin && (
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              기관
              <Select
                aria-label="기관 필터"
                className="w-56"
                value={orgId ?? ''}
                onChange={(event) => {
                  setOrgId(event.target.value ? Number(event.target.value) : undefined)
                  setGroupId(undefined) // 기관이 바뀌면 이전 기관의 그룹 선택은 무효
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
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            그룹
            <Select
              aria-label="그룹 필터"
              className="w-56"
              value={groupId ?? ''}
              onChange={(event) => {
                setGroupId(event.target.value ? Number(event.target.value) : undefined)
                setPage(0)
              }}
            >
              <option value="">
                {groups.isError ? '전체 그룹 (목록 조회 실패)' : '전체 그룹'}
              </option>
              {groups.data?.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} ({group.slug})
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>

      {vms.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="VM 목록 불러오는 중" />
        </div>
      )}
      {vms.isError && <Alert variant="danger">{vms.error.message}</Alert>}
      {vms.isSuccess && vms.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          표시할 VM이 없습니다.
        </Card>
      )}
      {vms.isSuccess && vms.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <SortableTH direction={sortDirection('name')} onSort={onSort('name')}>
                    이름
                  </SortableTH>
                  <TH>상태</TH>
                  <TH>그룹</TH>
                  <TH>기관</TH>
                  <TH>사양</TH>
                  <SortableTH direction={sortDirection('endDate')} onSort={onSort('endDate')}>
                    종료일
                  </SortableTH>
                  <SortableTH
                    direction={sortDirection('createdAt')}
                    onSort={onSort('createdAt')}
                  >
                    생성일
                  </SortableTH>
                </TR>
              </THead>
              <TBody>
                {vms.data.content.map((vm) => (
                  <TR
                    key={vm.id}
                    className={cn(
                      'cursor-pointer',
                      vm.id === selectedId && 'bg-primary-50 hover:bg-primary-50',
                    )}
                    onClick={() => selectVm(vm.id)}
                  >
                    <TD>
                      {/* 키보드 사용자도 관리 작업 패널을 열 수 있게 이름은 버튼으로 */}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          selectVm(vm.id)
                        }}
                        className="cursor-pointer font-medium text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-primary-600"
                      >
                        {vm.displayName || vm.name}
                      </button>
                      {vm.displayName && (
                        <span className="ml-1 text-xs text-neutral-400">{vm.name}</span>
                      )}
                      {vm.statusDetail && (
                        <span className="mt-0.5 block max-w-xs truncate text-xs text-neutral-400">
                          {vm.statusDetail}
                        </span>
                      )}
                    </TD>
                    <TD>
                      <VmStatusBadge status={vm.status} />
                      {vm.sshGatewayBlocked && (
                        <Badge variant="danger" className="ml-1">
                          차단
                        </Badge>
                      )}
                    </TD>
                    <TD>{vm.groupName}</TD>
                    <TD>{vm.orgName ?? '—'}</TD>
                    <TD className="whitespace-nowrap">
                      {formatSpec(vm.vcpu, vm.memoryMb, vm.diskGb)}
                    </TD>
                    <TD className="whitespace-nowrap">{vm.endDate ?? '—'}</TD>
                    <TD className="whitespace-nowrap">{formatDateTime(vm.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Pagination
            page={vms.data.page}
            totalPages={vms.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      {message && <Alert variant="success">{message}</Alert>}

      <Drawer open={selected !== null} onClose={() => setSelectedId(null)} title="VM 상세">
        {selected && (
          <VmDrawerContent
            key={selected.id}
            vm={selected}
            canDelete={canDelete}
            canForceDelete={canForceDelete}
            onDone={setMessage}
            onFilterGroup={(nextGroupId) => {
              setGroupId(nextGroupId)
              setPage(0)
              setSelectedId(null)
            }}
          />
        )}
      </Drawer>
    </div>
  )
}

/* ─── 상세 드로어 본문 (행 선택 시) ─── */

function VmDrawerContent({
  vm,
  canDelete,
  canForceDelete,
  onDone,
  onFilterGroup,
}: {
  vm: VmSummary
  canDelete: boolean
  canForceDelete: boolean
  onDone: (message: string) => void
  onFilterGroup: (groupId: number) => void
}) {
  const [extendOpen, setExtendOpen] = useState(false)
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-900">{vm.displayName || vm.name}</h3>
        <div className="flex items-center gap-2">
          {vm.sshGatewayBlocked && <Badge variant="danger">SSH·터미널 차단됨</Badge>}
          <VmStatusBadge status={vm.status} />
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <Field label="이름" value={vm.name} />
        <Field label="호스트네임" value={vm.hostname} />
        <div>
          <dt className="text-neutral-500">그룹</dt>
          <dd className="font-medium text-neutral-900">
            {vm.groupName}{' '}
            <button
              type="button"
              onClick={() => onFilterGroup(vm.groupId)}
              className="cursor-pointer text-sm font-normal text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-primary-600"
            >
              이 그룹의 VM 보기
            </button>
          </dd>
        </div>
        <Field label="기관" value={vm.orgName ?? '—'} />
        <Field label="사양" value={formatSpec(vm.vcpu, vm.memoryMb, vm.diskGb)} />
        <Field label="종료일" value={vm.endDate ?? '—'} />
        <Field label="생성일" value={formatDateTime(vm.createdAt)} />
        {vm.statusDetail && <Field label="상태 상세" value={vm.statusDetail} />}
      </dl>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-800">기간 연장</h3>
        <p className="text-sm text-neutral-500">
          사용 기간을 연장합니다. 만료로 중지된 VM은 연장 후 다시 시작할 수 있습니다.
        </p>
        <Button variant="secondary" onClick={() => setExtendOpen(true)}>
          기간 연장
        </Button>
        {extendOpen && (
          <ExtendVmPeriodModal
            vm={vm}
            onClose={() => setExtendOpen(false)}
            onDone={(text) => {
              setExtendOpen(false)
              onDone(text)
            }}
          />
        )}
      </section>
      <GatewayBlockSection vm={vm} canManage={canForceDelete} onDone={onDone} />
      <ScheduleDeleteForm vm={vm} canManage={canDelete} onDone={onDone} />
      <CancelDeleteAction vm={vm} canManage={canDelete} onDone={onDone} />
      <ForceDeleteAction vm={vm} canManage={canForceDelete} onDone={onDone} />
    </div>
  )
}

/* ─── VM별 SSH·웹 터미널 차단 (수행은 SYS_ADMIN 전용, 표시는 전 관리자) ─── */

function GatewayBlockSection({
  vm,
  canManage,
  onDone,
}: {
  vm: VmSummary
  canManage: boolean
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const nextBlocked = !vm.sshGatewayBlocked

  const toggle = useMutation({
    mutationFn: () =>
      updateVmGatewayBlock(vm.id, {
        blocked: nextBlocked,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }),
    onSuccess: async () => {
      setOpen(false)
      setReason('')
      setError(null)
      onDone(nextBlocked ? 'SSH·웹 터미널 접속을 차단했습니다.' : '차단을 해제했습니다.')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'vms'] })
      await queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
    onError: (err) => {
      setError(toApiError(err, '차단 상태를 변경하지 못했습니다.').message)
    },
  })

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-800">SSH·웹 터미널 차단</h3>
      {!canManage && (
        <PermissionNotice>차단 토글은 시스템 관리자만 수행할 수 있습니다.</PermissionNotice>
      )}
      <p className="text-sm text-neutral-500">
        {vm.sshGatewayBlocked
          ? '현재 차단됨 — SSH 게이트웨이·웹 터미널 접속이 거부됩니다. 이미 열린 웹 터미널 세션은 웹 터미널 세션 화면에서 별도로 강제 종료해야 합니다.'
          : 'VM 단위 킬 스위치입니다. 차단하면 SSH 게이트웨이·웹 터미널 접속이 모두 거부됩니다. 전역 킬 스위치와 독립적으로 동작합니다.'}
      </p>
      {error && !open && <Alert variant="danger">{error}</Alert>}
      <Button
        variant={vm.sshGatewayBlocked ? 'secondary' : 'danger'}
        disabled={!canManage}
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        {vm.sshGatewayBlocked ? '차단 해제' : '접속 차단'}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={nextBlocked ? 'SSH·웹 터미널 차단' : '차단 해제'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              돌아가기
            </Button>
            <Button
              variant={nextBlocked ? 'danger' : 'primary'}
              loading={toggle.isPending}
              onClick={() => toggle.mutate()}
            >
              {nextBlocked ? '차단' : '해제'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {nextBlocked ? (
            <Alert variant="warning">
              차단 즉시 이 VM으로의 SSH 게이트웨이 라우팅과 웹 터미널 세션 생성이
              거부됩니다. 그룹 구성원에게 별도 통지는 발송되지 않습니다.
            </Alert>
          ) : (
            <p className="text-sm text-neutral-600">
              차단을 해제하면 SSH 게이트웨이·웹 터미널 접속이 다시 허용됩니다.
            </p>
          )}
          {error && <Alert variant="danger">{error}</Alert>}
          <label className="block space-y-1">
            <span className="text-sm font-medium text-neutral-700">사유 (선택)</span>
            <Textarea
              rows={2}
              value={reason}
              maxLength={200}
              onChange={(event) => setReason(event.target.value)}
              placeholder="VM 이벤트·감사 기록에 포함됩니다."
            />
          </label>
        </div>
      </Modal>
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

function ScheduleDeleteForm({
  vm,
  canManage,
  onDone,
}: {
  vm: VmSummary
  canManage: boolean
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const schedule = useMutation({
    mutationFn: () =>
      scheduleVmDeletion(vm.id, {
        // 계약의 일자 의미(KST 달력일)에 맞춰 KST 자정 instant로 변환한다.
        scheduledFor: new Date(`${date}T00:00:00+09:00`).toISOString(),
        reason,
      }),
    onSuccess: async () => {
      setError(null)
      setFieldErrors({})
      setDate('')
      setReason('')
      onDone('일반 삭제를 접수했습니다. 사용자에게 사유가 포함된 통보 메일이 발송됩니다.')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'vms'] })
      await queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
    onError: (err) => {
      const apiError = toApiError(err, '일반 삭제를 접수하지 못했습니다.')
      setFieldErrors(fieldErrorsOf(apiError.problem))
      setError(apiError.message)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    if (!date) {
      setFieldErrors({ scheduledFor: '파기 예정일을 선택해 주세요.' })
      return
    }
    if (!reason.trim()) {
      setFieldErrors({ reason: '삭제 사유를 입력해 주세요.' })
      return
    }
    schedule.mutate()
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-neutral-800">일반 삭제 접수</h3>
      {!canManage && (
        <PermissionNotice>
          일반 삭제 접수·취소는 기관 관리자·시스템 관리자만 수행할 수 있습니다.
        </PermissionNotice>
      )}
      <p className="text-sm text-neutral-500">
        최소 통보 기간(기본 7일) 이후 시각으로만 접수할 수 있으며, 접수 즉시
        사용자에게 사유가 포함된 통보 메일이 발송됩니다.
      </p>
      {error && Object.keys(fieldErrors).length === 0 && (
        <Alert variant="danger">{error}</Alert>
      )}
      <form onSubmit={submit} className="flex flex-wrap items-start gap-4" noValidate>
        <FormField label="파기 예정일" required error={fieldErrors.scheduledFor}>
          <Input
            type="date"
            min={minScheduleDate()}
            value={date}
            disabled={!canManage}
            onChange={(event) => setDate(event.target.value)}
            className="w-44"
          />
        </FormField>
        <FormField
          label="삭제 사유"
          required
          error={fieldErrors.reason}
          className="min-w-64 flex-1"
        >
          <Textarea
            rows={2}
            value={reason}
            disabled={!canManage}
            onChange={(event) => setReason(event.target.value)}
            placeholder="사용자 통보 메일에 그대로 포함됩니다."
          />
        </FormField>
        <Button
          type="submit"
          variant="danger"
          loading={schedule.isPending}
          disabled={!canManage}
          className="mt-6"
        >
          일반 삭제 접수
        </Button>
      </form>
    </section>
  )
}

function CancelDeleteAction({
  vm,
  canManage,
  onDone,
}: {
  vm: VmSummary
  canManage: boolean
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const cancel = useMutation({
    mutationFn: () => cancelScheduledVmDeletion(vm.id),
    onSuccess: async (data) => {
      setError(null)
      onDone(data.message) // kind별 결과 문구는 서버 메시지를 그대로 보여준다.
      await queryClient.invalidateQueries({ queryKey: ['admin', 'vms'] })
      await queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
    onError: (err) => setError(toApiError(err, '접수된 삭제를 취소하지 못했습니다.').message),
  })

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-neutral-800">대기 중인 삭제 취소</h3>
      <p className="text-sm text-neutral-500">
        본인 삭제 유예 중이거나 접수된 관리자 삭제를 취소합니다. 본인 삭제를 취소하면 VM은
        중지됨 상태로 남고(시작은 사용자가 수행), 관리자 삭제를 취소하면 현재 전원
        상태가 유지됩니다. 강제 삭제는 취소할 수 없습니다.
      </p>
      {error && <Alert variant="danger">{error}</Alert>}
      <Button
        variant="secondary"
        loading={cancel.isPending}
        disabled={!canManage}
        onClick={() => cancel.mutate()}
      >
        삭제 취소
      </Button>
    </section>
  )
}

function ForceDeleteAction({
  vm,
  canManage,
  onDone,
}: {
  vm: VmSummary
  canManage: boolean
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const destroy = useMutation({
    mutationFn: (confirmName: string) => forceDeleteVm(vm.id, confirmName),
    onSuccess: async (data) => {
      setOpen(false)
      setError(null)
      onDone(data.message)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'vms'] })
      await queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
    onError: async (err) => {
      // 모달을 유지해 입력한 이름을 보존하고 오류를 모달 안에 인라인으로 보여준다.
      setError(toApiError(err, '강제 삭제를 접수하지 못했습니다.').message)
      // 이름 불일치·상태 불일치(409) 등은 화면이 뒤처진 것일 수 있으니
      // 목록을 다시 불러와 낡은 상태를 치유한다 (전원 제어와 같은 패턴).
      await queryClient.invalidateQueries({ queryKey: ['admin', 'vms'] })
    },
  })

  return (
    <section className="space-y-3 rounded-lg border border-danger-200 p-4">
      <h3 className="text-sm font-semibold text-danger-700">강제 삭제</h3>
      {!canManage && (
        <PermissionNotice>강제 삭제는 시스템 관리자만 수행할 수 있습니다.</PermissionNotice>
      )}
      <p className="text-sm text-neutral-500">
        보안 사고 등 비상 상황에서 유예 없이 즉시 강제 종료하고 파기합니다. 취소할 수
        없습니다.
      </p>
      {error && !open && <Alert variant="danger">{error}</Alert>}
      <Button
        variant="danger"
        disabled={!canManage}
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        강제 삭제
      </Button>
      <ConfirmNameModal
        open={open}
        onClose={() => setOpen(false)}
        title="VM 강제 삭제"
        expectedName={vm.name}
        confirmLabel="즉시 파기"
        loading={destroy.isPending}
        // 사용자가 타이핑한 값을 그대로 confirmName으로 전송한다 — 서버가
        // 이름 정확 일치를 최종 검증한다(vm.name을 보내면 이중 확인 무력화).
        onConfirm={(typedName) => destroy.mutate(typedName)}
      >
        <Alert variant="danger" title="되돌릴 수 없는 작업입니다">
          유예 없이 즉시 강제 종료 후 파기되며, 데이터는 복구할 수 없습니다. 기관
          관리자와 사용자에게 통지되고 감사 기록이 남습니다.
        </Alert>
        {error && <Alert variant="danger">{error}</Alert>}
      </ConfirmNameModal>
    </section>
  )
}
