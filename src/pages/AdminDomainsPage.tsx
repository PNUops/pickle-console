import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  fetchAdminDomains,
  fetchOrgs,
  type DomainKind,
  type DomainStatus,
} from '../api/queries'
import { useAuth } from '../auth/auth-context'
import {
  Alert,
  Card,
  CertificateStatusBadge,
  DomainKindBadge,
  DomainStatusBadge,
  Pagination,
  RouteStatusBadge,
  Select,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui'
import { formatDateTime } from '../lib/format'
import { DOMAIN_KIND_LABELS, DOMAIN_STATUS_LABELS } from '../lib/status'
import { FilterBar } from '../components/FilterBar'

const PAGE_SIZE = 20

const STATUS_TABS: { label: string; status: DomainStatus | undefined }[] = [
  { label: '전체', status: undefined },
  { label: DOMAIN_STATUS_LABELS.ACTIVE, status: 'ACTIVE' },
  { label: DOMAIN_STATUS_LABELS.VERIFYING, status: 'VERIFYING' },
  { label: DOMAIN_STATUS_LABELS.PENDING, status: 'PENDING' },
  { label: DOMAIN_STATUS_LABELS.FAILED, status: 'FAILED' },
]

const KINDS: DomainKind[] = ['AUTO', 'REQUESTED', 'CUSTOM']

export function AdminDomainsPage() {
  const { user } = useAuth()
  const isSysAdmin = user?.role === 'SYS_ADMIN'
  const [status, setStatus] = useState<DomainStatus | undefined>(undefined)
  const [kind, setKind] = useState<DomainKind | undefined>(undefined)
  const [orgId, setOrgId] = useState<number | undefined>(undefined)
  const [page, setPage] = useState(0)

  const domains = useQuery({
    queryKey: [
      'admin',
      'domains',
      { status: status ?? null, kind: kind ?? null, orgId: orgId ?? null, page },
    ],
    queryFn: () => fetchAdminDomains({ status, kind, orgId, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: fetchOrgs, enabled: isSysAdmin })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">도메인</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {isSysAdmin ? '전체' : '우리 기관'} VM에 연결된 도메인(자동·희망 서브도메인·커스텀)과
          라우트·인증서 상태입니다.
        </p>
      </div>

      <FilterBar
        tabs={STATUS_TABS}
        status={status}
        onStatus={(next) => {
          setStatus(next)
          setPage(0)
        }}
        isSysAdmin={isSysAdmin}
        orgId={orgId}
        onOrg={(next) => {
          setOrgId(next)
          setPage(0)
        }}
        orgs={orgs.data ?? []}
      >
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          종류
          <Select
            aria-label="종류 필터"
            className="w-44"
            value={kind ?? ''}
            onChange={(event) => {
              setKind((event.target.value || undefined) as DomainKind | undefined)
              setPage(0)
            }}
          >
            <option value="">전체 종류</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {DOMAIN_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </label>
      </FilterBar>

      {domains.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="도메인 목록 불러오는 중" />
        </div>
      )}
      {domains.isError && <Alert variant="danger">{domains.error.message}</Alert>}
      {domains.isSuccess && domains.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          연결된 도메인이 없습니다.
        </Card>
      )}
      {domains.isSuccess && domains.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>도메인</TH>
                  <TH>VM / 그룹</TH>
                  {isSysAdmin && <TH>기관</TH>}
                  <TH>상태</TH>
                  <TH>라우트</TH>
                  <TH>인증서</TH>
                  <TH>검증일</TH>
                </TR>
              </THead>
              <TBody>
                {domains.data.content.map((domain) => (
                  <TR key={domain.id}>
                    <TD>
                      <span className="font-mono text-sm">{domain.fqdn}</span>
                      <span className="mt-0.5 block">
                        <DomainKindBadge kind={domain.kind} />
                      </span>
                    </TD>
                    <TD>
                      {domain.vmName}
                      <span className="block text-xs text-neutral-500">{domain.groupName}</span>
                    </TD>
                    {isSysAdmin && <TD>{domain.orgName}</TD>}
                    <TD>
                      <DomainStatusBadge status={domain.status} />
                    </TD>
                    <TD>
                      {domain.routeStatus ? (
                        <RouteStatusBadge status={domain.routeStatus} />
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </TD>
                    <TD>
                      {domain.certificateStatus ? (
                        <CertificateStatusBadge status={domain.certificateStatus} />
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-neutral-500">
                      {domain.verifiedAt ? formatDateTime(domain.verifiedAt) : '—'}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Pagination
            page={domains.data.page}
            totalPages={domains.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
