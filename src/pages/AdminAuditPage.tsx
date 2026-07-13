import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchAuditLogs, fetchOrgs } from '../api/queries'
import { useAuth } from '../auth/auth-context'
import { FilterBar } from '../components/FilterBar'
import {
  Alert,
  Badge,
  Card,
  Input,
  Pagination,
  Select,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  type BadgeVariant,
} from '../components/ui'
import { USER_ROLE_LABELS, type UserRole } from '../lib/labels'
import { formatDateTime } from '../lib/format'
import { AUDIT_ACTION_LABELS, labelForAuditAction } from '../lib/status'

const PAGE_SIZE = 20

const ROLE_VARIANTS: Record<UserRole, BadgeVariant> = {
  STUDENT: 'neutral',
  ORG_ADMIN: 'info',
  SYS_ADMIN: 'primary',
}

/** 감사 로그 — 관리자가 행위자·동작·기간으로 활동 기록을 추적한다. */
export function AdminAuditPage() {
  const { user } = useAuth()
  const isSysAdmin = user?.role === 'SYS_ADMIN'
  const [action, setAction] = useState<string | undefined>(undefined)
  const [actorEmail, setActorEmail] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [orgId, setOrgId] = useState<number | undefined>(undefined)
  const [page, setPage] = useState(0)

  const logs = useQuery({
    queryKey: [
      'admin',
      'audit',
      {
        action: action ?? null,
        actorEmail: actorEmail || null,
        from: from || null,
        to: to || null,
        orgId: orgId ?? null,
        page,
      },
    ],
    queryFn: () =>
      fetchAuditLogs({
        action,
        actorEmail: actorEmail || undefined,
        from: from || undefined,
        to: to || undefined,
        orgId,
        page,
        size: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  })
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs, enabled: isSysAdmin })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">감사 로그</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {isSysAdmin ? '전체' : '우리 기관'} 관리자·이용자의 활동 기록입니다. 로그인·설정
          변경·VM 작업 등 주요 동작이 남습니다.
        </p>
      </div>

      <FilterBar
        tabs={[]}
        status={undefined}
        onStatus={() => {}}
        isSysAdmin={isSysAdmin}
        orgId={orgId}
        onOrg={(next) => {
          setOrgId(next)
          setPage(0)
        }}
        orgs={orgs.data ?? []}
      >
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          동작
          <Select
            aria-label="동작 필터"
            className="w-44"
            value={action ?? ''}
            onChange={(event) => {
              setAction(event.target.value || undefined)
              setPage(0)
            }}
          >
            <option value="">전체 동작</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <Input
          aria-label="행위자 이메일 필터"
          placeholder="행위자 이메일"
          className="w-52"
          value={actorEmail}
          onChange={(event) => {
            setActorEmail(event.target.value)
            setPage(0)
          }}
        />
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          기간
          <Input
            type="date"
            aria-label="조회 시작일"
            className="w-40"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value)
              setPage(0)
            }}
          />
          ~
          <Input
            type="date"
            aria-label="조회 종료일"
            className="w-40"
            value={to}
            onChange={(event) => {
              setTo(event.target.value)
              setPage(0)
            }}
          />
        </label>
      </FilterBar>

      {logs.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="감사 로그 불러오는 중" />
        </div>
      )}
      {logs.isError && <Alert variant="danger">{logs.error.message}</Alert>}
      {logs.isSuccess && logs.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          조건에 맞는 기록이 없습니다.
        </Card>
      )}
      {logs.isSuccess && logs.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>시각</TH>
                  <TH>행위자</TH>
                  <TH>동작</TH>
                  <TH>대상</TH>
                  <TH>IP</TH>
                </TR>
              </THead>
              <TBody>
                {logs.data.content.map((log) => (
                  <TR key={log.id}>
                    <TD className="whitespace-nowrap text-xs text-neutral-500">
                      {formatDateTime(log.createdAt)}
                    </TD>
                    <TD>
                      {log.actorId == null ? (
                        <Badge variant="neutral">시스템</Badge>
                      ) : (
                        <>
                          <span className="font-medium text-neutral-900">
                            {log.actorName}
                          </span>
                          {log.actorRole && (
                            <Badge variant={ROLE_VARIANTS[log.actorRole]} className="ml-1.5">
                              {USER_ROLE_LABELS[log.actorRole]}
                            </Badge>
                          )}
                          <span className="block text-xs text-neutral-500">
                            {log.actorEmail}
                          </span>
                        </>
                      )}
                    </TD>
                    <TD>{labelForAuditAction(log.action)}</TD>
                    <TD className="font-mono text-xs">
                      {log.targetType ? `${log.targetType}:${log.targetId ?? '—'}` : '—'}
                    </TD>
                    <TD className="font-mono text-xs">{log.ip ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Pagination
            page={logs.data.page}
            totalPages={logs.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
