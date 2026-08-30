import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteAdminPortMapping,
  fetchAdminCampusIpRequests,
  fetchAdminPortMappings,
  fetchAdminRelays,
  issueAdminRelayToken,
  suspendAdminPortMapping,
  unsuspendAdminPortMapping,
  updateAdminCampusIpRequestStatus,
  updateAdminPortMappingGuards,
  type AdminCampusIpRequestView,
  type AdminPortMappingView,
  type AdminRelayView,
  type CampusIpRequestStatus,
  type PortMappingStatus,
  type UpdatePortMappingGuardsRequest,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { fieldErrorsOf } from '../lib/field-errors'
import { useAuth } from '../auth/auth-context'
import { canRunSysRoutine, isSysAdminOnly } from '../auth/permissions'
import { FilterBar } from '../components/FilterBar'
import { CopyButton } from '../components/CopyButton'
import {
  Alert,
  Badge,
  Button,
  CampusIpStatusBadge,
  Card,
  Drawer,
  FormField,
  InfoTip,
  Input,
  Modal,
  Pagination,
  PortForwardApplyStateBadge,
  PortMappingStatusBadge,
  Spinner,
  StatTile,
  TabPanel,
  Tabs,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
  useToast,
} from '../components/ui'
import { formatDateTime } from '../lib/format'
import { CAMPUS_IP_STATUS_LABELS, PORT_MAPPING_STATUS_LABELS } from '../lib/status'

const PAGE_SIZE = 20

/** 대역 사용률 경고 임계 (%) — 이상이면 위험 톤으로 강조한다. */
const BAND_USAGE_DANGER_PERCENT = 80

const SCREEN_TABS = [
  { id: 'relays', label: '릴레이' },
  { id: 'forwardings', label: '포트포워딩' },
  { id: 'campus', label: '캠퍼스 IP' },
]

/**
 * 네트워크 — 릴레이 인벤토리·포트포워딩 매핑·캠퍼스 IP 신청의 시스템 계층
 * 1화면. 릴레이 관측 필드는 에이전트 자기 보고에서 파생하므로 신뢰 수준을
 * 구분해 읽어야 한다 (측정값 아님).
 */
export function AdminNetworkPage() {
  const { user } = useAuth()
  const isSysAdmin = !!user && isSysAdminOnly(user.role)
  // 매핑 정지·재개·삭제는 시스템 운영자 이상 — 시스템 열람자는 조회만.
  const canOperate = !!user && canRunSysRoutine(user.role)
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const activeTab = SCREEN_TABS.some((tab) => tab.id === rawTab) ? rawTab! : 'relays'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">네트워크</h1>
        <p className="mt-1 text-sm text-neutral-500">
          포트포워딩 릴레이와 매핑, 캠퍼스 IP 신청을 관리합니다. 릴레이 상태는
          에이전트의 자기 보고에서 파생됩니다.
        </p>
      </div>

      <Tabs
        aria-label="네트워크 탭"
        tabs={SCREEN_TABS}
        value={activeTab}
        onChange={(id) => setSearchParams(id === 'relays' ? {} : { tab: id }, { replace: true })}
      />

      <TabPanel id="relays" active={activeTab === 'relays'} className="space-y-6">
        <RelaysTab isSysAdmin={isSysAdmin} />
      </TabPanel>
      <TabPanel id="forwardings" active={activeTab === 'forwardings'} className="space-y-6">
        <ForwardingsTab isSysAdmin={isSysAdmin} canOperate={canOperate} />
      </TabPanel>
      <TabPanel id="campus" active={activeTab === 'campus'} className="space-y-6">
        <CampusTab isSysAdmin={isSysAdmin} />
      </TabPanel>
    </div>
  )
}

/**
 * 정지 사유 뒤에 붙는 수행자 표시. 사람이 정지했으면 그 사람을 이름으로 밝히고,
 * 수행자가 없으면 자동 정지다. 이름 없이 id만 남은 행은 아무 말도 덧붙이지 않는다 —
 * UUID는 읽는 사람에게 알려주는 것이 없다.
 */
function suspendedNote(mapping: AdminPortMappingView): string {
  if (mapping.suspendedByName) return ` (정지: ${mapping.suspendedByName})`
  return mapping.suspendedBy == null ? ' (자동 정지)' : ''
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium text-neutral-900">{value}</dd>
    </div>
  )
}

/* ─── 릴레이 탭 ─── */

function RelaysTab({ isSysAdmin }: { isSysAdmin: boolean }) {
  const relays = useQuery({ queryKey: ['admin', 'relays'], queryFn: fetchAdminRelays })

  if (relays.isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="릴레이 목록 불러오는 중" />
      </div>
    )
  }
  if (relays.isError) return <Alert variant="danger">{relays.error.message}</Alert>
  if (relays.data.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-neutral-500">
        등록된 릴레이가 없습니다.
      </Card>
    )
  }
  return (
    <div className="space-y-6">
      {relays.data.map((relay) => (
        <RelayCard key={relay.id} relay={relay} isSysAdmin={isSysAdmin} />
      ))}
    </div>
  )
}

/** 릴레이 상태 배지 — 접촉 두절이 최우선, 다음이 적용 지연. */
function RelayStatusBadges({ relay }: { relay: AdminRelayView }) {
  const lagging = relay.appliedGeneration < relay.mappingGeneration
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {relay.contactLost ? (
        <Badge variant="danger">접촉 두절</Badge>
      ) : lagging ? (
        <Badge variant="warning">적용 지연</Badge>
      ) : (
        <Badge variant="success">정상</Badge>
      )}
      {relay.contactLost && lagging && <Badge variant="warning">적용 지연</Badge>}
      {!relay.tokenIssued && <Badge variant="warning">토큰 미발급</Badge>}
      {!relay.enabled && <Badge variant="neutral">비활성</Badge>}
    </span>
  )
}

function RelayCard({ relay, isSysAdmin }: { relay: AdminRelayView; isSysAdmin: boolean }) {
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-neutral-900">{relay.name}</h2>
          <RelayStatusBadges relay={relay} />
        </div>
        <span className="text-sm text-neutral-500">
          동기화: gen {relay.appliedGeneration}/{relay.mappingGeneration}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatTile
          label="공개 포트 대역 사용률"
          value={`${relay.bandUsagePercent}%`}
          hint={`매핑 ${relay.mappingCount.toLocaleString()}개 · 대역 ${relay.bandStart}–${relay.bandEnd}`}
          tone={relay.bandUsagePercent >= BAND_USAGE_DANGER_PERCENT ? 'danger' : 'normal'}
        />
        <dl className="col-span-1 grid grid-cols-2 gap-x-8 gap-y-2 text-sm lg:col-span-2">
          <Field
            label="공개 호스트"
            value={
              relay.publicHost ?? <span className="font-normal text-neutral-400">미설정</span>
            }
          />
          <Field
            label="마지막 접촉"
            value={relay.lastContactAt ? formatDateTime(relay.lastContactAt) : '—'}
          />
          <Field label="에이전트 버전" value={relay.agentVersion ?? '—'} />
          <Field label="토큰" value={relay.tokenIssued ? '발급됨' : '미발급'} />
        </dl>
      </div>

      {relay.lastError && (
        <Alert variant="danger" title="적용 실패 — 에이전트가 보고한 마지막 오류">
          {relay.lastError}
        </Alert>
      )}

      {isSysAdmin && <RelayTokenSection relay={relay} />}
    </Card>
  )
}

function RelayTokenSection({ relay }: { relay: AdminRelayView }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const actionLabel = relay.tokenIssued ? '토큰 재발급' : '토큰 발급'

  // 평문 토큰은 뮤테이션 상태(메모리)에만 존재한다 — gcTime 0으로 모달을 닫는
  // 즉시 GC 대상이 되게 한다 (VM 비밀번호 모달과 같은 규칙).
  const issue = useMutation({
    gcTime: 0,
    mutationFn: () => issueAdminRelayToken(relay.id),
    onSuccess: async () => {
      setConfirming(false)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'relays'] })
    },
    onError: (err) => {
      setConfirming(false)
      setError(toApiError(err, '릴레이 토큰을 발급하지 못했습니다.').message)
    },
  })

  return (
    <section className="space-y-2 border-t border-neutral-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          동기화 토큰은 릴레이 에이전트 인증에 쓰입니다. 재발급하면 이전 토큰이
          즉시 무효화됩니다.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setError(null)
            setConfirming(true)
          }}
        >
          {actionLabel}
        </Button>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}

      {/* 발급 확인 모달 */}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={actionLabel}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              돌아가기
            </Button>
            <Button variant="danger" loading={issue.isPending} onClick={() => issue.mutate()}>
              {actionLabel}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {relay.tokenIssued && (
            <Alert variant="danger">
              재발급 즉시 이전 토큰이 무효화됩니다. 릴레이 쪽 환경 변수를 교체하기
              전까지 이 릴레이의 동기화가 끊깁니다 (마지막 적용 상태로 고정).
            </Alert>
          )}
          <p className="text-sm text-neutral-600">
            새 토큰의 평문은 발급 응답에서 단 한 번만 확인할 수 있으며, 서버에는
            해시로만 저장됩니다.
          </p>
        </div>
      </Modal>

      {/* 발급 결과 모달 — 평문 토큰은 이 화면에서만 확인 가능 */}
      <Modal
        open={issue.isSuccess}
        onClose={() => issue.reset()}
        title="릴레이 토큰 발급 완료"
        footer={
          <Button variant="secondary" onClick={() => issue.reset()}>
            확인했습니다
          </Button>
        }
      >
        {issue.data && (
          <div className="space-y-3">
            <Alert variant="warning" title="이 토큰은 다시 볼 수 없습니다">
              창을 닫으면 평문을 다시 확인할 수 없습니다. 릴레이 에이전트 설정에
              바로 반영해 주세요.
            </Alert>
            <div className="flex items-center justify-between gap-3">
              <code className="overflow-x-auto rounded-md bg-neutral-900 px-3 py-2 font-mono text-xs break-all text-neutral-100">
                {issue.data.token}
              </code>
              <CopyButton value={issue.data.token} label="복사" />
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}

/* ─── 포트포워딩(매핑) 탭 ─── */

const MAPPING_STATUS_TABS: { label: string; status: PortMappingStatus | undefined }[] = [
  { label: '전체', status: undefined },
  { label: PORT_MAPPING_STATUS_LABELS.ACTIVE, status: 'ACTIVE' },
  { label: PORT_MAPPING_STATUS_LABELS.SUSPENDED, status: 'SUSPENDED' },
]

function ForwardingsTab({
  isSysAdmin,
  canOperate,
}: {
  isSysAdmin: boolean
  canOperate: boolean
}) {
  const [status, setStatus] = useState<PortMappingStatus | undefined>(undefined)
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const mappings = useQuery({
    queryKey: ['admin', 'port-mappings', { status: status ?? null, page }],
    queryFn: () => fetchAdminPortMappings({ status, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  const selected = mappings.data?.content.find((m) => m.id === selectedId) ?? null

  return (
    <div className="space-y-6">
      <FilterBar
        tabs={MAPPING_STATUS_TABS}
        status={status}
        onStatus={(next) => {
          setStatus(next)
          setPage(0)
        }}
        showOrgFilter={false}
        orgId={undefined}
        onOrg={() => {}}
        orgs={[]}
      />

      {message && <Alert variant="info">{message}</Alert>}

      {mappings.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="포트 매핑 목록 불러오는 중" />
        </div>
      )}
      {mappings.isError && <Alert variant="danger">{mappings.error.message}</Alert>}
      {mappings.isSuccess && mappings.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          조건에 맞는 포트 매핑이 없습니다.
        </Card>
      )}
      {mappings.isSuccess && mappings.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>VM</TH>
                  <TH>릴레이</TH>
                  <TH>매핑</TH>
                  <TH>적용</TH>
                  <TH>상태</TH>
                  <TH>생성일</TH>
                </TR>
              </THead>
              <TBody>
                {mappings.data.content.map((mapping) => (
                  <TR
                    key={mapping.id}
                    className="cursor-pointer"
                    onClick={() => {
                      setMessage(null)
                      setSelectedId(mapping.id)
                    }}
                  >
                    <TD>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setMessage(null)
                          setSelectedId(mapping.id)
                        }}
                        className="cursor-pointer text-sm font-medium text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-primary-600"
                      >
                        {mapping.vmName ?? '이름 미상 VM'}
                      </button>
                    </TD>
                    <TD>{mapping.relayName}</TD>
                    <TD className="font-mono text-sm whitespace-nowrap">
                      :{mapping.publicPort} → {mapping.targetPort}/{mapping.proto}
                    </TD>
                    <TD>
                      <PortForwardApplyStateBadge state={mapping.applyState} />
                    </TD>
                    <TD>
                      <PortMappingStatusBadge status={mapping.status} />
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-neutral-500">
                      {formatDateTime(mapping.createdAt)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Pagination
            page={mappings.data.page}
            totalPages={mappings.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      <Drawer open={selected !== null} onClose={() => setSelectedId(null)} title="포트 매핑 상세">
        {selected && (
          <MappingDrawerContent
            key={selected.id}
            mapping={selected}
            isSysAdmin={isSysAdmin}
            canOperate={canOperate}
            onDone={(text) => {
              setMessage(text)
              setSelectedId(null)
            }}
          />
        )}
      </Drawer>
    </div>
  )
}

type DrawerNotice = { variant: 'info' | 'danger'; text: string }

function MappingDrawerContent({
  mapping,
  isSysAdmin,
  canOperate,
  onDone,
}: {
  mapping: AdminPortMappingView
  isSysAdmin: boolean
  canOperate: boolean
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [notice, setNotice] = useState<DrawerNotice | null>(null)
  const [suspendOpen, setSuspendOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'port-mappings'] })

  const unsuspend = useMutation({
    mutationFn: () => unsuspendAdminPortMapping(mapping.id),
    // 성공 피드백은 토스트로 — 상태 필터 활성 시 행이 목록에서 빠지면 드로어가
    // 닫혀 드로어 내부 알림은 소실되기 때문이다.
    onSuccess: async () => {
      toast.success('포트 매핑 정지를 해제했습니다. 다음 릴레이 동기화에서 전달이 복원됩니다.')
      await invalidate()
    },
    onError: async (err) => {
      setNotice({
        variant: 'danger',
        text: toApiError(err, '포트 매핑 정지를 해제하지 못했습니다.').message,
      })
      // 409(정지 상태 아님) 등은 화면이 뒤처진 것이므로 최신 상태를 다시 불러온다.
      await invalidate()
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-lg font-semibold text-neutral-900">
          :{mapping.publicPort} → {mapping.targetPort}/{mapping.proto}
        </h3>
        <span className="flex items-center gap-1.5">
          <PortForwardApplyStateBadge state={mapping.applyState} />
          <PortMappingStatusBadge status={mapping.status} />
        </span>
      </div>
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}

      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-neutral-500">VM</dt>
          <dd className="font-medium text-neutral-900">
            {mapping.vmName ?? '이름 미상 VM'}{' '}
            <Link
              to={`/admin/vms/${mapping.vmId}`}
              className="text-sm font-normal text-primary-700 hover:underline"
            >
              상세
            </Link>
          </dd>
        </div>
        <Field label="릴레이" value={mapping.relayName} />
        <Field label="생성일" value={formatDateTime(mapping.createdAt)} />
        <Field label="생성자" value={mapping.createdByName ?? '—'} />
      </dl>

      {mapping.status === 'SUSPENDED' && (
        <Alert variant="warning" title="정지된 매핑입니다">
          {mapping.suspendedReason ?? '사유가 기록되지 않았습니다.'}
          {suspendedNote(mapping)}
        </Alert>
      )}

      {canOperate && (
        <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
          <h3 className="text-sm font-semibold text-neutral-800">사후 개입</h3>
          <p className="text-sm text-neutral-500">
            정지는 매핑을 유지한 채 공인 포트만 닫고(해제 시 같은 포트로 복원),
            삭제는 매핑과 공인 포트 점유를 되돌릴 수 없이 제거합니다.
          </p>
          <div className="flex flex-wrap gap-2">
            {mapping.status === 'ACTIVE' ? (
              <Button variant="secondary" size="sm" onClick={() => setSuspendOpen(true)}>
                정지
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                loading={unsuspend.isPending}
                onClick={() => unsuspend.mutate()}
              >
                재개
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
              삭제
            </Button>
          </div>
        </section>
      )}

      {isSysAdmin && <GuardsSection mapping={mapping} onNotice={setNotice} />}

      {suspendOpen && (
        <SuspendMappingModal
          mapping={mapping}
          onClose={() => setSuspendOpen(false)}
          onDone={async (text) => {
            setSuspendOpen(false)
            toast.success(text)
            await invalidate()
          }}
        />
      )}
      {deleteOpen && (
        <DeleteMappingModal
          mapping={mapping}
          onClose={() => setDeleteOpen(false)}
          onDone={async (text) => {
            setDeleteOpen(false)
            onDone(text)
            await invalidate()
          }}
        />
      )}
    </div>
  )
}

function SuspendMappingModal({
  mapping,
  onClose,
  onDone,
}: {
  mapping: AdminPortMappingView
  onClose: () => void
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const suspend = useMutation({
    mutationFn: () => suspendAdminPortMapping(mapping.id, reason.trim()),
    onSuccess: () =>
      onDone('포트 매핑을 정지했습니다. 다음 릴레이 동기화에서 공인 포트가 닫힙니다.'),
    onError: async (err) => {
      const apiError = toApiError(err, '포트 매핑을 정지하지 못했습니다.')
      setError(apiError.message)
      // 409(이미 정지됨)는 화면이 뒤처진 것 — 목록을 다시 불러온다.
      if (apiError.problem?.status === 409) {
        await queryClient.invalidateQueries({ queryKey: ['admin', 'port-mappings'] })
      }
    },
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="포트 매핑 정지"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            돌아가기
          </Button>
          <Button
            variant="danger"
            loading={suspend.isPending}
            disabled={reason.trim() === ''}
            onClick={() => suspend.mutate()}
          >
            정지
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-neutral-600">
          다음 릴레이 동기화에서 공인 포트 {mapping.publicPort}이(가) 닫힙니다. 매핑은
          유지되며 해제하면 같은 포트로 복원됩니다.
        </p>
        {error && <Alert variant="danger">{error}</Alert>}
        <label className="block space-y-1">
          <span className="text-sm font-medium text-neutral-700">정지 사유 (필수)</span>
          <Textarea
            rows={2}
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder="감사 기록과 소유 워크스페이스 알림에 포함됩니다."
          />
        </label>
      </div>
    </Modal>
  )
}

function DeleteMappingModal({
  mapping,
  onClose,
  onDone,
}: {
  mapping: AdminPortMappingView
  onClose: () => void
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const remove = useMutation({
    mutationFn: () => deleteAdminPortMapping(mapping.id),
    onSuccess: (data) => onDone(data.message),
    onError: async (err) => {
      const apiError = toApiError(err, '포트 매핑 삭제를 접수하지 못했습니다.')
      setError(apiError.message)
      // 이미 사라진 매핑(404)이면 목록을 다시 불러와 낡은 행을 정리한다.
      if (apiError.problem?.status === 404) {
        await queryClient.invalidateQueries({ queryKey: ['admin', 'port-mappings'] })
      }
    },
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="포트 매핑 삭제"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            돌아가기
          </Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
            삭제
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Alert variant="danger" title="되돌릴 수 없는 작업입니다">
          매핑이 제거되고 공인 포트 {mapping.publicPort}이(가) 재할당 풀로 돌아갑니다.
          감사 기록과 소유 워크스페이스 알림이 남습니다.
        </Alert>
        {error && <Alert variant="danger">{error}</Alert>}
      </div>
    </Modal>
  )
}

/* ─── 연결 가드 조정 (SYS_ADMIN) ─── */

const GUARD_FIELDS: { key: keyof UpdatePortMappingGuardsRequest; label: string }[] = [
  { key: 'ctMax', label: '동시 연결 상한' },
  { key: 'newConnRate', label: '초당 신규 연결' },
  { key: 'newConnBurst', label: '신규 연결 버스트' },
  { key: 'perSourceRate', label: '출발지별 초당 신규' },
  { key: 'perSourceBurst', label: '출발지별 버스트' },
]

function GuardsSection({
  mapping,
  onNotice,
}: {
  mapping: AdminPortMappingView
  onNotice: (notice: DrawerNotice) => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      GUARD_FIELDS.map(({ key }) => [key, mapping[key] == null ? '' : String(mapping[key])]),
    ),
  )
  const [fieldError, setFieldError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: (body: UpdatePortMappingGuardsRequest) =>
      updateAdminPortMappingGuards(mapping.id, body),
    // 성공은 토스트 — 상태 필터에 따라 드로어가 닫혀도 피드백이 남게 한다.
    onSuccess: async () => {
      toast.success('연결 가드를 조정했습니다. 다음 동기화에서 수렴합니다.')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'port-mappings'] })
    },
    onError: (err) =>
      onNotice({
        variant: 'danger',
        text: toApiError(err, '연결 가드를 조정하지 못했습니다.').message,
      }),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setFieldError(null)
    const body: UpdatePortMappingGuardsRequest = {}
    for (const { key, label } of GUARD_FIELDS) {
      const raw = values[key].trim()
      if (raw === '') {
        body[key] = null
        continue
      }
      if (!/^\d+$/.test(raw)) {
        setFieldError(`${label}: 0 이상의 정수를 입력해 주세요.`)
        return
      }
      body[key] = Number(raw)
    }
    save.mutate(body)
  }

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
        연결 가드 조정
        <InfoTip label="연결 가드 도움말">
          매핑별 남용 방지 한도입니다. 비워 두면 릴레이 기본값을 쓰고, 0을 넣으면
          해당 가드가 해제(무제한)되며, 양수는 이 매핑에만 적용되는 오버라이드입니다.
        </InfoTip>
      </h3>
      {fieldError && <Alert variant="danger">{fieldError}</Alert>}
      <form onSubmit={submit} className="space-y-3" noValidate>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {GUARD_FIELDS.map(({ key, label }) => (
            <FormField key={key} label={label}>
              <Input
                inputMode="numeric"
                placeholder="기본값"
                value={values[key]}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, [key]: event.target.value }))
                }
              />
            </FormField>
          ))}
        </div>
        <p className="text-xs text-neutral-500">빈칸 = 릴레이 기본값, 0 = 해당 가드 해제.</p>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          loading={save.isPending}
        >
          가드 저장
        </Button>
      </form>
    </section>
  )
}

/* ─── 캠퍼스 IP 탭 ─── */

const CAMPUS_STATUS_TABS: { label: string; status: CampusIpRequestStatus | undefined }[] = [
  { label: '전체', status: undefined },
  { label: CAMPUS_IP_STATUS_LABELS.REQUESTED, status: 'REQUESTED' },
  { label: CAMPUS_IP_STATUS_LABELS.APPROVED, status: 'APPROVED' },
  { label: CAMPUS_IP_STATUS_LABELS.GRANTED, status: 'GRANTED' },
  { label: CAMPUS_IP_STATUS_LABELS.REJECTED, status: 'REJECTED' },
  { label: CAMPUS_IP_STATUS_LABELS.REVOKED, status: 'REVOKED' },
]

function CampusTab({ isSysAdmin }: { isSysAdmin: boolean }) {
  const [status, setStatus] = useState<CampusIpRequestStatus | undefined>(undefined)
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const requests = useQuery({
    queryKey: ['admin', 'campus-ip-requests', { status: status ?? null, page }],
    queryFn: () => fetchAdminCampusIpRequests({ status, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  const selected = requests.data?.content.find((r) => r.id === selectedId) ?? null

  return (
    <div className="space-y-6">
      <FilterBar
        tabs={CAMPUS_STATUS_TABS}
        status={status}
        onStatus={(next) => {
          setStatus(next)
          setPage(0)
        }}
        showOrgFilter={false}
        orgId={undefined}
        onOrg={() => {}}
        orgs={[]}
      />

      {requests.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="캠퍼스 IP 신청 목록 불러오는 중" />
        </div>
      )}
      {requests.isError && <Alert variant="danger">{requests.error.message}</Alert>}
      {requests.isSuccess && requests.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          조건에 맞는 신청이 없습니다.
        </Card>
      )}
      {requests.isSuccess && requests.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>VM</TH>
                  <TH>신청자</TH>
                  <TH>용도</TH>
                  <TH>포트</TH>
                  <TH>상태</TH>
                  <TH>신청일</TH>
                </TR>
              </THead>
              <TBody>
                {requests.data.content.map((request) => (
                  <TR
                    key={request.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(request.id)}
                  >
                    <TD>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelectedId(request.id)
                        }}
                        className="cursor-pointer text-sm font-medium text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-primary-600"
                      >
                        {request.vmName ?? '이름 미상 VM'}
                      </button>
                    </TD>
                    <TD className="text-sm">{request.requesterEmail ?? '—'}</TD>
                    <TD className="max-w-64 truncate text-sm">{request.purpose}</TD>
                    <TD className="font-mono text-xs">{request.ports.join(', ')}</TD>
                    <TD>
                      <CampusIpStatusBadge status={request.status} />
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-neutral-500">
                      {formatDateTime(request.createdAt)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Pagination
            page={requests.data.page}
            totalPages={requests.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      <Drawer
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        title="캠퍼스 IP 신청 상세"
      >
        {selected && (
          <CampusDrawerContent key={selected.id} request={selected} isSysAdmin={isSysAdmin} />
        )}
      </Drawer>
    </div>
  )
}

function CampusDrawerContent({
  request,
  isSysAdmin,
}: {
  request: AdminCampusIpRequestView
  isSysAdmin: boolean
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-900">
          {request.vmName ?? '이름 미상 VM'}
        </h3>
        <CampusIpStatusBadge status={request.status} />
      </div>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-neutral-500">VM</dt>
          <dd className="font-medium text-neutral-900">
            {request.vmName ?? '이름 미상 VM'}{' '}
            <Link
              to={`/admin/vms/${request.vmId}`}
              className="text-sm font-normal text-primary-700 hover:underline"
            >
              상세
            </Link>
          </dd>
        </div>
        <Field label="신청자" value={request.requesterEmail ?? '—'} />
        <Field label="개방 포트" value={request.ports.join(', ')} />
        <Field label="신청일" value={formatDateTime(request.createdAt)} />
        {request.processedAt && (
          <Field label="처리일" value={formatDateTime(request.processedAt)} />
        )}
        {request.grantedAddress && (
          <Field
            label="연결된 교내 IP"
            value={<code className="font-mono">{request.grantedAddress}</code>}
          />
        )}
      </dl>

      <section className="space-y-1">
        <h4 className="text-sm font-semibold text-neutral-800">신청 목적</h4>
        <p className="text-sm whitespace-pre-wrap text-neutral-700">{request.purpose}</p>
      </section>

      {request.adminNote && (
        <section className="space-y-1">
          <h4 className="text-sm font-semibold text-neutral-800">관리자 메모</h4>
          <p className="text-sm whitespace-pre-wrap text-neutral-700">{request.adminNote}</p>
        </section>
      )}

      {isSysAdmin && <CampusTransitionSection request={request} />}
    </div>
  )
}

/** IPv4 형식 사전 검증 (서버 422 규칙과 동일). */
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/

/** 교내 IP는 캠퍼스 대역(10.0.0.0/8) 안이어야 한다 (서버가 강제). */
function grantedAddressError(raw: string): string | null {
  const address = raw.trim()
  if (!IPV4_RE.test(address)) return '올바른 IPv4 주소를 입력해 주세요.'
  if (!address.startsWith('10.')) return '교내 IP는 10.0.0.0/8 대역의 주소여야 합니다.'
  return null
}

/** 상태별 허용 전이 (계약: 그 외 409 CAMPUS_IP_INVALID_TRANSITION). */
const TRANSITIONS: Record<
  CampusIpRequestStatus,
  { to: CampusIpRequestStatus; label: string; danger?: boolean }[]
> = {
  REQUESTED: [
    { to: 'APPROVED', label: '승인' },
    { to: 'REJECTED', label: '반려', danger: true },
  ],
  APPROVED: [
    { to: 'GRANTED', label: '할당' },
    { to: 'REJECTED', label: '반려', danger: true },
  ],
  GRANTED: [{ to: 'REVOKED', label: '회수', danger: true }],
  REJECTED: [],
  REVOKED: [],
}

function CampusTransitionSection({
  request,
}: {
  request: AdminCampusIpRequestView
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [grantedAddress, setGrantedAddress] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [addressError, setAddressError] = useState<string | null>(null)

  const transitions = TRANSITIONS[request.status]
  const needsAddress = transitions.some((t) => t.to === 'GRANTED')

  const update = useMutation({
    mutationFn: (to: CampusIpRequestStatus) =>
      updateAdminCampusIpRequestStatus(request.id, {
        status: to,
        ...(to === 'GRANTED' ? { grantedAddress: grantedAddress.trim() } : {}),
        ...(adminNote.trim() ? { adminNote: adminNote.trim() } : {}),
      }),
    onSuccess: async (updated) => {
      setError(null)
      toast.success(`신청을 '${CAMPUS_IP_STATUS_LABELS[updated.status]}' 상태로 전환했습니다.`)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'campus-ip-requests'] })
    },
    onError: (err) => {
      const apiError = toApiError(err, '신청 상태를 전환하지 못했습니다.')
      // 서버 422의 grantedAddress 필드 오류는 입력 옆에 그대로 보여준다.
      const fieldMessage = fieldErrorsOf(apiError.problem).grantedAddress
      if (fieldMessage) {
        setAddressError(fieldMessage)
        return
      }
      setError(apiError.message)
    },
  })

  if (transitions.length === 0) return null

  const run = (to: CampusIpRequestStatus) => {
    setError(null)
    setAddressError(null)
    if (to === 'GRANTED') {
      const invalid = grantedAddressError(grantedAddress)
      if (invalid) {
        setAddressError(invalid)
        return
      }
    }
    update.mutate(to)
  }

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-800">상태 전환</h3>
      {request.status === 'APPROVED' && (
        <p className="text-sm text-neutral-500">
          정보전산원 절차가 끝나면 부여된 주소를 입력해 할당으로 전환합니다.
        </p>
      )}
      {error && <Alert variant="danger">{error}</Alert>}

      {needsAddress && (
        <FormField
          label="연결된 교내 IP"
          required
          error={addressError ?? undefined}
          description="할당 전환에만 필요합니다. 캠퍼스 대역(10.0.0.0/8)의 IPv4 주소."
          className="max-w-xs"
        >
          <Input
            value={grantedAddress}
            placeholder="예: 10.20.30.40"
            onChange={(event) => setGrantedAddress(event.target.value)}
          />
        </FormField>
      )}
      <FormField
        label="관리자 메모 (선택)"
        description="신청 워크스페이스에 발송되는 알림에 포함됩니다."
      >
        <Textarea
          rows={2}
          maxLength={1000}
          value={adminNote}
          onChange={(event) => setAdminNote(event.target.value)}
        />
      </FormField>
      <div className="flex flex-wrap gap-2">
        {transitions.map((transition) => (
          <Button
            key={transition.to}
            variant={transition.danger ? 'danger' : 'primary'}
            size="sm"
            loading={update.isPending && update.variables === transition.to}
            onClick={() => run(transition.to)}
          >
            {transition.label}
          </Button>
        ))}
      </div>
    </section>
  )
}
