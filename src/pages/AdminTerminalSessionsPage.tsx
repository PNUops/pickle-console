import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAdminTerminalSessions,
  terminateTerminalSession,
  type TerminalSessionView,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { isSysAdminOnly } from '../auth/permissions'
import {
  Alert,
  Button,
  Card,
  Modal,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from '../components/ui'
import { formatDateTime } from '../lib/format'

/** 라이브 세션 목록 폴링 주기 (승인 큐와 동일 컨벤션). */
const POLL_MS = import.meta.env.MODE === 'test' ? 250 : 30_000

export function AdminTerminalSessionsPage() {
  const { user } = useAuth()
  const canTerminate = !!user && isSysAdminOnly(user.role)

  const sessions = useQuery({
    queryKey: ['admin', 'terminal-sessions'],
    queryFn: fetchAdminTerminalSessions,
    refetchInterval: POLL_MS,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">웹 터미널 세션</h1>
        <p className="mt-1 text-sm text-neutral-500">
          현재 진행 중인 웹 터미널 세션입니다. 터미널 내용은 어디에도 기록되지 않으며,
          세션 수명주기만 감사에 남습니다.
        </p>
      </div>

      {sessions.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="세션 목록 불러오는 중" />
        </div>
      )}
      {sessions.isError && <Alert variant="danger">{sessions.error.message}</Alert>}
      {sessions.isSuccess && sessions.data.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          진행 중인 웹 터미널 세션이 없습니다.
        </Card>
      )}
      {sessions.isSuccess && sessions.data.length > 0 && (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>VM</TH>
                <TH>기관</TH>
                <TH>워크스페이스</TH>
                <TH>사용자</TH>
                <TH>클라이언트 IP</TH>
                <TH>시작 시각</TH>
                {canTerminate && <TH>작업</TH>}
              </TR>
            </THead>
            <TBody>
              {sessions.data.map((session) => (
                <SessionRow
                  key={session.sessionId}
                  session={session}
                  canTerminate={canTerminate}
                />
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  )
}

function SessionRow({
  session,
  canTerminate,
}: {
  session: TerminalSessionView
  canTerminate: boolean
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const terminate = useMutation({
    mutationFn: () => terminateTerminalSession(session.sessionId),
    onSuccess: async () => {
      setConfirmOpen(false)
      setError(null)
      toast.success('세션 강제 종료를 지시했습니다.')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'terminal-sessions'] })
    },
    onError: (err) => {
      setConfirmOpen(false)
      setError(toApiError(err, '세션을 종료하지 못했습니다.').message)
    },
  })

  return (
    <TR>
      <TD className="font-medium text-neutral-900">{session.vmName}</TD>
      <TD className="text-neutral-600">{session.orgName}</TD>
      <TD className="text-neutral-600">{session.workspaceName}</TD>
      <TD>
        <div className="text-neutral-900">{session.userName}</div>
        <div className="text-xs text-neutral-500">{session.userEmail}</div>
      </TD>
      <TD className="whitespace-nowrap font-mono text-xs text-neutral-600">
        {session.clientIp}
      </TD>
      <TD className="whitespace-nowrap">{formatDateTime(session.startedAt)}</TD>
      {canTerminate && (
        <TD>
          {error && <Alert variant="danger">{error}</Alert>}
          <Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)}>
            강제 종료
          </Button>
          <Modal
            open={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            title="웹 터미널 세션 강제 종료"
            footer={
              <>
                <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                  돌아가기
                </Button>
                <Button
                  variant="danger"
                  loading={terminate.isPending}
                  onClick={() => terminate.mutate()}
                >
                  강제 종료
                </Button>
              </>
            }
          >
            <div className="space-y-2 text-sm text-neutral-700">
              <Alert variant="warning">
                이 세션의 브라우저 연결이 즉시 닫히고 감사에 기록됩니다.
              </Alert>
              <p>
                {session.userName}님의 <b>{session.vmName}</b> 터미널 세션을 종료합니다.
              </p>
            </div>
          </Modal>
        </TD>
      )}
    </TR>
  )
}
