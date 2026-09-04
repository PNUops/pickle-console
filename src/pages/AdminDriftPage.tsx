import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchDriftFindings,
  resolveDriftFinding,
  type DriftFindingStatus,
  type DriftFindingView,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { canRunSysRoutine } from '../auth/permissions'
import { FilterBar } from '../components/FilterBar'
import {
  Alert,
  Button,
  Card,
  DriftKindBadge,
  DriftStatusBadge,
  Modal,
  Pagination,
  Spinner,
  Table,
  TBody,
  TD,
  Textarea,
  TH,
  THead,
  TR,
} from '../components/ui'
import { formatDateTime } from '../lib/format'
import { DRIFT_STATUS_LABELS } from '../lib/status'

const PAGE_SIZE = 20

const TABS: { label: string; status: DriftFindingStatus | undefined }[] = [
  { label: DRIFT_STATUS_LABELS.OPEN, status: 'OPEN' },
  { label: DRIFT_STATUS_LABELS.RESOLVED, status: 'RESOLVED' },
]

/** 드리프트 대상 표기 — vm id·Proxmox vmid·노드 조합. */
function targetOf(finding: DriftFindingView): string {
  const parts = [
    // v0.9.0: prefer the VM name when known, falling back to its id.
    finding.vmName ?? (finding.vmId != null ? '이름 미상 VM' : null),
    finding.proxmoxVmid != null ? `vmid ${finding.proxmoxVmid}` : null,
    finding.nodeName ?? null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

/** 드리프트 리포트 — DB↔Proxmox 불일치 발견을 확인·해결 처리한다 (SYS_ADMIN). */
export function AdminDriftPage() {
  const { user } = useAuth()
  // 해결 처리는 시스템 운영자 이상 — 시스템 열람자는 조회만.
  const canResolve = !!user && canRunSysRoutine(user.role)
  const [status, setStatus] = useState<DriftFindingStatus>('OPEN')
  const [page, setPage] = useState(0)
  const [resolveTarget, setResolveTarget] = useState<DriftFindingView | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const findings = useQuery({
    queryKey: ['admin', 'drift-findings', { status, page }],
    queryFn: () => fetchDriftFindings({ status, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">드리프트</h1>
        <p className="mt-1 text-sm text-neutral-500">
          조정자(reconciler)가 감지한 DB와 Proxmox 사이의 불일치입니다. 더 이상 관측되지
          않으면 자동으로 해소됩니다.
        </p>
      </div>

      <FilterBar
        tabs={TABS}
        status={status}
        onStatus={(next) => {
          setStatus(next ?? 'OPEN')
          setPage(0)
        }}
        showOrgFilter={false}
        orgId={undefined}
        onOrg={() => {}}
        orgs={[]}
      />

      {message && <Alert variant="info">{message}</Alert>}

      {findings.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="드리프트 목록 불러오는 중" />
        </div>
      )}
      {findings.isError && <Alert variant="danger">{findings.error.message}</Alert>}
      {findings.isSuccess && findings.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          {status === 'OPEN' ? '미해결 드리프트가 없습니다.' : '해결된 드리프트가 없습니다.'}
        </Card>
      )}
      {findings.isSuccess && findings.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>유형</TH>
                  <TH>대상</TH>
                  <TH>요약</TH>
                  <TH>감지</TH>
                  <TH>상태</TH>
                  {canResolve && (
                    <TH>
                      <span className="sr-only">작업</span>
                    </TH>
                  )}
                </TR>
              </THead>
              <TBody>
                {findings.data.content.map((finding) => (
                  <TR key={finding.id}>
                    <TD>
                      <DriftKindBadge kind={finding.kind} />
                    </TD>
                    <TD className="whitespace-nowrap font-mono text-xs">
                      {targetOf(finding)}
                    </TD>
                    <TD className="max-w-md text-sm text-neutral-700">{finding.summary}</TD>
                    <TD className="whitespace-nowrap text-xs text-neutral-500">
                      첫 {formatDateTime(finding.firstSeenAt)}
                      <span className="block">최근 {formatDateTime(finding.lastSeenAt)}</span>
                    </TD>
                    <TD>
                      <DriftStatusBadge status={finding.status} />
                      {finding.status === 'RESOLVED' && (
                        <span className="mt-0.5 block text-xs text-neutral-500">
                          {finding.resolvedByEmail ?? '자동 해소'}
                        </span>
                      )}
                      {finding.resolutionNote && (
                        <span className="mt-0.5 block max-w-xs truncate text-xs text-neutral-400">
                          {finding.resolutionNote}
                        </span>
                      )}
                    </TD>
                    {canResolve && (
                      <TD className="text-right">
                        {finding.status === 'OPEN' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setResolveTarget(finding)}
                          >
                            해결 처리
                          </Button>
                        )}
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Pagination
            page={findings.data.page}
            totalPages={findings.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      {resolveTarget && (
        <ResolveModal
          finding={resolveTarget}
          onClose={() => setResolveTarget(null)}
          onDone={(text) => {
            setResolveTarget(null)
            setMessage(text)
          }}
        />
      )}
    </div>
  )
}

function ResolveModal({
  finding,
  onClose,
  onDone,
}: {
  finding: DriftFindingView
  onClose: () => void
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const resolve = useMutation({
    mutationFn: () => resolveDriftFinding(finding.id, note.trim() || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'drift-findings'] })
      onDone('드리프트를 해결 처리했습니다.')
    },
    onError: (err) =>
      setError(toApiError(err, '드리프트를 해결 처리하지 못했습니다.').message),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="드리프트 해결 처리"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button loading={resolve.isPending} onClick={() => resolve.mutate()}>
            해결 처리
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-neutral-600">{finding.summary}</p>
        {error && <Alert variant="danger">{error}</Alert>}
        <label className="block space-y-1.5 text-sm font-medium text-neutral-700">
          해결 메모 (선택)
          <Textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="예: 잔여 게스트를 수동 정리했습니다."
          />
        </label>
      </div>
    </Modal>
  )
}
