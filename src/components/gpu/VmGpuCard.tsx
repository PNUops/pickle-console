import { Link } from 'react-router'
import type { VmDetail } from '../../api/queries'
import { Card, CardContent, CardHeader, CardTitle } from '../ui'
import { Field } from '../request-kind/Field'
import { GpuConnectionBadge } from './GpuStatus'
import { adminPaths, consolePaths } from '../../lib/paths'
import { gpuPreviewEnabled } from '../../lib/gpu-preview'

export function VmGpuCard({ gpu, admin = false, orgId }: { gpu: VmDetail['gpu']; admin?: boolean; orgId?: string }) {
  if (!gpuPreviewEnabled() || !gpu) return null
  return <Card><CardHeader><CardTitle>GPU</CardTitle></CardHeader><CardContent className="space-y-4">
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="모델">{gpu.model}</Field>
      <Field label="연결 상태"><GpuConnectionBadge status={gpu.connectionStatus} /></Field>
      <Field label="GPU 할당">{gpu.allocationName}</Field>
    </dl>
    {(admin || gpu.detailAccessAllowed) && <Link to={admin ? adminPaths.gpuDetail(gpu.allocationId, orgId) : consolePaths.gpuDetail(gpu.allocationId)} className="text-sm text-primary-700 hover:underline">GPU 할당 보기</Link>}
  </CardContent></Card>
}
