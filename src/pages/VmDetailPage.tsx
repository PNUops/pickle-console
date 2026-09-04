import { Suspense, lazy, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  deleteVm,
  fetchVmSshKey,
  issueVmSshKey,
  reissueVmSshKey,
  downloadVmSshKey,
  deleteVmSshKey,
  type VmSshKeyIssueResponse,
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
  invalidateResourceLists,
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
  ErrorBoundary,
  ResourceRoleBadge,
  Input,
  Modal,
  Pagination,
  Select,
  Spinner,
  Stepper,
  TabPanel,
  Tabs,
  type TabItem,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
  VmStatusBadge,
} from '../components/ui'
import { formatDateTime, formatDday, formatSpec } from '../lib/format'
import {
  DELETION_BANNER_TITLES,
  PROVISIONING_KIND_LABELS,
  VM_EVENT_LABELS,
  vmEventActorLabel,
} from '../lib/status'
import { RESOURCE_ROLE_LABELS, type ResourceRole } from '../lib/labels'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'
import { SshUsageGuide } from '../components/SshUsageGuide'
import { VmDomainsSection } from '../components/vm-domains/VmDomainsSection'
import { domainPollRate } from '../components/vm-domains/domain-status'
import { VmPortForwardingSection } from '../components/VmPortForwardingSection'
import { VmAccessSection } from '../components/VmAccessSection'
import { VmNetworkSection } from '../components/VmNetworkSection'
import { CopyButton } from '../components/CopyButton'
import { savePem } from '../lib/download'
import { useOpenTerminalWindow } from '../terminal/useOpenTerminalWindow'

// 사용량 차트는 uPlot을 끌어오므로, 모니터링 탭을 여는 사용자에게만 로드되도록
// 코드 분할한다(상세 화면 진입 번들 경량 유지).
const VmMonitoringSection = lazy(
  () => import('../components/vm-monitoring/VmMonitoringSection'),
)

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

/**
 * VM 상세 탭 구성. 배열 순서가 렌더 순서다.
 *
 * 도메인·포트는 이 VM을 바깥에서 닿게 하는 수단을 모은 탭이고(웹 주소를 붙이는
 * HTTP 공개, 웹이 아닌 포트를 그대로 여는 포트 포워딩), 네트워크는 이 VM이 어느
 * 망에 놓이는지를 다루는 탭이다(캠퍼스 IP, 이후 방화벽·주소 설정).
 * 탭 id는 기존 `?tab=` 링크가 계속 열리도록 유지한다.
 */
const VM_TABS: TabItem[] = [
  { id: 'overview', label: '개요' },
  { id: 'monitoring', label: '모니터링' },
  { id: 'publish', label: '도메인·포트' },
  { id: 'network', label: '네트워크' },
  { id: 'access', label: '접근' },
  { id: 'settings', label: '설정' },
  { id: 'activity', label: '활동' },
]

export function VmDetailPage() {
  const params = useParams()
  const vmId = params.vmId ?? ''
  const idValid = isUuid(vmId)
  const [searchParams, setSearchParams] = useSearchParams()
  const vm = useQuery({
    queryKey: ['vms', vmId],
    queryFn: () => fetchVm(vmId),
    // 형식부터 틀린 주소는 서버에 물어볼 것이 없다.
    enabled: idValid,
    // 생성/삭제/재부팅 등 비동기 전이 중에는 서버 상태를 주기적으로 반영한다.
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      const activeTask =
        data.provisioning != null &&
        ACTIVE_TASK_STATUSES.includes(data.provisioning.status)
      // 라우트 적용·도메인 검증·인증서 발급도 비동기이므로 진행 중이면 폴링한다.
      // 어느 도메인이든 시스템이 곧 수렴시키는 전이(라우트 적용 대기, 인증서
      // 발급·갱신)가 있으면 빠르게, 사용자 DNS 조치 대기만 남았으면 완만하게.
      const domainRate = domainPollRate(data.publications)
      if (
        POLLING_VM_STATUSES.includes(data.status) ||
        activeTask ||
        domainRate === 'fast'
      ) {
        return POLL_MS
      }
      return domainRate === 'slow' ? SLOW_POLL_MS : false
    },
  })

  if (!idValid) {
    return <Alert variant="danger">{INVALID_ID_MESSAGE}</Alert>
  }
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

  // 설정 탭은 편집 권한자에게만 노출(내부 섹션 가드와 일관). 잘못된/숨김 tab 값은
  // 개요로 폴백한다(URL은 그대로 두어도 무해).
  const settingsVisible =
    data.settingsEditAllowed &&
    data.status !== 'DELETING' &&
    data.status !== 'DELETED'
  // 접근 탭은 이 VM의 접근 권한을 관리할 수 있는 사람에게만 — 리소스 소유자와
  // 워크스페이스 소유자다.
  const accessVisible = data.accessManageAllowed && data.status !== 'DELETED'
  // 삭제 중·삭제된 VM은 하이퍼바이저에 물어볼 실체가 사라지는 중이거나 없으므로
  // 사용량 탭을 감춘다 — 그대로 두면 사라진 게스트를 30초마다 조회해 실패한다.
  const monitoringVisible = data.status !== 'DELETING' && data.status !== 'DELETED'
  const tabs = VM_TABS.filter((tab) => {
    if (tab.id === 'settings') return settingsVisible
    if (tab.id === 'access') return accessVisible
    if (tab.id === 'monitoring') return monitoringVisible
    return true
  })
  const rawTab = searchParams.get('tab')
  const activeTab = tabs.some((tab) => tab.id === rawTab) ? rawTab! : 'overview'
  const selectTab = (id: string) => {
    // 탭 전환(키보드 화살표 포함)마다 히스토리가 쌓이지 않게 replace.
    setSearchParams(id === 'overview' ? {} : { tab: id }, { replace: true })
  }

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
            <h1 className="text-2xl font-bold text-neutral-900">
              {data.displayName || data.name}
            </h1>
            <VmStatusBadge status={data.status} />
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            {data.displayName && <span>{data.name} · </span>}
            {data.hostname} · {data.workspaceName}
          </p>
        </div>
        <PowerControls vm={data} />
      </div>

      {data.status === 'CREATING' && (
        <Alert variant="info">생성이 끝나면 상태가 자동으로 갱신됩니다.</Alert>
      )}
      {data.status === 'NEEDS_ADMIN' && (
        <Alert variant="warning" title="관리자 확인 중입니다">
          복구될 때까지 전원 제어·삭제 등 모든 조작이 제한됩니다.
        </Alert>
      )}
      {data.status === 'DELETED' && (
        <Alert variant="info">기록 조회만 가능합니다.</Alert>
      )}
      {/* 정상 실행 중에는 지난 작업 메시지(예: "프로비저닝 완료")를 경고로 띄우지 않는다. */}
      {data.statusDetail && data.status !== 'RUNNING' && (
        <Alert variant="warning">{data.statusDetail}</Alert>
      )}
      {expiredStopped && (
        <Alert variant="warning" title="사용 기간 만료">
          연장이 필요하면 관리자에게 문의해 주세요.
        </Alert>
      )}
      {data.deletion && data.status !== 'DELETED' && (
        <DeletionBanner deletion={data.deletion} />
      )}

      {data.provisioning && <ProvisioningPanel task={data.provisioning} />}

      <Tabs tabs={tabs} value={activeTab} onChange={selectTab} aria-label="VM 상세 영역" />

      <TabPanel id="overview" active={activeTab === 'overview'} className="space-y-6">
        <SshAccessSection vm={data} />
        <VmPasswordSection vm={data} />
        <Card>
          <CardHeader>
            <CardTitle>VM 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <Field label="사양">{formatSpec(data.vcpu, data.memoryMb, data.diskGb)}</Field>
              <Field label="워크스페이스">{data.workspaceName}</Field>
              <Field label="내부 IP">{data.ipAddress ?? '할당 전'}</Field>
              <Field label="SSH 계정">{data.sshUsername}</Field>
              <Field label="사용 기간">
                {data.startDate ?? '미지정'} ~ {data.endDate ?? '미지정'}
                {data.endDate && dday && dday.daysLeft <= 7 && (
                  <DdayBadge endDate={data.endDate} className="ml-2" />
                )}
              </Field>
              <Field label="생성 신청">
                {/* 신청 행이 사라진 VM은 가리킬 곳이 없다. 링크 이름에 식별자를
                    넣지 않는 것은 그것이 UUID여서 읽는 사람에게 알려주는 것이
                    없기 때문이다. */}
                {data.requestId == null ? (
                  '—'
                ) : (
                  <Link
                    to={`/console/requests/${data.requestId}`}
                    className="text-primary-700 hover:underline"
                  >
                    신청 상세
                  </Link>
                )}
              </Field>
              <Field label="생성일">{formatDateTime(data.createdAt)}</Field>
              <Field label="마지막 갱신">{formatDateTime(data.updatedAt)}</Field>
            </dl>
          </CardContent>
        </Card>
      </TabPanel>

      <TabPanel id="monitoring" active={activeTab === 'monitoring'} className="space-y-6">
        <ErrorBoundary label="사용량">
          <Suspense
            fallback={
              <div className="flex justify-center py-12">
                <Spinner label="사용량 화면 불러오는 중" />
              </div>
            }
          >
            <VmMonitoringSection vmId={vmId} />
          </Suspense>
        </ErrorBoundary>
      </TabPanel>

      <TabPanel id="publish" active={activeTab === 'publish'} className="space-y-6">
        <VmDomainsSection vm={data} />
        <VmPortForwardingSection vm={data} />
      </TabPanel>

      <TabPanel id="network" active={activeTab === 'network'} className="space-y-6">
        <VmNetworkSection vm={data} />
      </TabPanel>

      <TabPanel id="access" active={activeTab === 'access'} className="space-y-6">
        <VmAccessSection vmId={data.id} />
      </TabPanel>

      <TabPanel id="settings" active={activeTab === 'settings'} className="space-y-6">
        <VmSettingsSection vm={data} />
        <DeleteSection vm={data} />
      </TabPanel>

      <TabPanel id="activity" active={activeTab === 'activity'} className="space-y-6">
        <VmEventsSection vmId={vmId} />
      </TabPanel>
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
  run: (vmId: string) => Promise<MessageResponse>
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
    confirmBody: '잠시 후 실행 중 상태로 바뀝니다.',
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
    confirmBody: '재부팅하는 동안 접속이 잠시 끊깁니다.',
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
      await invalidateResourceLists(queryClient)
    },
    onError: async (err) => {
      setConfirming(null)
      setError(toApiError(err, 'VM 전원 제어 요청에 실패했습니다.').message)
      // 409(상태 불일치) 등은 화면이 뒤처진 것이므로 최신 상태를 다시 불러온다.
      await invalidateResourceLists(queryClient)
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

/** 웹 터미널을 열 수 있는 조건: RUNNING VM + 접속 권한(서버 판정). */
function canUseTerminal(vm: VmDetail): boolean {
  return vm.status === 'RUNNING' && vm.accessAllowed
}

/**
 * 접속 카드 — 웹 터미널과 SSH 클라이언트, 두 경로를 나란히 놓는다.
 *
 * 둘의 자격은 같은 선(리소스 MEMBER 이상)에서 갈리고, 이제는 SSH 키까지 VM
 * 단위라 "접속 자격은 전부 VM 단위"가 한 문장으로 성립한다. 사용자가 가장 많이
 * 헷갈리는 지점은 "웹 터미널에도 .pem이 필요한가"이므로 그 줄에 아니라고 적는다.
 */
function SshAccessSection({ vm }: { vm: VmDetail }) {
  const queryClient = useQueryClient()
  const openTerminal = useOpenTerminalWindow()
  const toast = useToast()
  const [confirmReissue, setConfirmReissue] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const keyQuery = useQuery({
    queryKey: ['vms', vm.id, 'ssh-key'],
    queryFn: () => fetchVmSshKey(vm.id),
    enabled: vm.accessAllowed,
  })
  const key = keyQuery.data?.key ?? null
  const keyFile = key?.fileName ?? `pickle-${vm.hostname}.pem`
  // IdentitiesOnly belongs on the one-liner too, not only in the config block:
  // -i adds a key, it does not stop the agent's keys being offered first, and a
  // person with several VMs has several keys.
  const command =
    `ssh -i ~/.ssh/${keyFile} -o IdentitiesOnly=yes ${vm.hostname}@${vm.sshHost}`

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['vms', vm.id, 'ssh-key'] })

  // 개인키는 응답에서 곧바로 파일로 흘려보내고 상태에 담지 않는다.
  const saveFrom = (res: VmSshKeyIssueResponse, message: string) => {
    savePem(res.privateKey, res.fileName)
    toast.success(message)
  }


  const issue = useMutation({
    gcTime: 0,
    mutationFn: () => issueVmSshKey(vm.id),
    onSuccess: async (res) => {
      setError(null)
      saveFrom(res, '개인키를 내려받았습니다. 안전한 곳에 보관해 주세요.')
      // The plaintext sits in the mutation result until it is reset; once it is
      // a file on disk there is no reason to keep a copy in memory.
      issue.reset()
      await refresh()
    },
    onError: (err) => setError(toApiError(err, 'SSH 키를 발급하지 못했습니다.').message),
  })

  const download = useMutation({
    gcTime: 0,
    mutationFn: () => downloadVmSshKey(vm.id),
    onSuccess: (res) => {
      setError(null)
      saveFrom(res, '개인키를 다시 내려받았습니다. 다운로드는 기록에 남습니다.')
      download.reset()
    },
    onError: (err) => setError(toApiError(err, '개인키를 다운로드하지 못했습니다.').message),
  })

  const reissue = useMutation({
    gcTime: 0,
    mutationFn: () => reissueVmSshKey(vm.id),
    onSuccess: async (res) => {
      setError(null)
      setConfirmReissue(false)
      saveFrom(res, '새 개인키를 내려받았습니다. 이전 키로는 접속할 수 없습니다.')
      reissue.reset()
      await refresh()
    },
    onError: (err) => {
      setConfirmReissue(false)
      setError(toApiError(err, 'SSH 키를 재발급하지 못했습니다.').message)
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteVmSshKey(vm.id),
    onSuccess: async () => {
      setError(null)
      setConfirmDelete(false)
      await refresh()
    },
    onError: (err) => {
      setConfirmDelete(false)
      setError(toApiError(err, 'SSH 키를 삭제하지 못했습니다.').message)
    },
  })

  const busy = issue.isPending || download.isPending || reissue.isPending || remove.isPending

  // 서버가 접속 불가로 판정한 사람에게 접속 방법을 보여줄 이유가 없다.
  if (!vm.accessAllowed) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>접속</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && <Alert variant="danger">{error}</Alert>}

        {/* ① 브라우저 */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-neutral-900">웹 터미널</p>
            <p className="mt-0.5 text-sm text-neutral-500">
              {canUseTerminal(vm)
                ? '키 파일 없이 브라우저에서 바로 셸을 엽니다. 별도 창으로 열립니다.'
                : '가상머신이 실행 중일 때만 열 수 있습니다.'}
            </p>
          </div>
          <Button
            size="sm"
            disabled={!canUseTerminal(vm)}
            onClick={() =>
              openTerminal({ vmId: vm.id, label: vm.displayName || vm.name, name: vm.name })
            }
          >
            웹 터미널 열기
          </Button>
        </div>

        <hr className="border-neutral-200" />

        {/* ② SSH 클라이언트 */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-neutral-900">SSH 클라이언트</p>
            <p className="mt-0.5 text-sm text-neutral-500">
              이 가상머신 전용 개인키로 접속합니다. 다른 가상머신에는 쓸 수 없습니다.
            </p>
          </div>

          {keyQuery.isPending ? (
            <p className="text-sm text-neutral-500">키 정보를 불러오는 중…</p>
          ) : key ? (
            <>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="text-neutral-500">지문</dt>
                <dd className="flex items-center gap-2">
                  <span className="font-mono text-xs break-all">{key.fingerprint}</span>
                  <CopyButton value={key.fingerprint} label="복사" />
                </dd>
                <dt className="text-neutral-500">발급</dt>
                <dd>{formatDateTime(key.createdAt)}</dd>
                <dt className="text-neutral-500">마지막 사용</dt>
                <dd>{key.lastUsedAt ? formatDateTime(key.lastUsedAt) : '사용 기록 없음'}</dd>
              </dl>

              <div className="flex items-center justify-between gap-3">
                <code className="overflow-x-auto rounded-md bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-100">
                  {command}
                </code>
                <CopyButton value={command} label="복사" />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={busy}
                        onClick={() => download.mutate()}>
                  개인키 다시 받기
                </Button>
                <Button size="sm" variant="secondary" disabled={busy}
                        onClick={() => setConfirmReissue(true)}>
                  키 재발급
                </Button>
                <Button size="sm" variant="ghost" disabled={busy}
                        onClick={() => setConfirmDelete(true)}>
                  키 삭제
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-neutral-600">
                아직 이 가상머신의 SSH 키를 발급받지 않았습니다.
              </p>
              <Button size="sm" disabled={busy} onClick={() => issue.mutate()}>
                SSH 키 발급 및 다운로드
              </Button>
            </div>
          )}

          <details className="workspace">
            <summary className="cursor-pointer text-sm font-medium text-primary-700 hover:underline">
              접속 방법 보기
            </summary>
            <div className="mt-3">
              <SshUsageGuide hostname={vm.hostname} sshHost={vm.sshHost} keyFile={keyFile} />
            </div>
          </details>
        </div>
      </CardContent>

      <Modal
        open={confirmReissue}
        onClose={() => setConfirmReissue(false)}
        title="SSH 키를 재발급할까요?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmReissue(false)}>
              돌아가기
            </Button>
            <Button variant="danger" loading={reissue.isPending}
                    onClick={() => reissue.mutate()}>
              재발급하고 내려받기
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">
            새 키쌍을 만들고 개인키를 내려받습니다.
          </p>
          <Alert variant="danger">
            기존 키는 즉시 무효화됩니다. 이미 열려 있는 SSH 세션은 끊기지 않습니다.
          </Alert>
        </div>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="SSH 키를 삭제할까요?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              돌아가기
            </Button>
            <Button variant="danger" loading={remove.isPending}
                    onClick={() => remove.mutate()}>
              삭제
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">
            삭제하면 이 키로는 접속할 수 없습니다. 필요하면 언제든 다시 발급받을 수
            있습니다.
          </p>
          <Alert variant="warning">
            내려받아 둔 개인키 파일도 함께 지워 주세요.
          </Alert>
        </div>
      </Modal>
    </Card>
  )
}

/* ─── VM 비밀번호 (상시 재열람 + 재생성) ─── */

/** 계약상 열람이 허용되는 상태 (그 외는 409). */
const PASSWORD_VIEWABLE_STATUSES: VmStatus[] = ['RUNNING', 'STOPPED', 'REBOOTING']



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

  const editable = vm.settingsEditAllowed
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
              비밀번호는 VM 내부 sudo 자격입니다.
            </p>
            <Button size="sm" onClick={openReveal} disabled={!viewable}>
              비밀번호 보기
            </Button>
          </div>
        )}

        {vm.passwordAvailable && !vm.passwordRevealAllowed && (
          <Alert variant="info">
            이 VM은 비밀번호 열람이 제한되어 있습니다. 열람하려면 더 높은 워크스페이스
            역할이 필요합니다.
          </Alert>
        )}

        {!vm.passwordAvailable && (
          <Alert variant="info">
            저장된 비밀번호가 없습니다.
            {!canRegenerate && ' 비밀번호 재생성은 이 VM의 편집자 이상만 할 수 있습니다.'}
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
            새 비밀번호는 시스템이 생성하며 실행 중인 VM에 즉시 적용됩니다.
          </p>
        </div>
      </Modal>
    </Card>
  )
}

/* ─── VM별 설정 (편집자 이상) ─── */

function VmSettingsSection({ vm }: { vm: VmDetail }) {
  // 편집 권한이 없거나 삭제 중/삭제된 VM에는 설정 영역을 노출하지 않는다.
  if (!vm.settingsEditAllowed) return null
  if (vm.status === 'DELETING' || vm.status === 'DELETED') return null
  return <VmSettingsCard vm={vm} />
}

/** 사용자 관점 설정 순서 — 표시명(가장 자주 쓰는 항목)을 맨 앞에. 목록에 없는 키는 서버 순서대로 뒤에 붙는다. */
const SETTING_ORDER = [
  'display_name',
  'ssh_password_enabled',
  'password_reveal_min_role',
  'stop_protection',
  'deletion_protection',
]

function settingOrderIndex(key: string): number {
  const index = SETTING_ORDER.indexOf(key)
  return index === -1 ? SETTING_ORDER.length : index
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
              {[...settings.data]
                .sort((a, b) => settingOrderIndex(a.key) - settingOrderIndex(b.key))
                .map((setting) => (
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

function VmSettingRow({ vmId, setting }: { vmId: string; setting: VmSettingView }) {
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

  const requiredLabel = RESOURCE_ROLE_LABELS[setting.requiredRole]

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
            <li>
              <strong>이 경로는 접근 권한 목록을 검사하지 않습니다.</strong> 비밀번호를
              아는 사람이면 목록에 없어도, 접근 권한을 회수한 뒤에도 접속할 수 있습니다.
            </li>
            <li>이 변경은 관리자에게 표시됩니다.</li>
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

  if (setting.valueType === 'STRING') {
    return <StringSettingControl setting={setting} pending={pending} onChange={onChange} />
  }

  // ENUM
  const isRoleEnum = setting.key === 'password_reveal_min_role'
  const current = String(setting.value)
  return (
    <div className="flex items-center gap-2">
      {isRoleEnum && <ResourceRoleBadge role={current as ResourceRole} />}
      <Select
        className="w-40"
        value={current}
        disabled={disabled}
        aria-label={setting.label}
        onChange={(e) => onChange(e.target.value)}
      >
        {(setting.allowedValues ?? []).map((option) => (
          <option key={option} value={option}>
            {isRoleEnum ? RESOURCE_ROLE_LABELS[option as ResourceRole] : option}
          </option>
        ))}
      </Select>
    </div>
  )
}

/** STRING 설정 편집 (예: display_name) — 텍스트 입력 + 저장. 빈 문자열은 해제. */
function StringSettingControl({
  setting,
  pending,
  onChange,
}: {
  setting: VmSettingView
  pending: boolean
  onChange: (value: unknown) => void
}) {
  const initial = typeof setting.value === 'string' ? setting.value : ''
  const [text, setText] = useState(initial)
  const disabled = !setting.editable || pending
  const dirty = text !== initial

  return (
    <div className="flex items-center gap-2">
      <Input
        className="w-48"
        value={text}
        disabled={disabled}
        maxLength={100}
        placeholder="미설정 (이름 표시)"
        aria-label={setting.label}
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        size="sm"
        variant="secondary"
        className="shrink-0 whitespace-nowrap"
        disabled={disabled || !dirty}
        loading={pending}
        onClick={() => onChange(text.trim())}
      >
        저장
      </Button>
    </div>
  )
}

/* ─── 삭제 예정 배너 (사용자 화면 — 취소 버튼 없음, 관리자 문의 안내) ─── */

function DeletionBanner({ deletion }: { deletion: VmDeletion }) {
  const scheduled = formatDateTime(deletion.scheduledFor)
  return (
    <Alert variant="danger" title={DELETION_BANNER_TITLES[deletion.kind]}>
      <div className="space-y-1">
        {deletion.kind === 'FORCE' ? (
          <p>보안상의 사유로 즉시 파기됩니다. 취소할 수 없습니다.</p>
        ) : (
          <p>
            {scheduled}에 영구 파기될 예정입니다. 파기 전에 복구가 필요하면 관리자에게
            문의하세요.
          </p>
        )}
        {deletion.reason && <p>사유: {deletion.reason}</p>}
        <p>파기된 데이터는 되돌릴 수 없습니다.</p>
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
      await invalidateResourceLists(queryClient)
    },
    onError: async (err) => {
      setOpen(false)
      setError(toApiError(err, 'VM 삭제를 접수하지 못했습니다.').message)
      await invalidateResourceLists(queryClient)
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
                ? '생성에 실패한 VM입니다. 접수 즉시 삭제됩니다.'
                : '삭제를 접수하면 VM이 종료되고 유예 기간이 지난 뒤 영구 파기됩니다.'}
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
              {!isErrorVm && (
                <p className="text-sm text-neutral-600">
                  삭제 접수 후에는 취소할 수 없습니다. 유예 기간 중 복구가 필요하면
                  관리자에게 문의하세요.
                </p>
              )}
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
        <Stepper steps={steps} current={task.currentStep} labels="never" />
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
            재시도가 모두 실패했습니다.
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

function VmEventsSection({ vmId }: { vmId: string }) {
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
                    <TD className="whitespace-nowrap">{vmEventActorLabel(event)}</TD>
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
