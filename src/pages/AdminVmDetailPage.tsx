import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adminForceStopVm,
  adminRebootVm,
  adminShutdownVm,
  adminStartVm,
  fetchAdminVm,
  fetchAdminVmEvents,
  type MessageResponse,
  type VmDetail,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { isSysAdminOnly } from '../auth/permissions'
import { ExtendVmPeriodModal } from '../components/ExtendVmPeriodModal'
import { VmGatewayBlockSection } from '../components/VmGatewayBlockSection'
import {
  Alert,
  Badge,
  Button,
  Card,
  Modal,
  Pagination,
  Spinner,
  Table,
  TabPanel,
  Tabs,
  TBody,
  TD,
  TH,
  THead,
  TR,
  VmStatusBadge,
} from '../components/ui'
import { formatDateTime, formatSpec } from '../lib/format'
import { VM_EVENT_LABELS, type VmEventType } from '../lib/status'

const TABS = [
  { id: 'overview', label: '개요' },
  { id: 'events', label: '이벤트' },
]

/**
 * 관리자 VM 상세 — 다탭(개요·이벤트) 상세라 드로어 대신 별도 라우트.
 * 조회·전원 개입은 관리자 4역할 전부(기관 계층은 자기 기관 VM 한정 — 서버
 * 강제), 차단 토글만 SYS_ADMIN.
 */
export function AdminVmDetailPage() {
  const { vmId: vmIdParam } = useParams()
  const vmId = Number(vmIdParam)
  const { user } = useAuth()
  const isSysAdmin = !!user && isSysAdminOnly(user.role)
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const activeTab = TABS.some((tab) => tab.id === rawTab) ? rawTab! : 'overview'
  const [message, setMessage] = useState<string | null>(null)

  const detail = useQuery({
    queryKey: ['admin', 'vms', 'detail', vmId],
    queryFn: () => fetchAdminVm(vmId),
    enabled: Number.isInteger(vmId) && vmId > 0,
  })

  if (!Number.isInteger(vmId) || vmId <= 0) {
    return <Alert variant="danger">잘못된 VM 주소입니다.</Alert>
  }
  if (detail.isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="VM 상세 불러오는 중" />
      </div>
    )
  }
  if (detail.isError) {
    return <Alert variant="danger">{detail.error.message}</Alert>
  }

  const vm = detail.data
  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/vms" className="text-sm text-primary-700 hover:underline">
          ← VM 관리
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-neutral-900">{vm.displayName || vm.name}</h1>
          {vm.sshGatewayBlocked && <Badge variant="danger">SSH·터미널 차단됨</Badge>}
          <VmStatusBadge status={vm.status} />
        </div>
        {vm.statusDetail && <p className="mt-1 text-sm text-neutral-500">{vm.statusDetail}</p>}
      </div>

      {message && <Alert variant="success">{message}</Alert>}

      <Tabs
        aria-label="VM 상세 탭"
        tabs={TABS}
        value={activeTab}
        onChange={(id) => setSearchParams(id === 'overview' ? {} : { tab: id }, { replace: true })}
      />

      <TabPanel id="overview" active={activeTab === 'overview'} className="space-y-6">
        <Card className="p-5">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
            <Field label="이름" value={vm.name} />
            <Field label="호스트네임" value={vm.hostname} />
            <div>
              <dt className="text-neutral-500">워크스페이스</dt>
              <dd className="font-medium text-neutral-900">
                {vm.workspaceName}{' '}
                <Link
                  to={`/admin/vms?workspaceId=${vm.workspaceId}`}
                  className="text-sm font-normal text-primary-700 hover:underline"
                >
                  VM 보기
                </Link>
              </dd>
            </div>
            <Field label="기관" value={vm.orgName ?? '—'} />
            <Field label="사양" value={formatSpec(vm.vcpu, vm.memoryMb, vm.diskGb)} />
            <Field label="IP 주소" value={vm.ipAddress ?? '—'} />
            <Field label="게스트 계정" value={vm.sshUsername} />
            <Field
              label="사용 기간"
              value={`${vm.startDate ?? '—'} ~ ${vm.endDate ?? '—'}`}
            />
            <Field label="생성일" value={formatDateTime(vm.createdAt)} />
            <Field label="신청 ID" value={String(vm.requestId)} />
          </dl>
        </Card>

        <PowerSection vm={vm} onDone={setMessage} />
        <PeriodSection vm={vm} onDone={setMessage} />
        <VmGatewayBlockSection vm={vm} canManage={isSysAdmin} onDone={setMessage} />
      </TabPanel>

      <TabPanel id="events" active={activeTab === 'events'} className="space-y-4">
        <EventsSection vmId={vmId} />
      </TabPanel>
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

/* ─── 전원 개입 (관리자 4역할, 정지 보호 우회 — 서버 정책) ─── */

type PowerActionKey = 'start' | 'shutdown' | 'reboot' | 'forceStop'

const POWER_ACTIONS: {
  key: PowerActionKey
  label: string
  mutate: (vmId: number) => Promise<MessageResponse>
  enabledFor: (status: VmDetail['status']) => boolean
  variant: 'primary' | 'secondary' | 'danger'
  confirm: string
}[] = [
  {
    key: 'start',
    label: '시작',
    mutate: adminStartVm,
    enabledFor: (status) => status === 'STOPPED',
    variant: 'primary',
    confirm: 'VM을 시작할까요? 만료된 VM은 먼저 기간을 연장해야 합니다.',
  },
  {
    key: 'shutdown',
    label: '종료',
    mutate: adminShutdownVm,
    enabledFor: (status) => status === 'RUNNING',
    variant: 'secondary',
    confirm: '정상 종료(ACPI)를 요청할까요? 정지 보호 설정과 무관하게 수행됩니다.',
  },
  {
    key: 'reboot',
    label: '재부팅',
    mutate: adminRebootVm,
    enabledFor: (status) => status === 'RUNNING',
    variant: 'secondary',
    confirm: '재부팅을 요청할까요? 정지 보호 설정과 무관하게 수행됩니다.',
  },
  {
    key: 'forceStop',
    label: '강제 종료',
    mutate: adminForceStopVm,
    enabledFor: (status) => status === 'RUNNING' || status === 'REBOOTING',
    variant: 'danger',
    confirm: '전원을 강제로 차단할까요? 저장되지 않은 데이터는 유실될 수 있습니다.',
  },
]

function PowerSection({ vm, onDone }: { vm: VmDetail; onDone: (message: string) => void }) {
  const queryClient = useQueryClient()
  const [confirmTarget, setConfirmTarget] = useState<(typeof POWER_ACTIONS)[number] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const power = useMutation({
    mutationFn: (action: (typeof POWER_ACTIONS)[number]) => action.mutate(vm.id),
    onSuccess: async (data) => {
      setConfirmTarget(null)
      setError(null)
      onDone(data.message)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'vms'] })
    },
    onError: async (err) => {
      setConfirmTarget(null)
      setError(toApiError(err, '전원 요청을 접수하지 못했습니다.').message)
      // 상태 불일치 409는 화면이 뒤처진 것일 수 있으니 상세를 다시 불러온다.
      await queryClient.invalidateQueries({ queryKey: ['admin', 'vms'] })
    },
  })

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-800">전원 제어 (관리자 개입)</h3>
      <p className="text-sm text-neutral-500">
        워크스페이스 구성원 자격 없이 수행하는 관리자 개입입니다. 종료·재부팅·강제 종료는 정지
        보호 설정을 우회하며, 접수 전건이 감사 기록에 남습니다.
      </p>
      {error && <Alert variant="danger">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {POWER_ACTIONS.map((action) => (
          <Button
            key={action.key}
            variant={action.variant}
            disabled={!action.enabledFor(vm.status)}
            onClick={() => setConfirmTarget(action)}
          >
            {action.label}
          </Button>
        ))}
      </div>
      <Modal
        open={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        title={`VM ${confirmTarget?.label ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmTarget(null)}>
              돌아가기
            </Button>
            <Button
              variant={confirmTarget?.variant ?? 'primary'}
              loading={power.isPending}
              onClick={() => confirmTarget && power.mutate(confirmTarget)}
            >
              {confirmTarget?.label ?? ''}
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-600">{confirmTarget?.confirm}</p>
      </Modal>
    </section>
  )
}

/* ─── 기간 연장 ─── */

function PeriodSection({ vm, onDone }: { vm: VmDetail; onDone: (message: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-800">기간 연장</h3>
      <p className="text-sm text-neutral-500">
        사용 기간을 연장합니다. 만료로 중지된 VM은 연장 후 다시 시작할 수 있습니다.
      </p>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        기간 연장
      </Button>
      {open && (
        <ExtendVmPeriodModal
          vm={vm}
          onClose={() => setOpen(false)}
          onDone={(text) => {
            setOpen(false)
            onDone(text)
          }}
        />
      )}
    </section>
  )
}

/* ─── 이벤트 이력 ─── */

const EVENTS_PAGE_SIZE = 20

function EventsSection({ vmId }: { vmId: number }) {
  const [page, setPage] = useState(0)
  const events = useQuery({
    queryKey: ['admin', 'vms', 'events', vmId, { page, size: EVENTS_PAGE_SIZE }],
    queryFn: () => fetchAdminVmEvents(vmId, { page, size: EVENTS_PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  if (events.isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="이벤트 불러오는 중" />
      </div>
    )
  }
  if (events.isError) {
    return <Alert variant="danger">{events.error.message}</Alert>
  }
  if (events.data.content.length === 0) {
    return <Card className="p-8 text-center text-sm text-neutral-500">이벤트가 없습니다.</Card>
  }
  return (
    <>
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>종류</TH>
              <TH>내용</TH>
              <TH>시각</TH>
            </TR>
          </THead>
          <TBody>
            {events.data.content.map((event) => (
              <TR key={event.id}>
                <TD className="whitespace-nowrap">
                  {VM_EVENT_LABELS[event.type as VmEventType] ?? event.type}
                </TD>
                <TD className="text-neutral-600">{event.detail ?? '—'}</TD>
                <TD className="whitespace-nowrap">{formatDateTime(event.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <Pagination
        page={events.data.page}
        totalPages={events.data.totalPages}
        onPageChange={setPage}
      />
    </>
  )
}
