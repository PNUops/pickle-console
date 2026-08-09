import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchVmAccessGrants } from '../api/queries'
import { VmAccessSection } from '../components/VmAccessSection'
import { Alert, Spinner, VmStatusBadge } from '../components/ui'

/**
 * VM 하나의 접근 권한만 다루는 화면.
 *
 * VM 상세와 따로 있는 이유가 있다 — 이 화면을 여는 사람은 그 VM의 상세를 열 수
 * 없는 경우가 있다. 그룹 소유자는 접근 목록에 없으면 안을 못 보지만 누가 접근할지는
 * 정할 수 있고, 소유자가 그룹을 떠난 VM을 되살리는 길이 그것뿐이다. 그래서 여기서는
 * 상세를 부르지 않고, 이름·상태는 접근 목록 응답이 함께 주는 것만 쓴다.
 */
export function VmAccessPage() {
  const params = useParams()
  const vmId = Number(params.vmId)
  const access = useQuery({
    queryKey: ['vms', vmId, 'access'],
    queryFn: () => fetchVmAccessGrants(vmId),
  })
  const vm = access.data?.vm

  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link to="/console/vms" className="text-primary-700 hover:underline">
          ← 내 VM
        </Link>
      </nav>

      {access.isPending ? (
        <Spinner label="접근 권한 불러오는 중" />
      ) : access.isError ? (
        <Alert variant="danger">{access.error.message}</Alert>
      ) : (
        <>
          <header className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-neutral-900">
                {vm?.displayName || vm?.name}
              </h1>
              {vm && <VmStatusBadge status={vm.status} />}
            </div>
            <p className="text-sm text-neutral-500">
              {vm?.displayName && (
                <span className="mr-2 text-neutral-400">{vm.name}</span>
              )}
              {vm?.groupName} 소유
            </p>
          </header>
          <VmAccessSection vmId={vmId} />
        </>
      )}
    </div>
  )
}
