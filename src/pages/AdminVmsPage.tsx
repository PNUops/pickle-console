import { useState, type FormEvent } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelScheduledVmDeletion,
  emergencyDeleteVm,
  fetchAdminVms,
  fetchOrgs,
  scheduleVmDeletion,
  type VmStatus,
  type VmSummary,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmNameModal,
  FormField,
  Input,
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
  VmStatusBadge,
} from '../components/ui'
import { cn } from '../lib/cn'
import { fieldErrorsOf } from '../lib/field-errors'
import { formatDateTime, formatSpec } from '../lib/format'
import { VM_STATUS_LABELS } from '../lib/status'

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

export function AdminVmsPage() {
  const { user } = useAuth()
  const isSysAdmin = user?.role === 'SYS_ADMIN'
  const [status, setStatus] = useState<VmStatus | undefined>(undefined)
  const [orgId, setOrgId] = useState<number | undefined>(undefined)
  const [groupIdInput, setGroupIdInput] = useState('')
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const groupId = /^\d+$/.test(groupIdInput.trim())
    ? Number(groupIdInput.trim())
    : undefined

  const vms = useQuery({
    queryKey: [
      'admin',
      'vms',
      {
        status: status ?? null,
        orgId: orgId ?? null,
        groupId: groupId ?? null,
        page,
        size: PAGE_SIZE,
      },
    ],
    queryFn: () => fetchAdminVms({ status, orgId, groupId, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs, enabled: isSysAdmin })

  const selected = vms.data?.content.find((vm) => vm.id === selectedId) ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">VM 관리</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {isSysAdmin ? '전체' : '우리 기관'} VM을 조회하고 삭제 예약·취소 등 관리
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
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            그룹 ID
            <Input
              aria-label="그룹 ID 필터"
              className="w-28"
              inputMode="numeric"
              placeholder="전체"
              value={groupIdInput}
              onChange={(event) => {
                setGroupIdInput(event.target.value)
                setPage(0)
              }}
            />
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
                  <TH>이름</TH>
                  <TH>상태</TH>
                  <TH>그룹</TH>
                  <TH>사양</TH>
                  <TH>생성일</TH>
                </TR>
              </THead>
              <TBody>
                {vms.data.content.map((vm) => (
                  <TR
                    key={vm.id}
                    aria-selected={vm.id === selectedId}
                    className={cn(
                      'cursor-pointer',
                      vm.id === selectedId && 'bg-primary-50 hover:bg-primary-50',
                    )}
                    onClick={() => setSelectedId(vm.id)}
                  >
                    <TD>
                      <span className="font-medium text-primary-700">{vm.name}</span>
                      {vm.statusDetail && (
                        <span className="mt-0.5 block max-w-xs truncate text-xs text-neutral-400">
                          {vm.statusDetail}
                        </span>
                      )}
                    </TD>
                    <TD>
                      <VmStatusBadge status={vm.status} />
                    </TD>
                    <TD>{vm.groupName}</TD>
                    <TD className="whitespace-nowrap">
                      {formatSpec(vm.vcpu, vm.memoryMb, vm.diskGb)}
                    </TD>
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

      {selected && (
        <VmActionPanel key={selected.id} vm={selected} isSysAdmin={isSysAdmin} />
      )}
    </div>
  )
}

/* ─── 관리 액션 패널 (행 선택 시) ─── */

function VmActionPanel({ vm, isSysAdmin }: { vm: VmSummary; isSysAdmin: boolean }) {
  const [message, setMessage] = useState<string | null>(null)

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>
          관리 작업 — {vm.name}
        </CardTitle>
        <VmStatusBadge status={vm.status} />
      </CardHeader>
      <CardContent className="space-y-6">
        {message && <Alert variant="success">{message}</Alert>}
        <ScheduleDeleteForm vm={vm} onDone={setMessage} />
        <CancelDeleteAction vm={vm} onDone={setMessage} />
        {isSysAdmin && <EmergencyDeleteAction vm={vm} onDone={setMessage} />}
      </CardContent>
    </Card>
  )
}

/** 오늘 + 최소 통보일(기본 7일) 이후 날짜의 yyyy-mm-dd 문자열. */
function minScheduleDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  return date.toISOString().slice(0, 10)
}

function ScheduleDeleteForm({
  vm,
  onDone,
}: {
  vm: VmSummary
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
        // 로컬 자정 기준 instant로 변환해 date-time 계약을 지킨다.
        scheduledFor: new Date(`${date}T00:00:00`).toISOString(),
        reason,
      }),
    onSuccess: async () => {
      setError(null)
      setFieldErrors({})
      setDate('')
      setReason('')
      onDone('삭제 예약을 접수했습니다. 이용자에게 사유가 포함된 통보 메일이 발송됩니다.')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'vms'] })
      await queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
    onError: (err) => {
      const apiError = toApiError(err, '삭제 예약을 접수하지 못했습니다.')
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
      <h3 className="text-sm font-semibold text-neutral-800">삭제 예약</h3>
      <p className="text-sm text-neutral-500">
        최소 통보 기간(기본 7일) 이후 시각으로만 예약할 수 있으며, 예약 즉시
        이용자에게 사유가 포함된 통보 메일이 발송됩니다.
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
            onChange={(event) => setReason(event.target.value)}
            placeholder="이용자 통보 메일에 그대로 포함됩니다."
          />
        </FormField>
        <Button
          type="submit"
          variant="danger"
          loading={schedule.isPending}
          className="mt-6"
        >
          삭제 예약
        </Button>
      </form>
    </section>
  )
}

function CancelDeleteAction({
  vm,
  onDone,
}: {
  vm: VmSummary
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
    onError: (err) => setError(toApiError(err, '삭제 예약을 취소하지 못했습니다.').message),
  })

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-neutral-800">대기 중인 삭제 취소</h3>
      <p className="text-sm text-neutral-500">
        셀프 삭제 유예 중이거나 예약된 삭제를 취소합니다. 셀프 삭제를 취소하면 VM은
        중지됨 상태로 남고(전원 켜기는 이용자가 수행), 예약 삭제를 취소하면 현재 전원
        상태가 유지됩니다. 긴급 삭제는 취소할 수 없습니다.
      </p>
      {error && <Alert variant="danger">{error}</Alert>}
      <Button variant="secondary" loading={cancel.isPending} onClick={() => cancel.mutate()}>
        삭제 취소
      </Button>
    </section>
  )
}

function EmergencyDeleteAction({
  vm,
  onDone,
}: {
  vm: VmSummary
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const destroy = useMutation({
    mutationFn: (confirmName: string) => emergencyDeleteVm(vm.id, confirmName),
    onSuccess: async (data) => {
      setOpen(false)
      setError(null)
      onDone(data.message)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'vms'] })
      await queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
    onError: (err) => {
      setOpen(false)
      setError(toApiError(err, '긴급 삭제를 접수하지 못했습니다.').message)
    },
  })

  return (
    <section className="space-y-3 rounded-lg border border-danger-200 p-4">
      <h3 className="text-sm font-semibold text-danger-700">긴급 삭제 (SYS_ADMIN)</h3>
      <p className="text-sm text-neutral-500">
        보안 사고 등 긴급 상황에서 유예 없이 즉시 강제 종료하고 파기합니다. 취소할 수
        없습니다.
      </p>
      {error && <Alert variant="danger">{error}</Alert>}
      <Button variant="danger" onClick={() => setOpen(true)}>
        긴급 삭제
      </Button>
      <ConfirmNameModal
        open={open}
        onClose={() => setOpen(false)}
        title="VM 긴급 삭제"
        expectedName={vm.name}
        confirmLabel="즉시 파기"
        loading={destroy.isPending}
        onConfirm={() => destroy.mutate(vm.name)}
      >
        <Alert variant="danger" title="되돌릴 수 없는 작업입니다">
          유예 없이 즉시 강제 종료 후 파기되며, 데이터는 복구할 수 없습니다. 기관
          관리자와 이용자에게 통지되고 감사 기록이 남습니다.
        </Alert>
      </ConfirmNameModal>
    </section>
  )
}
