import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchMyActivity } from '../api/queries'
import {
  Alert,
  Card,
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
import { labelForAuditAction } from '../lib/status'

const PAGE_SIZE = 20

/** 내 활동 — 본인 계정의 활동·로그인 기록 (감사 로그의 본인 행 뷰). */
export function MyActivityPage() {
  const [page, setPage] = useState(0)

  const activity = useQuery({
    queryKey: ['me', 'activity', { page }],
    queryFn: () => fetchMyActivity({ page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">내 활동</h1>
        <p className="mt-1 text-sm text-neutral-500">
          내 계정 활동과 로그인 기록입니다. 낯선 IP가 보이면 비밀번호를 변경해 주세요.
        </p>
      </div>

      {activity.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="활동 이력 불러오는 중" />
        </div>
      )}
      {activity.isError && <Alert variant="danger">{activity.error.message}</Alert>}
      {activity.isSuccess && activity.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          활동 기록이 없습니다.
        </Card>
      )}
      {activity.isSuccess && activity.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>시각</TH>
                  <TH>활동</TH>
                  <TH>대상</TH>
                  <TH>IP</TH>
                </TR>
              </THead>
              <TBody>
                {activity.data.content.map((entry) => (
                  <TR key={entry.id}>
                    <TD className="whitespace-nowrap text-xs text-neutral-500">
                      {formatDateTime(entry.createdAt)}
                    </TD>
                    <TD>{labelForAuditAction(entry.action)}</TD>
                    <TD className="font-mono text-xs">
                      {entry.targetType ? `${entry.targetType}:${entry.targetId ?? '—'}` : '—'}
                    </TD>
                    <TD className="font-mono text-xs">{entry.ip ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Pagination
            page={activity.data.page}
            totalPages={activity.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
