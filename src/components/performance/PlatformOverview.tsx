import type { AdminPerformanceOverview } from '../../api/queries'
import { Building24Regular, DataUsage24Regular, Desktop24Regular, People24Regular } from '@fluentui/react-icons'
import { Card, CardContent } from '../ui'
import { DonutChart } from '../llm-usage/DonutChart'
import { labelForWorkspaceKind } from '../../lib/labels'

type Hardware = NonNullable<AdminPerformanceOverview['hardware']>
type Business = NonNullable<AdminPerformanceOverview['business']>

const number = (value: number) => value.toLocaleString('ko-KR')
const memory = (mib: number) => `${(mib / 1024).toLocaleString('ko-KR', { maximumFractionDigits: 1 })} GiB`

export function PerformanceBusinessSummary({ data }: { data: Business }) {
  return <section aria-label="플랫폼 이용 현황" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
    {[
      { label: '등록 계정', value: data.registeredAccounts, unit: '개', icon: <People24Regular className="size-5" /> },
      { label: '워크스페이스', value: data.currentWorkspaces, unit: '개', icon: <Building24Regular className="size-5" /> },
      { label: '승인된 신청', value: data.approvedRequests, unit: '건', icon: <DataUsage24Regular className="size-5" /> },
      { label: '등록 도메인', value: data.registeredDomains, unit: '개', icon: <Desktop24Regular className="size-5" /> },
    ].map((item) => <Card key={item.label} className="rounded-xl"><CardContent className="px-4 py-4"><div className="flex items-center justify-between gap-2 text-foreground-muted"><h2 className="text-sm font-medium">{item.label}</h2><span aria-hidden="true" className="text-primary-600">{item.icon}</span></div><p className="mt-2 text-3xl font-bold tracking-tight">{number(item.value)}<span className="ml-1 text-sm font-medium text-foreground-muted">{item.unit}</span></p></CardContent></Card>)}
  </section>
}

export function PerformanceHardwareSummary({ data }: { data: Hardware }) {
  return <section aria-label="서버 인프라 규모" className="grid grid-cols-2 overflow-hidden rounded-2xl border border-primary-200 bg-primary-50/70 xl:grid-cols-4">
    <div className="px-5 py-4"><h2 className="text-sm font-semibold text-primary-800">운영 서버</h2><p className="mt-2 text-3xl font-bold text-primary-950">{number(data.physicalHosts)}<span className="ml-1 text-sm font-medium">대</span></p></div>
    <div className="px-5 py-4"><h2 className="text-sm font-semibold text-primary-800">CPU</h2><p className="mt-2 text-3xl font-bold text-primary-950">{number(data.cpuCores)}<span className="ml-1 text-sm font-medium">코어</span></p><p className="mt-1 text-xs text-primary-700">{number(data.cpuThreads)}스레드</p></div>
    <div className="px-5 py-4"><h2 className="text-sm font-semibold text-primary-800">총 RAM</h2><p className="mt-2 text-3xl font-bold text-primary-950 [overflow-wrap:anywhere]">{(data.memoryMiB / 1024).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}<span className="ml-1 text-sm font-medium">GiB</span></p></div>
    <div className="px-5 py-4"><h2 className="text-sm font-semibold text-primary-800">GPU</h2><p className="mt-2 text-3xl font-bold text-primary-950">{number(data.gpuDevices)}<span className="ml-1 text-sm font-medium">개</span></p></div>
  </section>
}

export function PerformanceHardwareDetails({ data }: { data: Hardware }) {
  const gpus = data.assets.flatMap((asset) => asset.gpus)
  return <section aria-labelledby="performance-hardware-details" className="space-y-4">
    <h2 id="performance-hardware-details" className="text-lg font-semibold text-foreground-primary">서버 사양</h2>
    {gpus.length > 0 && <div className="grid gap-4 lg:grid-cols-2">{gpus.map((gpu, index) => <Card key={`${gpu.model}-${index}`} className="overflow-hidden rounded-2xl border-violet-100 bg-linear-to-br from-violet-50 to-surface-card"><CardContent className="flex flex-wrap items-center justify-between gap-4 py-5"><div><p className="text-xs font-semibold tracking-widest text-violet-600">GPU</p><h3 className="mt-2 text-lg font-bold text-violet-950">{gpu.model}</h3>{gpu.sharedMemory != null && (gpu.sharedMemory ? gpu.unifiedMemoryMiB : gpu.dedicatedMemoryMiB) != null && <p className="mt-2 text-sm text-violet-800">{gpu.sharedMemory ? '통합 메모리' : 'VRAM'} {memory((gpu.sharedMemory ? gpu.unifiedMemoryMiB : gpu.dedicatedMemoryMiB)!)}</p>}</div><p className="text-3xl font-bold text-violet-950">{number(gpu.count)}<span className="ml-1 text-sm font-medium">개</span></p></CardContent></Card>)}</div>}
    <Card className="overflow-hidden rounded-2xl"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">서버별 CPU와 메모리</caption><thead className="border-b border-stroke-subtle bg-neutral-50 text-foreground-muted"><tr><th scope="col" className="px-5 py-3 font-medium">서버</th><th scope="col" className="px-5 py-3 font-medium">CPU</th><th scope="col" className="px-5 py-3 font-medium">코어 / 스레드</th><th scope="col" className="px-5 py-3 font-medium">RAM</th></tr></thead><tbody className="divide-y divide-stroke-subtle">{data.assets.map((asset, index) => <tr key={`${asset.cpuModel}-${index}`}><th scope="row" className="px-5 py-4 font-semibold text-foreground-primary">{asset.displayModel}</th><td className="px-5 py-4 text-foreground-secondary">{asset.cpuModel}</td><td className="whitespace-nowrap px-5 py-4 text-foreground-secondary">{number(asset.cpuCores)} / {number(asset.cpuThreads)}</td><td className="whitespace-nowrap px-5 py-4 font-medium text-foreground-primary">{memory(asset.memoryMiB)}</td></tr>)}</tbody></table></div></Card>
  </section>
}

export function PerformanceBusinessDetails({ data }: { data: Business }) {
  const workspaces = Object.entries(data.workspacesByKind).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1])
  const slices = workspaces.slice(0, 4).map(([kind, value]) => ({ label: labelForWorkspaceKind(kind), value, residual: false }))
  if (workspaces.length > 4) slices.push({ label: '기타', value: workspaces.slice(4).reduce((sum, [, value]) => sum + value, 0), residual: true })
  const kinds: Record<string, string> = { VM: '가상머신', LLM_API_KEY: 'LLM API 키', DOMAIN: '도메인', GPU: 'GPU' }
  const approvals = Object.entries(data.approvedRequestsByKind).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1])
  const max = approvals[0]?.[1] ?? 0
  return <section aria-label="지원 현황" className="grid gap-5 xl:grid-cols-2">
    <Card className="rounded-2xl"><CardContent className="space-y-5 py-6"><h2 className="text-base font-semibold">워크스페이스 구성</h2><DonutChart title="워크스페이스 구성" slices={slices} format={(value) => `${number(value)}개`} /></CardContent></Card>
    <Card className="rounded-2xl"><CardContent className="space-y-5 py-6"><h2 className="text-base font-semibold">승인된 신청</h2><ul className="space-y-4">{approvals.map(([kind, value]) => <li key={kind}><div className="flex justify-between gap-3 text-sm"><span className="font-medium">{kinds[kind] ?? kind}</span><span className="text-foreground-muted">{number(value)}건</span></div><div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-primary-50"><div className="h-full rounded-full bg-primary-500" style={{ width: `${max > 0 ? value / max * 100 : 0}%` }} /></div></li>)}</ul><div className="border-t border-stroke-subtle pt-4 text-sm text-foreground-secondary">지금까지 등록한 가상머신 <strong className="ml-2 text-lg text-foreground-primary">{number(data.vmRegistrations)}대</strong></div></CardContent></Card>
  </section>
}
