import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  deleteVm,
  fetchMySshKeys,
  fetchVm,
  fetchVmEvents,
  fetchVmSettings,
  forceStopVm,
  rebootVm,
  regenerateVmPassword,
  revealVmPassword,
  shutdownVm,
  startVm,
  updateVmSettings,
  type MessageResponse,
  type ProvisioningTaskView,
  type VmDeletion,
  type VmDetail,
  type VmSettingView,
  type VmStatus,
} from '../api/queries'
import { toApiError } from '../api/problem'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmNameModal,
  DdayBadge,
  GroupRoleBadge,
  Modal,
  Pagination,
  Select,
  Spinner,
  Stepper,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
  VmStatusBadge,
} from '../components/ui'
import { formatDateTime, formatDday, formatRelative, formatSpec } from '../lib/format'
import {
  DELETION_BANNER_TITLES,
  PROVISIONING_KIND_LABELS,
  VM_EVENT_LABELS,
} from '../lib/status'
import { GROUP_ROLE_LABELS, type GroupMemberRole } from '../lib/labels'
import { SshUsageGuide } from '../components/SshUsageGuide'
import { VmPublishSection } from '../components/VmPublishSection'
import { CopyButton } from '../components/CopyButton'

/** 진행 중 상태 폴링 주기 (테스트에서는 빠르게 돌려 mock 전이를 관찰한다). */
const POLL_MS = import.meta.env.MODE === 'test' ? 50 : 3000
/**
 * 사용자 조치(DNS 레코드 추가·수정)를 기다리는 상태의 완만한 폴링 주기.
 * 시스템이 수렴시키는 전이가 아니므로 서버 재검증 주기에 맞춰 느리게 돈다.
 */
const SLOW_POLL_MS = import.meta.env.MODE === 'test' ? 250 : 30_000

/** VM 상태 기준으로 폴링이 필요한 상태 (비동기 전이 중). */
const POLLING_VM_STATUSES: VmStatus[] = ['CREATING', 'DELETING', 'REBOOTING']
/** provisioning 태스크 기준으로 폴링이 필요한 상태. */
const ACTIVE_TASK_STATUSES: ProvisioningTaskView['status'][] = [
  'PENDING',
  'RUNNING',
  'RETRYING',
]

const EVENTS_PAGE_SIZE = 10

export function VmDetailPage() {
  const params = useParams()
  const vmId = Number(params.vmId)
  const vm = useQuery({
    queryKey: ['vms', vmId],
    queryFn: () => fetchVm(vmId),
    // 생성/삭제/재부팅 등 비동기 전이 중에는 서버 상태를 주기적으로 반영한다.
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      const activeTask =
        data.provisioning != null &&
        ACTIVE_TASK_STATUSES.includes(data.provisioning.status)
      // 공개 라우트 적용·도메인 검증·인증서 발급도 비동기이므로 진행 중이면 폴링한다.
      // 시스템이 곧 수렴시키는 전이(라우트 적용 대기, 인증서 갱신)는 빠르게,
      // 사용자 DNS 조치를 기다리는 상태(커스텀 도메인 검증 대기·실패)는 완만하게.
      const pub = data.publication
      const route = pub?.route ?? null
      // 검증이 끝난(또는 검증이 필요 없는) 공개의 라우트가 아직 없거나 PENDING이면
      // proxy 적용이 진행 중이다 — 접수 직후 과도기(route 미생성)도 포함.
      const applying =
        pub != null &&
        (route == null || route.status === 'PENDING') &&
        (pub.domain.kind !== 'CUSTOM' || pub.domain.status === 'ACTIVE')
      const systemProgress =
        pub != null && (applying || pub.certificate?.status === 'RENEWING')
      // 커스텀 도메인이 검증을 통과하지 못한 상태 — DNS 레코드 추가·전파라는
      // 사용자 조치를 기다리므로 무한 3초 폴링 대신 느린 주기로 갱신한다.
      const awaitingUserDns =
        pub != null &&
        pub.domain.kind === 'CUSTOM' &&
        (pub.domain.status === 'PENDING' ||
          pub.domain.status === 'VERIFYING' ||
          pub.domain.status === 'FAILED')
      if (POLLING_VM_STATUSES.includes(data.status) || activeTask || systemProgress) {
        return POLL_MS
      }
      return awaitingUserDns ? SLOW_POLL_MS : false
    },
  })

  if (vm.isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="VM 정보 불러오는 중" />
      </div>
    )
  }
  if (vm.isError) {
    return <Alert variant="danger">{vm.error.message}</Alert>
  }

  const data = vm.data
  const dday = data.endDate ? formatDday(data.endDate) : null
  // 만료 자동 정지 안내: 스위퍼가 정지했거나(endDate 경과 + STOPPED) 만료 마커가 남아 있는 경우.
  const expiredStopped =
    data.expiryStoppedAt != null ||
    (dday != null && dday.daysLeft < 0 && data.status === 'STOPPED')

  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link to="/console/vms" className="text-primary-700 hover:underline">
          ← 내 VM
        </Link>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-neutral-900">{data.name}</h1>
            <VmStatusBadge status={data.status} />
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            {data.hostname} · {data.groupName}
          </p>
        </div>
        <PowerControls vm={data} />
      </div>

      {data.status === 'CREATING' && (
        <Alert variant="info">
          VM을 생성하고 있습니다. 생성이 끝나면 상태가 자동으로 갱신됩니다.
        </Alert>
      )}
      {data.status === 'NEEDS_ADMIN' && (
        <Alert variant="warning" title="관리자 확인 중입니다">
          작업 처리 중 문제가 발생해 관리자가 원인을 확인하고 있습니다. 복구될 때까지
          전원 제어·삭제 등 모든 조작이 제한됩니다.
        </Alert>
      )}
      {data.status === 'DELETED' && (
        <Alert variant="info">이 VM은 삭제되었습니다. 기록 조회만 가능합니다.</Alert>
      )}
      {data.statusDetail && <Alert variant="warning">{data.statusDetail}</Alert>}
      {expiredStopped && (
        <Alert variant="warning" title="사용 기간 만료">
          사용 기간이 만료되어 중지되었습니다. 연장이 필요하면 관리자에게 문의해 주세요.
        </Alert>
      )}
      {data.deletion && data.status !== 'DELETED' && (
        <DeletionBanner deletion={data.deletion} />
      )}

      <SshAccessSection vm={data} />

      <VmPasswordSection vm={data} />

      {data.provisioning && <ProvisioningPanel task={data.provisioning} />}

      <Card>
        <CardHeader>
          <CardTitle>VM 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <Field label="사양">{formatSpec(data.vcpu, data.memoryMb, data.diskGb)}</Field>
            <Field label="그룹">{data.groupName}</Field>
            <Field label="내부 IP">{data.ipAddress ?? '할당 전'}</Field>
            <Field label="SSH 계정">{data.sshUsername}</Field>
            <Field label="사용 기간">
              {data.startDate ?? '미지정'} ~ {data.endDate ?? '미지정'}
              {data.endDate && dday && dday.daysLeft <= 7 && (
                <DdayBadge endDate={data.endDate} className="ml-2" />
              )}
            </Field>
            <Field label="생성 신청">
              <Link
                to={`/console/requests/${data.requestId}`}
                className="text-primary-700 hover:underline"
              >
                신청 #{data.requestId}
              </Link>
            </Field>
            <Field label="생성일">{formatDateTime(data.createdAt)}</Field>
            <Field label="마지막 갱신">{formatDateTime(data.updatedAt)}</Field>
          </dl>
        </CardContent>
      </Card>

      <VmSettingsSection vm={data} />

      <VmPublishSection vm={data} />

      <DeleteSection vm={data} />

      <VmEventsSection vmId={vmId} />
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutral-800">{children}</dd>
    </div>
  )
}

/* ─── 전원 제어 ─── */

type PowerAction = 'start' | 'shutdown' | 'reboot' | 'forceStop'

interface PowerActionConfig {
  label: string
  /** 계약의 409 조건과 정합: 이 상태에서만 버튼을 노출한다. */
  allowed: (status: VmStatus) => boolean
  run: (vmId: number) => Promise<MessageResponse>
  confirmTitle: string
  confirmBody: string
  /** 확인 모달에 danger Alert로 표시할 경고 (강제 종료 등). */
  warning?: string
  danger?: boolean
}

const POWER_ACTIONS: Record<PowerAction, PowerActionConfig> = {
  start: {
    label: '시작',
    allowed: (status) => status === 'STOPPED',
    run: startVm,
    confirmTitle: 'VM 시작',
    confirmBody: 'VM을 시작하시겠습니까? 잠시 후 실행 중 상태로 바뀝니다.',
  },
  shutdown: {
    label: '종료',
    allowed: (status) => status === 'RUNNING',
    run: shutdownVm,
    confirmTitle: 'VM 종료',
    confirmBody:
      'VM에 종료(ACPI) 신호를 보냅니다. 게스트 OS가 응답하지 않으면 종료가 실패할 수 있으며, 그 경우 강제 종료를 이용해야 합니다.',
  },
  reboot: {
    label: '재부팅',
    allowed: (status) => status === 'RUNNING',
    run: rebootVm,
    confirmTitle: 'VM 재부팅',
    confirmBody: 'VM을 재부팅하시겠습니까? 재부팅하는 동안 접속이 잠시 끊깁니다.',
  },
  forceStop: {
    label: '강제 종료',
    allowed: (status) => status === 'RUNNING' || status === 'REBOOTING',
    run: forceStopVm,
    confirmTitle: 'VM 강제 종료',
    confirmBody:
      '전원 차단에 해당하는 강제 종료를 수행합니다. 종료가 응답하지 않을 때만 사용하세요.',
    warning:
      '디스크 쓰기 중 강제 종료하면 파일 시스템과 데이터가 손상될 수 있습니다.',
    danger: true,
  },
}

function PowerControls({ vm }: { vm: VmDetail }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [confirming, setConfirming] = useState<PowerAction | null>(null)
  const [error, setError] = useState<string | null>(null)

  const power = useMutation({
    mutationFn: (action: PowerAction) => POWER_ACTIONS[action].run(vm.id),
    onSuccess: async (data) => {
      setConfirming(null)
      setError(null)
      // 전이 반영은 상태 배지가 담당하므로 접수 안내는 일시 토스트면 충분하다.
      toast.success(data.message)
      await queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
    onError: async (err) => {
      setConfirming(null)
      setError(toApiError(err, 'VM 전원 제어 요청에 실패했습니다.').message)
      // 409(상태 불일치) 등은 화면이 뒤처진 것이므로 최신 상태를 다시 불러온다.
      await queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })

  const visibleActions = (Object.keys(POWER_ACTIONS) as PowerAction[]).filter((action) =>
    POWER_ACTIONS[action].allowed(vm.status),
  )
  const active = confirming ? POWER_ACTIONS[confirming] : null

  if (visibleActions.length === 0 && !error) return null

  return (
    <div className="flex flex-col items-end gap-2">
      {visibleActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visibleActions.map((action) => {
            const config = POWER_ACTIONS[action]
            return (
              <Button
                key={action}
                variant={config.danger ? 'danger' : 'secondary'}
                size="sm"
                onClick={() => setConfirming(action)}
              >
                {config.label}
              </Button>
            )
          })}
        </div>
      )}
      {error && (
        <Alert variant="danger" className="w-full sm:w-auto">
          {error}
        </Alert>
      )}

      {active && confirming && (
        <Modal
          open
          onClose={() => setConfirming(null)}
          title={active.confirmTitle}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(null)}>
                돌아가기
              </Button>
              <Button
                variant={active.danger ? 'danger' : 'primary'}
                loading={power.isPending}
                onClick={() => power.mutate(confirming)}
              >
                {active.label}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-neutral-600">{active.confirmBody}</p>
            {active.warning && <Alert variant="danger">{active.warning}</Alert>}
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ─── SSH 접속 안내 ─── */

/** SSH 접속 명령·사용법 안내. 키가 하나도 없으면 접속 불가 경고 + 등록 유도. */
function SshAccessSection({ vm }: { vm: VmDetail }) {
  const keys = useQuery({ queryKey: ['me', 'ssh-keys'], queryFn: fetchMySshKeys })
  const command = `ssh ${vm.hostname}@${vm.sshHost}`
  const noKeys = keys.isSuccess && keys.data.length === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>SSH 접속</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {noKeys && (
          <Alert variant="warning" title="SSH 키가 등록되어 있지 않습니다">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>SSH 키가 등록되어 있지 않아 접속할 수 없습니다.</p>
              <Link
                to="/console/ssh-keys"
                className="font-medium text-primary-700 hover:underline"
              >
                SSH 키 등록하기 →
              </Link>
            </div>
          </Alert>
        )}
        <div className="flex items-center justify-between gap-3">
          <code className="overflow-x-auto rounded-md bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-100">
            {command}
          </code>
          <CopyButton value={command} label="복사" />
        </div>
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-primary-700 hover:underline">
            접속 방법 보기
          </summary>
          <div className="mt-3">
            <SshUsageGuide hostname={vm.hostname} sshHost={vm.sshHost} />
          </div>
        </details>
      </CardContent>
    </Card>
  )
}

/* ─── VM 비밀번호 (상시 재열람 + 재생성) ─── */

/** 계약상 열람이 허용되는 상태 (그 외는 409). */
const PASSWORD_VIEWABLE_STATUSES: VmStatus[] = ['RUNNING', 'STOPPED', 'REBOOTING']

/**
 * 재생성은 EDITOR 이상 권한이 필요하다 (계약). 관리자 경로의 VM 상세는
 * 그룹 역할이 없어(myGroupRole null) 편집 불가로 취급한다.
 */
function canEditVm(role: GroupMemberRole | null | undefined): boolean {
  return role === 'EDITOR' || role === 'OWNER'
}

function VmPasswordSection({ vm }: { vm: VmDetail }) {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 평문 비밀번호는 뮤테이션 상태(메모리)에만 존재한다 — 웹 스토리지에 저장하지 않는다.
  // gcTime: 0 — 모달을 닫으면 평문을 보유한 Mutation 객체가 즉시 GC 되게 한다.
  const reveal = useMutation({
    gcTime: 0,
    mutationFn: () => revealVmPassword(vm.id),
    onError: async (err) => {
      setModalOpen(false)
      setError(toApiError(err, '비밀번호를 열람하지 못했습니다.').message)
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
    },
  })

  const regenerate = useMutation({
    gcTime: 0,
    mutationFn: () => regenerateVmPassword(vm.id),
    onSuccess: async () => {
      setConfirmRegen(false)
      setError(null)
      setModalOpen(true)
      // 재생성으로 passwordAvailable이 true가 되므로 상세를 갱신한다.
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
    },
    onError: async (err) => {
      setConfirmRegen(false)
      setError(toApiError(err, '비밀번호를 재생성하지 못했습니다.').message)
      await queryClient.invalidateQueries({ queryKey: ['vms', vm.id] })
    },
  })

  // 열람 성공이면 reveal, 재생성 성공이면 regenerate의 결과를 표시한다.
  const result = regenerate.data ?? reveal.data ?? null

  const close = () => {
    setModalOpen(false)
    reveal.reset()
    regenerate.reset() // 평문을 메모리에서 즉시 폐기한다.
  }

  const openReveal = () => {
    setError(null)
    regenerate.reset()
    setModalOpen(true)
    reveal.mutate()
  }

  const editable = canEditVm(vm.myGroupRole)
  const canRegenerate = editable && vm.status === 'RUNNING'
  const viewable = PASSWORD_VIEWABLE_STATUSES.includes(vm.status)

  // 표시할 내용이 없으면 (열람 불가 상태 + 저장 없음 + 재생성 불가) 섹션을 숨긴다.
  if (!modalOpen && !error && !viewable && !canRegenerate) return null
  if (!modalOpen && !error && !vm.passwordAvailable && !canRegenerate) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>VM 비밀번호</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert variant="warning">{error}</Alert>}

        {vm.passwordAvailable && vm.passwordRevealAllowed && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-600">
              비밀번호는 VM 내부 sudo 자격입니다. 언제든 다시 확인할 수 있습니다.
            </p>
            <Button size="sm" onClick={openReveal} disabled={!viewable}>
              비밀번호 보기
            </Button>
          </div>
        )}

        {vm.passwordAvailable && !vm.passwordRevealAllowed && (
          <Alert variant="info">
            이 VM은 비밀번호 열람이 제한되어 있습니다. 열람하려면 더 높은 그룹
            역할이 필요합니다.
          </Alert>
        )}

        {!vm.passwordAvailable && (
          <Alert variant="info">
            저장된 비밀번호가 없습니다.
            {canRegenerate
              ? ' 아래 재생성으로 새 비밀번호를 만들 수 있습니다.'
              : ' 비밀번호 재생성은 그룹의 편집자 이상만 할 수 있습니다.'}
          </Alert>
        )}

        {editable && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3">
            <p className="text-sm text-neutral-600">
              분실했거나 회수가 필요하면 비밀번호를 재생성할 수 있습니다.
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setError(null)
                setConfirmRegen(true)
              }}
              disabled={vm.status !== 'RUNNING'}
            >
              비밀번호 재생성
            </Button>
          </div>
        )}
      </CardContent>

      {/* 열람/재생성 결과 공용 모달 */}
      <Modal
        open={modalOpen}
        onClose={close}
        title="VM 비밀번호"
        footer={
          <Button variant="secondary" onClick={close}>
            닫기
          </Button>
        }
      >
        {result ? (
          <div className="space-y-4">
            <dl className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <dt className="text-xs font-medium text-neutral-500">SSH 계정</dt>
                  <dd className="mt-0.5 font-mono text-sm text-neutral-900">
                    {result.sshUsername}
                  </dd>
                </div>
                <CopyButton value={result.sshUsername} label="계정 복사" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <dt className="text-xs font-medium text-neutral-500">비밀번호</dt>
                  <dd className="mt-0.5 font-mono text-sm break-all text-neutral-900">
                    {result.password}
                  </dd>
                </div>
                <CopyButton value={result.password} label="비밀번호 복사" />
              </div>
            </dl>
            <p className="text-xs text-neutral-500">
              비밀번호는 언제든 이 화면에서 다시 확인할 수 있습니다. 게스트 안에서
              직접 변경했다면 저장된 값은 실제와 달라질 수 있으며, 그 경우
              재생성으로 복구합니다.
            </p>
          </div>
        ) : (
          <div className="flex justify-center py-6">
            <Spinner label="비밀번호 불러오는 중" />
          </div>
        )}
      </Modal>

      {/* 재생성 확인 모달 */}
      <Modal
        open={confirmRegen}
        onClose={() => setConfirmRegen(false)}
        title="비밀번호 재생성"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmRegen(false)}>
              취소
            </Button>
            <Button
              variant="danger"
              loading={regenerate.isPending}
              onClick={() => regenerate.mutate()}
            >
              재생성
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Alert variant="danger">기존 비밀번호가 즉시 무효화됩니다.</Alert>
          <p className="text-sm text-neutral-600">
            새 비밀번호는 시스템이 생성합니다. 실행 중인 VM에 즉시 적용되며,
            구성원 제거 후 이전 비밀번호를 아는 사람의 접근을 회수하는 수단입니다.
          </p>
        </div>
      </Modal>
    </Card>
  )
}

/* ─── VM별 설정 (M5.5, 편집자 이상) ─── */

function VmSettingsSection({ vm }: { vm: VmDetail }) {
  // 편집 권한이 없거나 삭제 중/삭제된 VM에는 설정 영역을 노출하지 않는다.
  if (!canEditVm(vm.myGroupRole)) return null
  if (vm.status === 'DELETING' || vm.status === 'DELETED') return null
  return <VmSettingsCard vm={vm} />
}

function VmSettingsCard({ vm }: { vm: VmDetail }) {
  const settings = useQuery({
    queryKey: ['vms', vm.id, 'settings'],
    queryFn: () => fetchVmSettings(vm.id),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>VM 설정</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings.isPending && (
          <div className="flex justify-center py-6">
            <Spinner label="설정 불러오는 중" />
          </div>
        )}
        {settings.isError && <Alert variant="danger">{settings.error.message}</Alert>}
        {settings.isSuccess && (
          <>
            <ul className="divide-y divide-neutral-100">
              {settings.data.map((setting) => (
                <li key={setting.key} className="py-4 first:pt-0 last:pb-0">
                  <VmSettingRow vmId={vm.id} setting={setting} />
                </li>
              ))}
            </ul>
            <p className="text-xs text-neutral-500">
              설정 변경은 모두 감사 로그에 기록됩니다.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function VmSettingRow({ vmId, setting }: { vmId: number; setting: VmSettingView }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  // ssh_password_enabled를 켜는 방향은 2차 경고 후에만 적용한다.
  const [confirmEnable, setConfirmEnable] = useState(false)

  const save = useMutation({
    mutationFn: (value: unknown) => updateVmSettings(vmId, { [setting.key]: value }),
    onSuccess: async (updated) => {
      setConfirmEnable(false)
      setError(null)
      queryClient.setQueryData(['vms', vmId, 'settings'], updated)
      toast.success(`'${setting.label}' 설정을 변경했습니다.`)
      // password_reveal_min_role 변경은 passwordRevealAllowed에 영향 → 상세도 갱신.
      await queryClient.invalidateQueries({ queryKey: ['vms', vmId] })
    },
    onError: (err) => {
      setConfirmEnable(false)
      setError(toApiError(err, '설정을 변경하지 못했습니다.').message)
    },
  })

  const requiredLabel = GROUP_ROLE_LABELS[setting.requiredRole]

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-900">{setting.label}</p>
          <p className="mt-0.5 text-xs text-neutral-500">{setting.description}</p>
        </div>
        <div className="shrink-0">
          <VmSettingControl
            setting={setting}
            pending={save.isPending}
            onChange={(value) => {
              setError(null)
              // ssh_password_enabled OFF→ON은 경고 모달로 게이트.
              if (setting.key === 'ssh_password_enabled' && value === true) {
                setConfirmEnable(true)
                return
              }
              save.mutate(value)
            }}
          />
        </div>
      </div>
      {!setting.editable && (
        <p className="text-xs text-neutral-500">
          『{requiredLabel}』만 변경할 수 있습니다.
        </p>
      )}
      {(setting.updatedByName || setting.updatedAt) && (
        <p className="text-xs text-neutral-400">
          마지막 변경: {setting.updatedByName ?? '—'}
          {setting.updatedAt && ` · ${formatDateTime(setting.updatedAt)}`}
        </p>
      )}
      {error && <Alert variant="danger">{error}</Alert>}

      <Modal
        open={confirmEnable}
        onClose={() => setConfirmEnable(false)}
        title="비밀번호 SSH 허용"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmEnable(false)}>
              취소
            </Button>
            <Button variant="danger" loading={save.isPending} onClick={() => save.mutate(true)}>
              허용
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-neutral-700">
          <p>비밀번호 접속을 허용하면:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>누가 접속했는지 개인을 식별할 수 없습니다.</li>
            <li>그룹에서 제거된 구성원도 비밀번호를 아는 한 계속 접속할 수 있습니다.</li>
            <li>이 변경은 감사 기록되며 관리자에게 표시됩니다.</li>
          </ul>
        </div>
      </Modal>
    </div>
  )
}

/** 설정 값 편집 컨트롤 — BOOLEAN은 체크박스, ENUM은 select (역할 키는 한국어 라벨). */
function VmSettingControl({
  setting,
  pending,
  onChange,
}: {
  setting: VmSettingView
  pending: boolean
  onChange: (value: unknown) => void
}) {
  const disabled = !setting.editable || pending

  if (setting.valueType === 'BOOLEAN') {
    const checked = setting.value === true
    return (
      <div className="flex items-center gap-2">
        {checked ? (
          <Badge variant="success">허용</Badge>
        ) : (
          <Badge variant="neutral">차단</Badge>
        )}
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="size-4 cursor-pointer accent-primary-600 disabled:cursor-not-allowed"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            aria-label={setting.label}
          />
        </label>
      </div>
    )
  }

  // ENUM
  const isRoleEnum = setting.key === 'password_reveal_min_role'
  const current = String(setting.value)
  return (
    <div className="flex items-center gap-2">
      {isRoleEnum && <GroupRoleBadge role={current as GroupMemberRole} />}
      <Select
        className="w-40"
        value={current}
        disabled={disabled}
        aria-label={setting.label}
        onChange={(e) => onChange(e.target.value)}
      >
        {(setting.allowedValues ?? []).map((option) => (
          <option key={option} value={option}>
            {isRoleEnum ? GROUP_ROLE_LABELS[option as GroupMemberRole] : option}
          </option>
        ))}
      </Select>
    </div>
  )
}

/* ─── 삭제 예정 배너 (사용자 화면 — 취소 버튼 없음, 관리자 문의 안내) ─── */

function DeletionBanner({ deletion }: { deletion: VmDeletion }) {
  const scheduled = `${formatDateTime(deletion.scheduledFor)} (${formatRelative(deletion.scheduledFor)})`
  return (
    <Alert variant="danger" title={DELETION_BANNER_TITLES[deletion.kind]}>
      <div className="space-y-1">
        {deletion.kind === 'FORCE' ? (
          <p>보안상의 사유로 즉시 파기됩니다. 이 삭제는 취소할 수 없습니다.</p>
        ) : (
          <p>{scheduled}에 영구 파기될 예정입니다.</p>
        )}
        {deletion.reason && <p>사유: {deletion.reason}</p>}
        <p>
          삭제된 VM의 데이터는 파기 후 되돌릴 수 없습니다. 복구가 필요하면 관리자에게
          문의하세요.
        </p>
      </div>
    </Alert>
  )
}

/* ─── 삭제 (유예 후 파기 — 사용자 취소 불가) ─── */

/** 계약상 DELETE가 허용되는 상태 (409 조건과 정합). */
const DELETABLE_STATUSES: VmStatus[] = ['RUNNING', 'STOPPED', 'REBOOTING', 'ERROR']

function DeleteSection({ vm }: { vm: VmDetail }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = useMutation({
    mutationFn: () => deleteVm(vm.id),
    onSuccess: async () => {
      setOpen(false)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
    onError: async (err) => {
      setOpen(false)
      setError(toApiError(err, 'VM 삭제를 접수하지 못했습니다.').message)
      await queryClient.invalidateQueries({ queryKey: ['vms'] })
    },
  })

  const deletable = vm.deletion == null && DELETABLE_STATUSES.includes(vm.status)
  if (!deletable && !error) return null

  const isErrorVm = vm.status === 'ERROR'

  return (
    <Card className="border-danger-200">
      <CardHeader>
        <CardTitle className="text-danger-700">VM 삭제</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert variant="danger">{error}</Alert>}
        {deletable && (
          <>
            <p className="text-sm text-neutral-600">
              {isErrorVm
                ? '생성에 실패한 VM입니다. 파기할 실체가 없으므로 삭제만 가능하며, 접수 즉시 삭제됩니다.'
                : '삭제를 접수하면 VM이 종료되고 유예 기간이 지난 뒤 영구 파기됩니다. 삭제 접수 후에는 직접 취소할 수 없으며, 복구가 필요하면 관리자에게 문의해야 합니다.'}
            </p>
            <Button variant="danger" onClick={() => setOpen(true)}>
              VM 삭제
            </Button>
            <ConfirmNameModal
              open={open}
              onClose={() => setOpen(false)}
              title="VM 삭제"
              expectedName={vm.name}
              confirmLabel={isErrorVm ? '즉시 삭제' : '삭제 접수'}
              loading={remove.isPending}
              onConfirm={() => remove.mutate()}
            >
              <Alert variant="danger" title="백업 책임 안내">
                플랫폼은 VM 데이터를 백업하지 않습니다. 데이터 보호와 백업은 사용자
                책임이며, 삭제된 VM의 데이터는 복구할 수 없습니다.
              </Alert>
              <p className="text-sm text-neutral-600">
                {isErrorVm
                  ? '생성 실패 상태이므로 접수 즉시 삭제됩니다.'
                  : '삭제 접수 후에는 취소할 수 없습니다. 유예 기간 중 복구가 필요하면 관리자에게 문의하세요.'}
              </p>
            </ConfirmNameModal>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/* ─── 프로비저닝/삭제 태스크 진행 패널 ─── */

function ProvisioningPanel({ task }: { task: ProvisioningTaskView }) {
  const steps = Array.from({ length: task.totalSteps }, (_, index) => `${index + 1}단계`)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{PROVISIONING_KIND_LABELS[task.kind]} 진행 상황</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Stepper steps={steps} current={task.currentStep} hideLabels />
        <p className="text-sm text-neutral-700">
          단계 {task.currentStep + 1}/{task.totalSteps} · {task.stepLabel}
          {task.attempts > 1 && ` (시도 ${task.attempts}회)`}
        </p>
        {task.status === 'RETRYING' && (
          <Alert variant="warning" title="일시적인 오류로 재시도 중입니다">
            잠시 후 자동으로 다시 시도합니다.
            {task.lastError && ` 마지막 오류: ${task.lastError}`}
          </Alert>
        )}
        {task.status === 'NEEDS_ADMIN' && (
          <Alert variant="warning" title="관리자 개입이 필요합니다">
            재시도가 모두 실패해 관리자가 원인을 확인하고 있습니다. 복구되면 상태가
            자동으로 갱신됩니다.
            {task.lastError && ` 마지막 오류: ${task.lastError}`}
          </Alert>
        )}
        {task.status === 'FAILED' && (
          <Alert variant="danger" title="작업이 실패했습니다">
            {task.lastError ?? '자세한 내용은 관리자에게 문의해 주세요.'}
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

/* ─── 이벤트 이력 ─── */

function VmEventsSection({ vmId }: { vmId: number }) {
  const [page, setPage] = useState(0)
  const events = useQuery({
    // ['vms'] 무효화(전원/삭제 뮤테이션 후)에 함께 걸리도록 vms 하위 키를 쓴다.
    queryKey: ['vms', vmId, 'events', { page }],
    queryFn: () => fetchVmEvents(vmId, { page, size: EVENTS_PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>이벤트 이력</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {events.isPending && (
          <div className="flex justify-center py-6">
            <Spinner label="이벤트 이력 불러오는 중" />
          </div>
        )}
        {events.isError && <Alert variant="danger">{events.error.message}</Alert>}
        {events.isSuccess && events.data.content.length === 0 && (
          <p className="py-2 text-sm text-neutral-500">기록된 이벤트가 없습니다.</p>
        )}
        {events.isSuccess && events.data.content.length > 0 && (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>시각</TH>
                  <TH>이벤트</TH>
                  <TH>수행자</TH>
                  <TH>내용</TH>
                </TR>
              </THead>
              <TBody>
                {events.data.content.map((event) => (
                  <TR key={event.id}>
                    <TD className="whitespace-nowrap">{formatDateTime(event.createdAt)}</TD>
                    <TD className="whitespace-nowrap">{VM_EVENT_LABELS[event.type]}</TD>
                    <TD className="whitespace-nowrap">
                      {event.actorId == null ? '시스템' : `사용자 #${event.actorId}`}
                    </TD>
                    <TD>{event.detail ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination
              page={events.data.page}
              totalPages={events.data.totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
