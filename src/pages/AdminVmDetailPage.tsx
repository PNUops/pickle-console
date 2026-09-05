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
  type VmEvent,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { canOperateVm, isSysAdminOnly, isSysTier, operatesOrg } from '../auth/permissions'
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
import { isUuid } from '../lib/validation'
import { VM_EVENT_LABELS, vmEventActorLabel, type VmEventType } from '../lib/status'
import { adminPaths } from '../lib/paths'
import { useAdminScope } from '../lib/use-admin-scope'

const TABS = [
  { id: 'overview', label: '개요' },
  { id: 'events', label: '이벤트' },
]

/**
 * 관리자 VM 상세 — 다탭(개요·이벤트) 상세라 드로어 대신 별도 라우트.
 * 전원 개입과 기간 연장은 운영 역할만(기관 계층은 자기가 운영하는 기관의 VM
 * 한정 — 서버 강제), 열람 역할은 조회만, 차단 토글은 SYS_ADMIN.
 */
export function AdminVmDetailPage() {
  const { activeOrgId } = useAdminScope()
  const { vmId: vmIdParam } = useParams()
  const vmId = vmIdParam ?? ''
  const idValid = isUuid(vmId)
  const { user } = useAuth()
  const isSysAdmin = !!user && isSysAdminOnly(user.role)
  const roleCanOperate = !!user && canOperateVm(user.role)
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const activeTab = TABS.some((tab) => tab.id === rawTab) ? rawTab! : 'overview'
  const [message, setMessage] = useState<string | null>(null)

  const detail = useQuery({
    queryKey: ['admin', 'vms', 'detail', vmId, { orgId: activeOrgId ?? null }],
    queryFn: () => fetchAdminVm(vmId),
    enabled: idValid,
  })

  if (!idValid) {
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
  if (activeOrgId != null && vm.orgId !== activeOrgId) {
    return (
      <Alert variant="danger" title="선택한 관리 범위의 가상머신이 아닙니다">
        <Link to={adminPaths.vms(activeOrgId)} className="font-medium underline">
          가상머신 목록으로 돌아가기
        </Link>
      </Alert>
    )
  }
  // 역할이 닿아도 이 VM의 기관에서 행위할 수 있어야 한다: 열람 역할로만 보이는
  // 기관의 VM에 전원이나 기간을 건드리면 API가 404로 거부한다.
  const canOperate =
    roleCanOperate &&
    !!user &&
    (isSysTier(user.role) || (vm.orgId != null && operatesOrg(user.managedOrgs, vm.orgId)))
  return (
    <div className="space-y-6">
      <div>
        <Link to={adminPaths.vms(activeOrgId)} className="text-sm text-primary-700 hover:underline">
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
        onChange={(id) => {
          const next = new URLSearchParams(searchParams)
          if (id === 'overview') next.delete('tab')
          else next.set('tab', id)
          setSearchParams(next, { replace: true })
        }}
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
                  to={adminPaths.vms(activeOrgId, vm.workspaceId)}
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

        {canOperate && <PowerSection vm={vm} onDone={setMessage} />}
        {canOperate &&
          vm.status !== 'DELETED' &&
          vm.status !== 'DELETING' &&
          vm.deletion == null && <PeriodSection vm={vm} onDone={setMessage} />}
        {isSysAdmin && vm.status !== 'DELETED' && (
          <VmGatewayBlockSection vm={vm} canManage onDone={setMessage} />
        )}
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

/* ─── 전원 개입 (운영 역할만, 정지 보호 우회 — 서버 정책) ─── */

type PowerActionKey = 'start' | 'shutdown' | 'reboot' | 'forceStop'

const POWER_ACTIONS: {
  key: PowerActionKey
  label: string
  mutate: (vmId: string) => Promise<MessageResponse>
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
    confirm:
      '전원을 강제로 차단할까요? 정지 보호 설정과 무관하게 수행되며, 저장되지 않은 데이터는 유실될 수 있습니다.',
  },
]

function PowerSection({
  vm,
  onDone,
}: {
  vm: VmDetail
  onDone: (message: string) => void
}) {
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

  const availableActions = POWER_ACTIONS.filter((action) => action.enabledFor(vm.status))
  if (availableActions.length === 0) return null

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-800">전원 제어 (관리자 개입)</h3>
      <p className="text-sm text-neutral-500">
        접수 전건이 감사 기록에 남습니다.
      </p>
      {error && <Alert variant="danger">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {availableActions.map((action) => (
          <Button
            key={action.key}
            variant={action.variant}
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

function PeriodSection({
  vm,
  onDone,
}: {
  vm: VmDetail
  onDone: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-800">기간 연장</h3>
      <p className="text-sm text-neutral-500">
        만료로 중지된 VM은 연장 후 다시 시작할 수 있습니다.
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

/**
 * 관리자 화면의 수행자 한 칸. 사용자 화면과 달리 관리자 개입도 이름이 채워져
 * 오므로(누가 개입했는지는 관리자가 알아야 한다) 이름을 그대로 쓰고, 개입임을
 * 배지로 구분한다.
 *
 * 이름이 비어서 오는 경우가 있다. 감사 로그가 열리지 않는 역할(기관 열람자)에는
 * 서버가 관리자 행의 신원을 비우고, 수행 화면이 기록되기 전 행도 마찬가지다.
 * 그때는 사용자 화면과 같은 표기만 쓴다 — 이름 자리에 "사용자"를 채우고 배지를
 * 붙이면 "사용자 [관리자]"라는 없는 사람이 생긴다.
 */
function AdminEventActor({ event }: { event: VmEvent }) {
  if (event.actorKind === 'SYSTEM') return <span className="text-neutral-500">시스템</span>
  if (event.actorName == null) {
    return <span className="text-neutral-500">{vmEventActorLabel(event)}</span>
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {event.actorName}
      {event.actorKind === 'ADMIN' && <Badge variant="warning">관리자</Badge>}
      {/* 이름은 알지만 어느 화면인지 모르는 행. 배지 없이 이름만 두면 동료가
          한 일과 화면상 구별이 안 되고, 그러면 서버가 거부한 추측을 화면이
          대신하게 된다. */}
      {event.actorKind === 'UNKNOWN' && <Badge variant="neutral">화면 미기록</Badge>}
    </span>
  )
}

function EventsSection({ vmId }: { vmId: string }) {
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
              <TH>수행자</TH>
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
                <TD className="whitespace-nowrap">
                  <AdminEventActor event={event} />
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
