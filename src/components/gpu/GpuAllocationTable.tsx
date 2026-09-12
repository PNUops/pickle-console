import { Link } from 'react-router'
import type { GpuAllocation } from '../../api/gpu'
import { Card, Table, TBody, TD, TH, THead, TR } from '../ui'
import { GpuStatusBadge, GpuConnectionBadge } from './GpuStatus'
import { formatDateTime } from '../../lib/format'
import { adminPaths, consolePaths } from '../../lib/paths'

export function GpuAllocationTable({ rows, admin = false, orgId }: { rows: GpuAllocation[]; admin?: boolean; orgId?: string }) {
  return <Card><Table><THead><TR>
    <TH>이름</TH><TH>상태</TH><TH>연결</TH><TH>GPU</TH><TH>대기 순서</TH><TH>임대 만료</TH><TH>워크스페이스</TH>
  </TR></THead><TBody>{rows.map((row) => <TR key={row.id}>
    <TD>{row.accessLimited ? <>
      <span>{row.name}</span>
      <p className="text-xs text-neutral-500">접근 권한이 없습니다{row.ownerNames.length ? ` · ${row.ownerNames.join(', ')}` : ''}</p>
      {row.accessManageAllowed && <Link className="text-primary-700 hover:underline" to={consolePaths.gpuAccess(row.id)}>접근 권한 관리</Link>}
    </> : <Link className="font-medium text-primary-700 hover:underline" to={admin ? adminPaths.gpuDetail(row.id, orgId) : consolePaths.gpuDetail(row.id)}>{row.name}</Link>}</TD>
    <TD><GpuStatusBadge status={row.status} /></TD>
    <TD>{row.accessLimited ? '—' : <GpuConnectionBadge status={row.connectionStatus} />}</TD>
    <TD>{row.gpu?.model ?? '—'}</TD>
    <TD>{row.queuePosition != null ? `${row.queuePosition}번째` : '—'}</TD>
    <TD className="whitespace-nowrap">{row.leaseEndsAt ? formatDateTime(row.leaseEndsAt) : '—'}</TD>
    <TD>{row.workspaceName}</TD>
  </TR>)}</TBody></Table></Card>
}
