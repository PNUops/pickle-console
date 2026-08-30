import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  fetchAdminCertificates,
  type CertificateStatus,
} from '../api/queries'
import {
  Alert,
  Badge,
  Card,
  CertificateStatusBadge,
  Checkbox,
  Pagination,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from './ui'
import { formatDateTime } from '../lib/format'
import { CERTIFICATE_KIND_LABELS, CERTIFICATE_STATUS_LABELS } from '../lib/status'
import { FilterBar } from './FilterBar'

const PAGE_SIZE = 20

/** 이 일수 이내로 남으면 만료 임박으로 강조한다. */
const EXPIRY_SOON_DAYS = 30

const STATUS_TABS: { label: string; status: CertificateStatus | undefined }[] = [
  { label: '전체', status: undefined },
  { label: CERTIFICATE_STATUS_LABELS.ACTIVE, status: 'ACTIVE' },
  { label: CERTIFICATE_STATUS_LABELS.RENEWING, status: 'RENEWING' },
  { label: CERTIFICATE_STATUS_LABELS.FAILED, status: 'FAILED' },
]

/** 인증서 만료·발급 상태 — 공개 서비스 화면의 인증서 탭 (만료 임박 일괄 점검 축). */
export function CertificatesSection({ orgId }: { orgId?: string }) {
  const [status, setStatus] = useState<CertificateStatus | undefined>(undefined)
  const [expiringSoon, setExpiringSoon] = useState(false)
  const [page, setPage] = useState(0)

  const expiringInDays = expiringSoon ? EXPIRY_SOON_DAYS : undefined

  const certs = useQuery({
    queryKey: [
      'admin',
      'certificates',
      { status: status ?? null, orgId: orgId ?? null, expiringInDays: expiringInDays ?? null, page },
    ],
    queryFn: () => fetchAdminCertificates({ status, orgId, expiringInDays, page, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })
  return (
    <div className="space-y-6">
      <FilterBar
        tabs={STATUS_TABS}
        status={status}
        onStatus={(next) => {
          setStatus(next)
          setPage(0)
        }}
        showOrgFilter={false}
        orgId={orgId}
        onOrg={() => {}}
        orgs={[]}
      >
        <Checkbox
          label={`${EXPIRY_SOON_DAYS}일 이내 만료만`}
          checked={expiringSoon}
          onChange={(event) => {
            setExpiringSoon(event.target.checked)
            setPage(0)
          }}
        />
      </FilterBar>

      {certs.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="인증서 목록 불러오는 중" />
        </div>
      )}
      {certs.isError && <Alert variant="danger">{certs.error.message}</Alert>}
      {certs.isSuccess && certs.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          표시할 인증서가 없습니다.
        </Card>
      )}
      {certs.isSuccess && certs.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>대상</TH>
                  <TH>종류</TH>
                  <TH>상태</TH>
                  <TH>만료일</TH>
                  <TH>남은 기간</TH>
                </TR>
              </THead>
              <TBody>
                {certs.data.content.map((cert) => (
                  <TR key={cert.id}>
                    <TD className="font-mono text-sm">{cert.scope}</TD>
                    <TD className="whitespace-nowrap">{CERTIFICATE_KIND_LABELS[cert.kind]}</TD>
                    <TD>
                      <CertificateStatusBadge status={cert.status} />
                      {cert.status === 'FAILED' && cert.lastError && (
                        <span className="mt-0.5 block max-w-xs truncate text-xs text-danger-600">
                          {cert.lastError}
                        </span>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-sm text-neutral-700">
                      {cert.notAfter ? formatDateTime(cert.notAfter) : '—'}
                    </TD>
                    <TD className="whitespace-nowrap">
                      <ExpiryCell days={cert.daysUntilExpiry} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Pagination
            page={certs.data.page}
            totalPages={certs.data.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}

function ExpiryCell({ days }: { days: number | null | undefined }) {
  if (days == null) return <span className="text-xs text-neutral-400">—</span>
  const soon = days <= EXPIRY_SOON_DAYS
  return (
    <span className="flex items-center gap-2">
      <span className={soon ? 'text-danger-700' : 'text-neutral-700'}>{days}일</span>
      {soon && <Badge variant="warning">만료 임박</Badge>}
    </span>
  )
}
