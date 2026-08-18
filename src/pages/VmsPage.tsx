import { useState } from 'react'
import { Link } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchVms } from '../api/queries'
import {
  Alert,
  Card,
  LinkButton,
  Pagination,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  VmStatusBadge,
} from '../components/ui'
import { formatDateTime, formatSpec } from '../lib/format'
import { consolePaths } from '../lib/paths'
import { useScope } from '../lib/use-scope'

export function VmsPage() {
  const scope = useScope()
  const [page, setPage] = useState(0)
  const vms = useQuery({
    queryKey: ['vms', { page, workspaceId: scope }],
    queryFn: () => fetchVms({ page, workspaceId: scope ?? undefined }),
    placeholderData: keepPreviousData,
    // 비동기 전이 중(생성·삭제·재부팅) VM이 있으면 3초마다 새로 고친다 (상세와 동일 기준).
    refetchInterval: (query) =>
      query.state.data?.content.some((vm) =>
        ['CREATING', 'DELETING', 'REBOOTING'].includes(vm.status),
      )
        ? 3000
        : false,
  })
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">내 가상머신</h1>
          <p className="mt-1 text-sm text-neutral-500">
            내가 속한 워크스페이스의 가상머신 목록입니다. 승인된 신청의 가상머신은 생성이 끝나면
            실행 중으로 바뀝니다.
          </p>
        </div>
        <LinkButton to={consolePaths.newRequest(scope, 'VM')}>가상머신 신청</LinkButton>
      </div>

      {vms.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="VM 목록 불러오는 중" />
        </div>
      )}
      {vms.isError && <Alert variant="danger">{vms.error.message}</Alert>}
      {vms.isSuccess && vms.data.content.length === 0 && (
        <Card className="space-y-4 p-8 text-center text-sm text-neutral-500">
          <p>아직 가상머신이 없습니다. 신청이 승인되면 이곳에 표시됩니다.</p>
          <LinkButton to={consolePaths.newRequest(scope, 'VM')}>가상머신 신청</LinkButton>
        </Card>
      )}
      {vms.isSuccess && vms.data.content.length > 0 && (
        <>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>이름</TH>
                  <TH>상태</TH>
                  <TH>사양</TH>
                  <TH>워크스페이스</TH>
                  <TH>생성일</TH>
                </TR>
              </THead>
              <TBody>
                {vms.data.content.map((vm) => (
                  <TR key={vm.id}>
                    <TD>
                      {vm.accessLimited ? (
                        <span className="font-medium text-neutral-500">
                          {vm.displayName || vm.name}
                        </span>
                      ) : (
                        <Link
                          to={`/console/vms/${vm.id}`}
                          className="font-medium text-primary-700 hover:underline"
                        >
                          {vm.displayName || vm.name}
                        </Link>
                      )}
                      {vm.displayName && (
                        <span className="ml-1 text-xs text-neutral-400">{vm.name}</span>
                      )}
                      {vm.accessLimited && (
                        <p className="mt-0.5 text-xs text-neutral-500">
                          접근 권한이 없습니다
                          {vm.ownerNames.length > 0 &&
                            ` — ${vm.ownerNames.join(', ')} 님에게 요청하세요`}
                          {/* 워크스페이스 소유자는 이 VM 안을 볼 수 없어도 누가 접근할지는
                              정할 수 있다. 상세로 못 들어가므로 목록이 그 유일한
                              진입점이고, 소유자가 떠난 VM을 되살리는 길이기도 하다. */}
                          {vm.accessManageAllowed && (
                            <>
                              {' '}
                              <Link
                                to={`/console/vms/${vm.id}/access`}
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
                      <VmStatusBadge status={vm.status} />
                    </TD>
                    <TD className="whitespace-nowrap">
                      {formatSpec(vm.vcpu, vm.memoryMb, vm.diskGb)}
                    </TD>
                    <TD>{vm.workspaceName}</TD>
                    <TD className="whitespace-nowrap">{formatDateTime(vm.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Pagination page={vms.data.page} totalPages={vms.data.totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}
