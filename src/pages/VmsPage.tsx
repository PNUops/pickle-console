import { useState } from 'react'
import { Link } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchVms } from '../api/queries'
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
  VmStatusBadge,
} from '../components/ui'
import { formatDateTime, formatSpec } from '../lib/format'

export function VmsPage() {
  const [page, setPage] = useState(0)
  const vms = useQuery({
    queryKey: ['vms', { page }],
    queryFn: () => fetchVms({ page }),
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
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">내 VM</h1>
        <p className="mt-1 text-sm text-neutral-500">
          내가 속한 그룹의 VM 목록입니다. 승인된 신청의 VM은 생성이 끝나면 실행 중으로
          바뀝니다.
        </p>
      </div>

      {vms.isPending && (
        <div className="flex justify-center py-12">
          <Spinner label="VM 목록 불러오는 중" />
        </div>
      )}
      {vms.isError && <Alert variant="danger">{vms.error.message}</Alert>}
      {vms.isSuccess && vms.data.content.length === 0 && (
        <Card className="p-8 text-center text-sm text-neutral-500">
          아직 VM이 없습니다. VM 신청이 승인되면 이곳에 표시됩니다.
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
                  <TH>그룹</TH>
                  <TH>생성일</TH>
                </TR>
              </THead>
              <TBody>
                {vms.data.content.map((vm) => (
                  <TR key={vm.id}>
                    <TD>
                      <Link
                        to={`/console/vms/${vm.id}`}
                        className="font-medium text-primary-700 hover:underline"
                      >
                        {vm.name}
                      </Link>
                    </TD>
                    <TD>
                      <VmStatusBadge status={vm.status} />
                    </TD>
                    <TD className="whitespace-nowrap">
                      {formatSpec(vm.vcpu, vm.memoryMb, vm.diskGb)}
                    </TD>
                    <TD>{vm.groupName}</TD>
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
