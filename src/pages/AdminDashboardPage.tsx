import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchAdminVmRequests } from '../api/queries'
import { useAuth } from '../auth/auth-context'
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Spinner,
} from '../components/ui'
import { formatDateTime } from '../lib/format'

/**
 * 관리자 홈 — 승인 대기 요약 카드만 제공한다 (전체 대시보드는 M5).
 */
export function AdminDashboardPage() {
  const { user } = useAuth()
  const pending = useQuery({
    queryKey: ['admin', 'vm-requests', { status: 'SUBMITTED', page: 0, size: 5 }],
    queryFn: () => fetchAdminVmRequests({ status: 'SUBMITTED', page: 0, size: 5 }),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">관리자 대시보드</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {user?.name}님, 환영합니다. 승인 대기 중인 신청을 확인해 주세요.
        </p>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between gap-4">
          <CardTitle>승인 대기</CardTitle>
          <Link
            to="/admin/requests"
            className="text-sm font-medium text-primary-700 hover:underline"
          >
            전체 보기 →
          </Link>
        </CardHeader>
        <CardContent>
          {pending.isPending && (
            <div className="flex justify-center py-6">
              <Spinner label="승인 대기 현황 불러오는 중" />
            </div>
          )}
          {pending.isError && <Alert variant="danger">{pending.error.message}</Alert>}
          {pending.isSuccess && (
            <div className="space-y-4">
              <p className="text-sm text-neutral-600">
                검토를 기다리는 신청이{' '}
                <strong className="text-lg font-bold text-primary-700">
                  {pending.data.totalElements}건
                </strong>{' '}
                있습니다.
              </p>
              {pending.data.content.length > 0 && (
                <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                  {pending.data.content.map((request) => (
                    <li key={request.id}>
                      <Link
                        to={`/admin/requests/${request.id}`}
                        className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-primary-600"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-neutral-900">
                            {request.purpose}
                          </span>
                          <span className="mt-0.5 block text-xs text-neutral-500">
                            {request.requesterName} · {request.groupName}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-neutral-400">
                          {formatDateTime(request.createdAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
