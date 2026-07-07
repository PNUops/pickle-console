import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { fetchGroups, fetchVm } from '../api/queries'
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Spinner,
  VmStatusBadge,
} from '../components/ui'
import { formatDateTime, formatSpec } from '../lib/format'

/** CREATING 상태 폴링 주기 (테스트에서는 빠르게 돌려 mock 전이를 관찰한다). */
const CREATING_POLL_MS = import.meta.env.MODE === 'test' ? 50 : 3000

export function VmDetailPage() {
  const params = useParams()
  const vmId = Number(params.vmId)
  const vm = useQuery({
    queryKey: ['vms', vmId],
    queryFn: () => fetchVm(vmId),
    // 생성 중인 동안에는 mock 프로비저닝 완료를 자동으로 반영한다.
    refetchInterval: (query) =>
      query.state.data?.status === 'CREATING' ? CREATING_POLL_MS : false,
  })
  const groups = useQuery({ queryKey: ['groups'], queryFn: fetchGroups })

  if (vm.isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="VM 정보 불러오는 중" />
      </div>
    )
  }
  if (vm.isError) {
    return <Alert variant="danger">{vm.error.message}</Alert>
  }

  const data = vm.data
  const groupName = groups.data?.find((g) => g.id === data.groupId)?.name ?? `그룹 #${data.groupId}`

  return (
    <div className="space-y-6">
      <nav className="text-sm">
        <Link to="/console/vms" className="text-primary-700 hover:underline">
          ← 내 VM
        </Link>
      </nav>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-neutral-900">{data.name}</h1>
          <VmStatusBadge status={data.status} />
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {data.hostname} · {groupName}
        </p>
      </div>

      {data.status === 'CREATING' && (
        <Alert variant="info">
          VM을 생성하고 있습니다. 생성이 끝나면 상태가 자동으로 갱신됩니다.
        </Alert>
      )}
      {data.statusDetail && <Alert variant="warning">{data.statusDetail}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>VM 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <Field label="사양">{formatSpec(data.vcpu, data.memoryMb, data.diskGb)}</Field>
            <Field label="그룹">{groupName}</Field>
            <Field label="내부 IP">{data.ipAddress ?? '할당 전'}</Field>
            <Field label="SSH 계정">{data.sshUsername}</Field>
            <Field label="사용 기간">
              {data.startDate ?? '미지정'} ~ {data.endDate ?? '미지정'}
            </Field>
            <Field label="생성 신청">
              <Link
                to={`/console/requests/${data.requestId}`}
                className="text-primary-700 hover:underline"
              >
                신청 #{data.requestId}
              </Link>
            </Field>
            <Field label="생성일">{formatDateTime(data.createdAt)}</Field>
            <Field label="마지막 갱신">{formatDateTime(data.updatedAt)}</Field>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutral-800">{children}</dd>
    </div>
  )
}
