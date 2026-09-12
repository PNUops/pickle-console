import { useState } from 'react'
import { Link } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createDnsDomain, fetchDnsDomains, fetchWorkspaces } from '../api/queries'
import {
  Alert,
  Button,
  Card,
  DomainStatusBadge,
  FormField,
  Input,
  Modal,
  Pagination,
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
import { consolePaths } from '../lib/paths'
import { useScope } from '../lib/use-scope'

/**
 * The names issued on their own, with no VM behind them.
 *
 * The one resource list with no request button: nothing approves these, so
 * there is no form to fill in and the name is made here.
 */
export function DnsDomainsPage() {
  const scope = useScope()
  const [page, setPage] = useState(0)
  const [creating, setCreating] = useState(false)
  const domains = useQuery({
    queryKey: ['dns-domains', { page, workspaceId: scope }],
    queryFn: () => fetchDnsDomains({ page, workspaceId: scope ?? undefined }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">내 도메인</h1>
          <p className="mt-1 text-sm text-neutral-500">
            승인 없이 바로 발급되며, 레코드는 플랫폼 밖 서버도 가리킬 수 있습니다.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>도메인 발급</Button>
      </div>

      {domains.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="도메인 목록 불러오는 중" />
        </div>
      )}
      {domains.isError && <Alert variant="danger">{domains.error.message}</Alert>}
      {domains.isSuccess && domains.data.content.length === 0 && (
        <Card className="space-y-4 p-8 text-center text-sm text-neutral-500">
          <p>아직 발급받은 도메인이 없습니다.</p>
          <div>
            <Button onClick={() => setCreating(true)}>도메인 발급</Button>
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
                              and the only way to take back a name whose
                              issuer has left. */}
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
                      <DomainStatusBadge status={domain.status} />
                      {domain.releasedAt && (
                        <p className="mt-0.5 text-xs text-neutral-500">
                          해제됨 — {domain.reservedUntil && formatDateTime(domain.reservedUntil)}
                          까지 같은 이름으로 다시 만들 수 있습니다
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

      {creating && <CreateDnsDomainModal onClose={() => setCreating(false)} />}
    </div>
  )
}

function CreateDnsDomainModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [label, setLabel] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: () => fetchWorkspaces() })
  const create = useMutation({
    mutationFn: () => createDnsDomain({ label, workspaceId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dns-domains'] })
      void queryClient.invalidateQueries({ queryKey: ['resources'] })
      onClose()
    },
  })

  return (
    <Modal
      open
      title="도메인 발급"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button
            onClick={() => create.mutate()}
            loading={create.isPending}
            disabled={label.trim() === '' || workspaceId === ''}
          >
            발급
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {create.isError && <Alert variant="danger">{create.error.message}</Alert>}
        <FormField label="이름" description="영문 소문자와 숫자, 하이픈만 쓸 수 있습니다.">
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="myblog"
            autoFocus
          />
        </FormField>
        <FormField
          label="워크스페이스"
          description="이 워크스페이스의 구성원에게만 접근 권한을 줄 수 있습니다."
        >
          <Select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
            <option value="">선택해 주세요</option>
            {workspaces.data?.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </Select>
        </FormField>
        {/* One line on what to do next. A reader who receives only a name reads
            the silence as "the site is broken". */}
        <p className="text-sm text-neutral-500">
          발급한 뒤 상세 화면에서 레코드를 넣어야 주소가 열립니다.
        </p>
      </div>
    </Modal>
  )
}
