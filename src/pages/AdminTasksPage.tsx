import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAdminTasks,
  retryAdminTask,
  type AdminTaskView,
  type ProvisioningTaskStatus,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { FilterBar } from '../components/FilterBar'
import {
  Alert,
  Button,
  Card,
  Modal,
  Pagination,
  Spinner,
  Table,
  TaskStatusBadge,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui'
import { formatDateTime } from '../lib/format'
import { PROVISIONING_KIND_LABELS, TASK_STATUS_LABELS } from '../lib/status'

const PAGE_SIZE = 20

// 계약의 status 파라미터는 단일 값이라 진행 계열(RUNNING/RETRYING/PENDING)은 탭을 나눈다.
const STATUS_TABS: { label: string; status: ProvisioningTaskStatus | undefined }[] = [
  { label: '전체', status: undefined },
  { label: TASK_STATUS_LABELS.NEEDS_ADMIN, status: 'NEEDS_ADMIN' },
  { label: TASK_STATUS_LABELS.FAILED, status: 'FAILED' },
  { label: TASK_STATUS_LABELS.RUNNING, status: 'RUNNING' },
  { label: TASK_STATUS_LABELS.RETRYING, status: 'RETRYING' },
  { label: TASK_STATUS_LABELS.PENDING, status: 'PENDING' },
]

/** 작업(태스크) 큐 — SYS_ADMIN이 NEEDS_ADMIN 작업의 원인을 확인하고 재시도한다. */
export function AdminTasksPage() {
  const [status, setStatus] = useState<ProvisioningTaskStatus | undefined>(undefined)
  const [page, setPage] = useState(0)
  const [retryTarget, setRetryTarget] = useState<AdminTaskView | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const tasks = useQuery({
    queryKey: ['admin', 'tasks', { status: status ?? null, page }],
    queryFn: () => fetchAdminTasks({ status, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    // 진행 계열 작업이 보이는 동안만 폴링 (VM 목록의 전이 중 폴링과 같은 패턴).
    refetchInterval: (query) =>
      query.state.data?.content.some((task) =>
        ['PENDING', 'RUNNING', 'RETRYING'].includes(task.status),
      )
        ? 5000
        : false,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">작업 큐</h1>
        <p className="mt-1 text-sm text-neutral-500">
          VM 비동기 작업(생성·삭제·재설치) 현황입니다. 재시도가 소진된 작업(관리자 확인
          필요)은 원인 해결 후 재시도할 수 있습니다.
        </p>
      </div>

      <FilterBar
        tabs={STATUS_TABS}
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

      {tasks.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="작업 목록 불러오는 중" />
        </div>
      )}
      {tasks.isError && <Alert variant="danger">{tasks.error.message}</Alert>}
      {tasks.isSuccess && tasks.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">작업이 없습니다.</Card>
      )}
      {tasks.isSuccess && tasks.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>작업</TH>
                  <TH>VM</TH>
                  <TH>워크스페이스</TH>
                  <TH>기관</TH>
                  <TH>상태</TH>
                  <TH>시도</TH>
                  <TH>갱신 시각</TH>
                  <TH>
                    <span className="sr-only">재시도</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {tasks.data.content.map((task) => (
                  <TR key={task.taskId}>
                    <TD>
                      <span className="font-medium text-neutral-900">
                        {PROVISIONING_KIND_LABELS[task.kind]}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {task.stepLabel} ({task.currentStep}/{task.totalSteps})
                      </span>
                    </TD>
                    <TD>
                      {task.vmName ?? '이름 미상 VM'}
                      {/* hostname은 이름과 다를 때만 보조 표기 (중복 노출 방지) */}
                      {task.hostname && task.hostname !== task.vmName && (
                        <span className="block font-mono text-xs text-neutral-500">
                          {task.hostname}
                        </span>
                      )}
                    </TD>
                    <TD>{task.workspaceName ?? '—'}</TD>
                    <TD>{task.orgName ?? '—'}</TD>
                    <TD>
                      <TaskStatusBadge status={task.status} />
                      {task.lastError && (
                        <span
                          title={task.lastError}
                          className="mt-0.5 block max-w-xs truncate text-xs text-danger-600"
                        >
                          {task.lastError}
                        </span>
                      )}
                    </TD>
                    <TD>{task.attempts}</TD>
                    <TD className="whitespace-nowrap text-xs text-neutral-500">
                      {formatDateTime(task.updatedAt)}
                    </TD>
                    <TD className="text-right">
                      {/* 계약: NEEDS_ADMIN만 재시도 가능 (그 외 409) */}
                      {task.status === 'NEEDS_ADMIN' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setRetryTarget(task)}
                        >
                          재시도
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Pagination
            page={tasks.data.page}
            totalPages={tasks.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      {retryTarget && (
        <RetryConfirmModal
          task={retryTarget}
          onClose={() => setRetryTarget(null)}
          onDone={(text) => {
            setRetryTarget(null)
            setMessage(text)
          }}
        />
      )}
    </div>
  )
}

function RetryConfirmModal({
  task,
  onClose,
  onDone,
}: {
  task: AdminTaskView
  onClose: () => void
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const retry = useMutation({
    mutationFn: () => retryAdminTask(task.taskId),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'tasks'] })
      onDone(data.message)
    },
    onError: (err) =>
      setError(toApiError(err, '작업 재시도를 접수하지 못했습니다.').message),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="작업 재시도"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button loading={retry.isPending} onClick={() => retry.mutate()}>
            재시도
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-neutral-600">
          <strong>{task.vmName ?? '이름 미상 VM'}</strong>의{' '}
          {PROVISIONING_KIND_LABELS[task.kind]} 작업을 실패한 단계(
          {task.stepLabel})부터 다시 시도합니다. 원인을 해결한 뒤 실행해 주세요.
        </p>
        {task.lastError && (
          <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            마지막 오류: {task.lastError}
          </p>
        )}
        {error && <Alert variant="danger">{error}</Alert>}
      </div>
    </Modal>
  )
}
