import { useState } from 'react'
import { Link } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchDnsDomains, reviveDnsDomain } from '../api/queries'
import {
  Alert,
  Badge,
  Button,
  Card,
  DomainStatusBadge,
  LinkButton,
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
import { consolePaths } from '../lib/paths'
import { useScope } from '../lib/use-scope'

/**
 * The names issued on their own, with no VM behind them.
 *
 * <p>Asked for through the request wizard like every other kind. It was made
 * here for four days, and the shape was consistent — nothing approved these,
 * so there was no form to fill in — but a person looking for how to get a name
 * goes to where requests are made, finds no domain there, and concludes the
 * platform does not offer one. Whether the request then waits for a reviewer
 * is the chosen root's answer, not this screen's.</p>
 */
export function DnsDomainsPage() {
  const scope = useScope()
  const [page, setPage] = useState(0)
  const domains = useQuery({
    queryKey: ['dns-domains', { page, workspaceId: scope }],
    queryFn: () => fetchDnsDomains({ page, workspaceId: scope ?? undefined }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">도메인</h1>
          <p className="mt-1 text-sm text-neutral-500">
            레코드는 플랫폼 밖 서버도 가리킬 수 있습니다.
          </p>
        </div>
        <LinkButton to={consolePaths.newRequest(scope, 'DOMAIN')}>도메인 신청</LinkButton>
      </div>

      {domains.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="도메인 목록 불러오는 중" />
        </div>
      )}
      {domains.isError && <Alert variant="danger">{domains.error.message}</Alert>}
      {domains.isSuccess && domains.data.content.length === 0 && (
        <Card className="space-y-4 p-8 text-center text-sm text-neutral-500">
          <p>
            {scope == null
              ? '접근 권한을 가진 도메인이 없습니다. 워크스페이스를 고르면 그 워크스페이스의 도메인을 볼 수 있습니다.'
              : '이 워크스페이스에는 아직 발급받은 도메인이 없습니다.'}
          </p>
          <div>
            <LinkButton to={consolePaths.newRequest(scope, 'DOMAIN')}>도메인 신청</LinkButton>
          </div>
        </Card>
      )}
      {domains.isSuccess && domains.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>이름</TH>
                  <TH>상태</TH>
                  <TH>레코드</TH>
                  <TH>사용 기한</TH>
                  <TH>워크스페이스</TH>
                  <TH>발급일</TH>
                  <TH>
                    <span className="sr-only">작업</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {domains.data.content.map((domain) => (
                  <TR key={domain.id}>
                    <TD>
                      {domain.accessLimited ? (
                        <span className="font-medium text-neutral-500">{domain.fqdn}</span>
                      ) : (
                        <Link
                          to={consolePaths.dnsDomainDetail(domain.id)}
                          className="font-medium text-primary-700 hover:underline"
                        >
                          {domain.fqdn}
                        </Link>
                      )}
                      {domain.accessLimited && (
                        <p className="mt-0.5 text-xs text-neutral-500">
                          접근 권한이 없습니다
                          {domain.ownerNames.length > 0 &&
                            ` — ${domain.ownerNames.join(', ')} 님에게 요청하세요`}
                          {/* A workspace owner who cannot see inside this
                              domain may still decide who can. The detail is
                              closed to them, so this list is the only way in,
                              and the only way to take back a name whose issuer
                              has left. A row they hold no grant on reaches them
                              only under the workspace's own scope, since the
                              unscoped listing carries what a grant opens. */}
                          {domain.accessManageAllowed && (
                            <>
                              {' '}
                              <Link
                                to={consolePaths.dnsDomainAccess(domain.id)}
                                className="font-medium text-primary-700 hover:underline"
                              >
                                접근 권한 관리
                              </Link>
                            </>
                          )}
                        </p>
                      )}
                    </TD>
                    <TD>
                      {/* Release does not move `status` on the server, so the
                          plain badge reads 연결됨 right above the release note.
                          The reservation is the state this cell has to carry —
                          the detail header makes the same substitution. */}
                      {domain.releasedAt ? (
                        <Badge variant="neutral">예약 중</Badge>
                      ) : (
                        <DomainStatusBadge status={domain.status} />
                      )}
                      {domain.releasedAt && (
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {domain.reservedUntil
                            ? `${formatDateTime(domain.reservedUntil)}까지 `
                            : '예약이 끝나기 전까지 '}
                          되살릴 수 있습니다
                        </p>
                      )}
                    </TD>
                    {/* The server sends 0 for a restricted row. Writing "none"
                        and "cannot see" with the same character would conflate
                        them, so the name cell carries the explanation and this
                        one shows a dash. */}
                    <TD>{domain.accessLimited ? '—' : `${domain.recordSetCount}개`}</TD>
                    <TD className="whitespace-nowrap">{formatDateTime(domain.renewDueAt)}</TD>
                    <TD>{domain.workspaceName}</TD>
                    <TD className="whitespace-nowrap">{formatDateTime(domain.createdAt)}</TD>
                    {/* Reviving is the one action this list carries. It is not
                        a request: the name and the cap slot are already this
                        workspace's, and the reservation can run out inside an
                        approval queue. */}
                    <TD>{domain.releasedAt && <ReviveButton domainId={domain.id} />}</TD>
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

function ReviveButton({ domainId }: { domainId: string }) {
  const queryClient = useQueryClient()
  const revive = useMutation({
    mutationFn: () => reviveDnsDomain(domainId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dns-domains'] })
      void queryClient.invalidateQueries({ queryKey: ['resources'] })
    },
  })

  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => revive.mutate()}
        loading={revive.isPending}
      >
        되살리기
      </Button>
      {revive.isError && <p className="text-xs text-danger-700">{revive.error.message}</p>}
    </div>
  )
}
