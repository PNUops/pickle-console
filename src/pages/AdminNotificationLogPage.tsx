import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAdminNotifications,
  resendAdminNotification,
  type AdminNotificationView,
  type NotificationDeliveryStatus,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { canRunSysRoutine } from '../auth/permissions'
import { FilterBar } from '../components/FilterBar'
import {
  Alert,
  Button,
  Card,
  DeliveryStatusBadge,
  Modal,
  Pagination,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui'
import { formatDateTime } from '../lib/format'
import { DELIVERY_STATUS_LABELS } from '../lib/status'

const PAGE_SIZE = 20

const TABS: { label: string; status: NotificationDeliveryStatus | undefined }[] = [
  { label: '전체', status: undefined },
  { label: DELIVERY_STATUS_LABELS.SENT, status: 'SENT' },
  { label: DELIVERY_STATUS_LABELS.FAILED, status: 'FAILED' },
  { label: DELIVERY_STATUS_LABELS.PENDING, status: 'PENDING' },
]

/** 알림 발송 이력 — 이메일 채널 발송 로그와 실패 건 재발송 (SYS_ADMIN). */
export function AdminNotificationLogPage() {
  const { user } = useAuth()
  // 재발송은 시스템 운영자 이상 — 시스템 열람자는 조회만.
  const canResend = !!user && canRunSysRoutine(user.role)
  const [status, setStatus] = useState<NotificationDeliveryStatus | undefined>(undefined)
  const [page, setPage] = useState(0)
  const [resendTarget, setResendTarget] = useState<AdminNotificationView | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const log = useQuery({
    queryKey: ['admin', 'notification-log', { status: status ?? null, page }],
    queryFn: () => fetchAdminNotifications({ status, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">알림 발송 이력</h1>
        <p className="mt-1 text-sm text-neutral-500">
          이메일 알림 발송 로그입니다. 발송에 실패한 알림은 원인 확인 후 재발송할 수
          있습니다.
        </p>
      </div>

      <FilterBar
        tabs={TABS}
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

      {log.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="발송 이력 불러오는 중" />
        </div>
      )}
      {log.isError && <Alert variant="danger">{log.error.message}</Alert>}
      {log.isSuccess && log.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          조건에 맞는 발송 이력이 없습니다.
        </Card>
      )}
      {log.isSuccess && log.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>수신자</TH>
                  <TH>제목</TH>
                  <TH>이벤트</TH>
                  <TH>상태</TH>
                  <TH>생성·발송 시각</TH>
                  {canResend && (
                    <TH>
                      <span className="sr-only">재발송</span>
                    </TH>
                  )}
                </TR>
              </THead>
              <TBody>
                {log.data.content.map((notification) => (
                  <TR key={notification.id}>
                    <TD className="font-mono text-xs">{notification.userEmail}</TD>
                    <TD className="max-w-xs">
                      <span className="block truncate">{notification.title}</span>
                    </TD>
                    <TD className="font-mono text-xs">{notification.event}</TD>
                    <TD>
                      <DeliveryStatusBadge status={notification.status} />
                      {notification.lastError && (
                        <span
                          title={notification.lastError}
                          className="mt-0.5 block max-w-xs truncate text-xs text-danger-600"
                        >
                          {notification.lastError}
                        </span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-neutral-500">
                      {formatDateTime(notification.createdAt)}
                      <span className="block">
                        {notification.sentAt
                          ? `발송 ${formatDateTime(notification.sentAt)}`
                          : '미발송'}
                      </span>
                    </TD>
                    {canResend && (
                      <TD className="text-right">
                        {/* 계약: FAILED만 재발송 가능 */}
                        {notification.status === 'FAILED' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setResendTarget(notification)}
                          >
                            재발송
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
            page={log.data.page}
            totalPages={log.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      {resendTarget && (
        <ResendConfirmModal
          notification={resendTarget}
          onClose={() => setResendTarget(null)}
          onDone={(text) => {
            setResendTarget(null)
            setMessage(text)
          }}
        />
      )}
    </div>
  )
}

function ResendConfirmModal({
  notification,
  onClose,
  onDone,
}: {
  notification: AdminNotificationView
  onClose: () => void
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const resend = useMutation({
    mutationFn: () => resendAdminNotification(notification.id),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'notification-log'] })
      onDone(data.message)
    },
    onError: (err) =>
      setError(toApiError(err, '알림 재발송을 접수하지 못했습니다.').message),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="알림 재발송"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button loading={resend.isPending} onClick={() => resend.mutate()}>
            재발송
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-neutral-600">
          <strong>{notification.userEmail}</strong>에게{' '}
          <strong>{notification.title}</strong> 알림 이메일을 다시 발송합니다.
        </p>
        {notification.lastError && (
          <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            마지막 오류: {notification.lastError}
          </p>
        )}
        {error && <Alert variant="danger">{error}</Alert>}
      </div>
    </Modal>
  )
}
