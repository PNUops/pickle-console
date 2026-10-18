import { Link } from 'react-router'
import type { GpuAllocation } from '../../api/gpu'
import { useInstitutionResourcePermissions } from '../../lib/institution-resource-work'
import { adminPaths } from '../../lib/paths'
import { formatDateTime } from '../../lib/format'
import { gpuDurationLabel } from '../../lib/gpu-duration'
import { Card, CardContent, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from '../ui'
import { Field } from '../request-kind/Field'
import { GpuConnectionBadge, GpuStatusBadge } from './GpuStatus'
import { GpuUtilization } from './GpuUtilization'

const HIDDEN = '조회 권한 없음'

export function InstitutionAdminGpuTable({ rows, orgId }: { rows: GpuAllocation[]; orgId?: string }) {
  const permissions = useInstitutionResourcePermissions()
  return <Card><Table><THead><TR><TH>이름</TH><TH>상태</TH><TH>연결</TH><TH>GPU</TH><TH>대기 순서</TH><TH>임대 만료</TH><TH>워크스페이스</TH></TR></THead>
    <TBody>{rows.map((row) => <TR key={row.id}>
      <TD><Link className="font-medium text-primary-700 hover:underline" to={adminPaths.gpuDetail(row.id, orgId)}>{row.name}</Link></TD>
      <TD><GpuStatusBadge status={row.status} /></TD>
      <TD>{(row.metadataVisible || permissions.forRow(row, 'gpu.observe') || permissions.forRow(row, 'gpu.observe.support.read')) && row.connectionStatus != null ? <GpuConnectionBadge status={row.connectionStatus} /> : HIDDEN}</TD>
      <TD>{row.metadataVisible ? row.gpu?.model ?? '미할당' : HIDDEN}</TD>
      <TD>{row.metadataVisible ? row.queuePosition != null ? `${row.queuePosition}번째` : '—' : HIDDEN}</TD>
      <TD>{row.metadataVisible || permissions.forRow(row, 'gpu.period', ['SYS_MANAGER', 'SYS_ADMIN']) ? row.leaseEndsAt ? formatDateTime(row.leaseEndsAt) : '정보 없음' : HIDDEN}</TD>
      <TD>{row.workspaceName ?? '워크스페이스 정보 없음'}</TD>
    </TR>)}</TBody></Table></Card>
}

export function InstitutionAdminGpuInfo({ allocation }: { allocation: GpuAllocation }) {
  const permissions = useInstitutionResourcePermissions()
  const observe = permissions.forRow(allocation, 'gpu.observe') || permissions.forRow(allocation, 'gpu.observe.support.read')
  const period = permissions.forRow(allocation, 'gpu.period', ['SYS_MANAGER', 'SYS_ADMIN'])
  const metadata = allocation.metadataVisible === true
  return <Card><CardHeader><CardTitle>GPU 정보</CardTitle></CardHeader><CardContent>
    {!metadata && <p className="mb-4 text-sm text-neutral-500">허용된 작업에 필요한 참조만 표시합니다. GPU와 대기열의 세부 정보는 조회 권한이 필요합니다.</p>}
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="워크스페이스">{allocation.workspaceName ?? '워크스페이스 정보 없음'}</Field>
      <Field label="GPU">{metadata ? allocation.gpu?.model ?? '미할당' : HIDDEN}</Field>
      <Field label="할당 상태"><GpuStatusBadge status={allocation.status} /></Field>
      <Field label="VM 연결">{(metadata || observe) && allocation.connectionStatus != null ? <GpuConnectionBadge status={allocation.connectionStatus} /> : HIDDEN}</Field>
      <Field label="연결된 VM">{metadata ? allocation.vmName ?? '—' : HIDDEN}</Field>
      <Field label="승인 임대 기간">{metadata || period ? allocation.grantedLeaseHours != null ? gpuDurationLabel(allocation.grantedLeaseHours) : '정보 없음' : HIDDEN}</Field>
      <Field label="할당 시각">{metadata ? allocation.allocatedAt ? formatDateTime(allocation.allocatedAt) : '—' : HIDDEN}</Field>
      <Field label="임대 만료">{metadata || period ? allocation.leaseEndsAt ? formatDateTime(allocation.leaseEndsAt) : '정보 없음' : HIDDEN}</Field>
      <Field label="대기 순서">{metadata ? allocation.queuePosition != null ? `${allocation.queuePosition}번째` : '—' : HIDDEN}</Field>
      <Field label="GPU 이용률">{observe ? <GpuUtilization value={allocation.utilizationPercent} observedAt={allocation.sampleObservedAt} /> : HIDDEN}</Field>
    </dl>
  </CardContent></Card>
}
