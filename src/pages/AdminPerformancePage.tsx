import { lazy, Suspense, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppsListDetail24Regular, DataUsage24Regular, Key24Regular, Organization24Regular, Server24Regular } from '@fluentui/react-icons'
import { fetchAdminLlmPerformance, fetchAdminPerformanceOverview, fetchAdminSummary, type AdminLlmUsageDays } from '../api/queries'
import { requestReaderKey } from '../api/request-review'
import { ApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { PERFORMANCE_WORK, PROVISION_WORK } from '../auth/admin-navigation'
import { canQueryWork, SYS_READERS } from '../auth/institution-authority'
import { TokenValue } from '../components/TokenValue'
import { DonutChart } from '../components/llm-usage/DonutChart'
import { PerformanceBusinessDetails, PerformanceBusinessSummary, PerformanceHardwareDetails, PerformanceHardwareSummary } from '../components/performance/PlatformOverview'
import { Alert, Button, Card, CardContent, EmptyState, ErrorBoundary, Spinner } from '../components/ui'
import { formatMemory } from '../lib/format'
import { isExactTokenCount, UNKNOWN_TOKEN_VALUE } from '../lib/token-presentation'
import { VM_STATUS_LABELS } from '../lib/status'
import { useAdminScope } from '../lib/use-admin-scope'
import { useListUrl } from '../lib/use-list-url'

const PerformanceCharts = lazy(() => import('../components/performance/PerformanceCharts'))
const PERIODS = [{ value: undefined, label: '전체 기간' }, { value: 7, label: '최근 7일' }, { value: 30, label: '최근 30일' }, { value: 90, label: '최근 90일' }] as const

function parseDays(value: string | null): AdminLlmUsageDays | undefined {
  return value === '7' ? 7 : value === '30' ? 30 : value === '90' ? 90 : undefined
}

function count(value: number): string {
  return isExactTokenCount(value) ? value.toLocaleString('ko-KR') : UNKNOWN_TOKEN_VALUE
}

function deniedRead(error: unknown): boolean {
  return error instanceof ApiError && (error.problem?.status === 403 || error.problem?.status === 404)
}

function Metric({ label, value, unit, icon, tone, children }: { label: string; value: ReactNode; unit?: string; icon: ReactNode; tone: 'blue' | 'teal' | 'amber'; children?: ReactNode }) {
  const colors = {
    blue: 'border-blue-100 bg-linear-to-br from-blue-50 to-indigo-50/60 text-blue-950',
    teal: 'border-primary-100 bg-linear-to-br from-primary-50 to-cyan-50/50 text-primary-950',
    amber: 'border-amber-100 bg-linear-to-br from-amber-50 to-orange-50/50 text-amber-950',
  }
  return <article className={`relative overflow-hidden rounded-2xl border p-5 shadow-sm sm:p-6 ${colors[tone]}`}>
    <div aria-hidden="true" className="absolute -right-3 -top-4 size-24 rounded-full bg-white/50" />
    <div className="relative flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{label}</h2><span aria-hidden="true" className="rounded-xl bg-white/80 p-2">{icon}</span></div>
    <div className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl [overflow-wrap:anywhere]">{value}{unit && <span className="ml-2 text-base font-medium">{unit}</span>}</div>
    {children && <div className="mt-4 text-sm opacity-80">{children}</div>}
  </article>
}

export function AdminPerformancePage() {
  const { user } = useAuth()
  const scope = useAdminScope()
  const [params, change] = useListUrl()
  const days = parseDays(params.get('days'))
  const reader = requestReaderKey(user)
  const target = { orgId: scope.activeOrgId }
  const usageAllowed = canQueryWork(user, ['llm.observe'], target, SYS_READERS)
  const summaryAllowed = canQueryWork(user, PROVISION_WORK, target, SYS_READERS)
  const available = canQueryWork(user, PERFORMANCE_WORK, target, SYS_READERS)
  const overviewAllowed = user?.role === 'SYS_ADMIN' || user?.role === 'SYS_MANAGER'
  const overview = useQuery({
    queryKey: ['admin', 'performance', 'overview', reader],
    queryFn: fetchAdminPerformanceOverview,
    enabled: scope.ready && overviewAllowed,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
  const overviewData = deniedRead(overview.error) ? undefined : overview.data
  const hardware = overviewAllowed ? overviewData?.hardware : undefined
  const business = user?.role === 'SYS_ADMIN' && scope.activeOrgId == null ? overviewData?.business : undefined
  const usage = useQuery({
    queryKey: ['admin', 'performance', 'llm', reader, { ...target, days: days ?? 'all' }],
    queryFn: () => fetchAdminLlmPerformance({ ...target, days }),
    enabled: scope.ready && usageAllowed,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
  const summary = useQuery({
    queryKey: ['admin', 'performance', 'summary', reader, target],
    queryFn: () => fetchAdminSummary(target),
    enabled: scope.ready && summaryAllowed,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
  const data = deniedRead(usage.error) ? undefined : usage.data
  const totals = data?.totals
  const aggregated = data?.rollupLastSuccessAt != null
  const totalTokens = totals && isExactTokenCount(totals.inputTokens) && isExactTokenCount(totals.outputTokens) ? totals.inputTokens + totals.outputTokens : Number.NaN
  const reportStates = data ? [data.gatewayReportState, data.usageQueueReportState] : []
  const current = deniedRead(summary.error) ? undefined : summary.data
  const vmCount = current?.vmCountsByStatus == null ? null : current.vmCountsByStatus.RUNNING ?? 0
  const vmStates = Object.entries(current?.vmCountsByStatus ?? {}).filter(([state, value]) => state !== 'DELETED' && value > 0).sort((a, b) => b[1] - a[1])
  const vmSlices = vmStates.slice(0, 4).map(([state, value]) => ({ label: VM_STATUS_LABELS[state as keyof typeof VM_STATUS_LABELS] ?? state, value, residual: false }))
  if (vmStates.length > 4) vmSlices.push({ label: '기타 상태', value: vmStates.slice(4).reduce((sum, [, value]) => sum + value, 0), residual: true })
  const provisionAvailable = current && (vmStates.length > 0 || current.publishedServiceCount != null || current.resource != null)

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-2xl bg-linear-to-br from-primary-950 via-primary-800 to-primary-600 px-6 py-7 text-white shadow-elevation-2 sm:px-8 sm:py-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-28 size-80 rounded-full border-[36px] border-white/5" />
        <div aria-hidden="true" className="pointer-events-none absolute right-32 top-14 size-44 rounded-full bg-cyan-300/10 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div><p className="text-xs font-semibold tracking-[0.2em] text-primary-200">PNU CLOUD</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">활용 성과</h1>
          </div>

        </div>
      </header>

      {overviewAllowed && overview.isPending && <Spinner label="플랫폼 현황을 불러오는 중" />}
      {overview.isError && <Alert variant="danger"><p>플랫폼 현황을 불러오지 못했어요.{overviewData && ' 이전 조회 값이에요.'}</p><Button className="mt-2" onClick={() => void overview.refetch()}>플랫폼 현황 다시 시도</Button></Alert>}
      {business && <PerformanceBusinessSummary data={business} />}
      {hardware && <PerformanceHardwareSummary data={hardware} />}
      {overviewAllowed && overview.isSuccess && hardware == null && <EmptyState title="서버 사양을 아직 확인할 수 없어요" />}

      {usageAllowed && <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">LLM 활용</h2>{data && <p className="mt-1 text-sm text-foreground-muted">{data.from ? `${data.from} ~ ${data.to}` : '집계된 기록 없음'}</p>}</div><div role="group" aria-label="활용 성과 조회 기간" className="flex flex-wrap gap-1 rounded-xl bg-neutral-100 p-1">{PERIODS.map((period) => <button key={period.label} type="button" aria-pressed={days === period.value} onClick={() => change({ days: period.value })} className={`cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-focus-ring ${days === period.value ? 'bg-primary-600 text-white shadow-sm' : 'text-foreground-secondary hover:bg-white'}`}>{period.label}</button>)}</div></div>}

      {!available && <EmptyState title="이 관리 범위에서 볼 수 있는 활용 수치가 없어요" />}
      {usageAllowed && usage.isPending && <Spinner label="활용 수치를 불러오는 중" />}
      {usage.isError && <Alert variant="danger"><p>LLM 활용 수치를 불러오지 못했어요.{data && ' 이전 조회 값이에요.'}</p><Button className="mt-2" onClick={() => void usage.refetch()}>다시 시도</Button></Alert>}
      {summaryAllowed && summary.isError && <Alert variant="danger"><p>현재 제공 규모를 불러오지 못했어요.{current && ' 이전 조회 값이에요.'}</p><Button className="mt-2" onClick={() => void summary.refetch()}>현재 제공 규모 다시 시도</Button></Alert>}
      {reportStates.includes('STALE') && <Alert>사용 기록 반영이 지연되고 있어요.</Alert>}
      {reportStates.includes('NOT_REPORTED') && <Alert>사용 기록 수집 상태를 확인하지 못했어요.</Alert>}
      {data && !aggregated && <EmptyState title="사용량 집계를 기다리고 있어요" />}

      <section aria-label="주요 활용 수치" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data && aggregated && totals && <>
          <Metric label="LLM 요청" value={count(totals.requests)} unit="건" icon={<DataUsage24Regular className="size-6" />} tone="blue" />
          <Metric label="사용한 토큰" value={<TokenValue value={totalTokens} />} unit="토큰" icon={<DataUsage24Regular className="size-6" />} tone="teal">
            <div className="flex flex-wrap gap-x-4 gap-y-1"><span>입력 <TokenValue value={totals.inputTokens} /></span><span>출력 <TokenValue value={totals.outputTokens} /></span></div>
          </Metric>
          <Metric label="사용 모델" value={count(totals.usedModelCount)} unit="개" icon={<Server24Regular className="size-6" />} tone="amber" />
        </>}
      </section>

      {data && aggregated && <section aria-label="LLM 이용 규모" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'LLM 이용 기관', value: data.population.institutionCount, unit: '개', icon: <Organization24Regular className="size-6" />, color: 'bg-indigo-50 text-indigo-600' },
          { label: 'LLM 이용 워크스페이스', value: data.population.workspaceCount, unit: '개', icon: <AppsListDetail24Regular className="size-6" />, color: 'bg-primary-50 text-primary-700' },
          { label: 'LLM 이용 키', value: data.population.keyCount, unit: '개', icon: <Key24Regular className="size-6" />, color: 'bg-violet-50 text-violet-600' },
          { label: '스트리밍 요청', value: data.totals.streamedRequests, unit: '건', icon: <DataUsage24Regular className="size-6" />, color: 'bg-orange-50 text-orange-600' },
        ].map((item) => <Card key={item.label} className="rounded-2xl"><CardContent className="flex items-center gap-4 py-5"><span aria-hidden="true" className={`shrink-0 rounded-xl p-3 ${item.color}`}>{item.icon}</span><div className="min-w-0"><h2 className="text-sm font-medium text-foreground-muted">{item.label}</h2><p className="mt-1 text-2xl font-bold tracking-tight">{count(item.value)}<span className="ml-1 text-sm font-medium text-foreground-muted">{item.unit}</span></p></div></CardContent></Card>)}
      </section>}

      {provisionAvailable && current && <section aria-labelledby="performance-current-title" className="overflow-hidden rounded-2xl border border-stroke-subtle bg-surface-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stroke-subtle px-5 py-4"><h2 id="performance-current-title" className="font-semibold text-foreground-primary">등록 가상머신 현황</h2><div className="flex flex-wrap gap-3">{vmCount != null && <span className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800">실행 중 <strong>{count(vmCount)}대</strong></span>}{current.publishedServiceCount != null && <span className="rounded-full bg-primary-50 px-3 py-1 text-sm text-primary-800">등록된 공개 경로 <strong>{count(current.publishedServiceCount)}개</strong></span>}</div></div>
        <div className="grid gap-6 p-5 xl:grid-cols-2">
          {vmSlices.length > 0 && <DonutChart title="가상머신 상태" slices={vmSlices} format={(value) => `${count(value)}대`} size={150} />}
          {current.resource != null && <dl className="grid grid-cols-3 content-center gap-4">
            <div className="rounded-xl bg-neutral-50 p-3"><dt className="text-xs text-foreground-muted">할당 vCPU</dt><dd className="mt-2 text-xl font-bold">{count(current.resource.allocatedVcpu)}<span className="ml-1 text-xs font-medium">개</span></dd></div>
            <div className="rounded-xl bg-neutral-50 p-3"><dt className="text-xs text-foreground-muted">할당 메모리</dt><dd className="mt-2 text-xl font-bold">{formatMemory(current.resource.allocatedMemoryMb)}</dd></div>
            <div className="rounded-xl bg-neutral-50 p-3"><dt className="text-xs text-foreground-muted">할당 디스크</dt><dd className="mt-2 text-xl font-bold">{count(current.resource.allocatedDiskGb)}<span className="ml-1 text-xs font-medium">GiB</span></dd></div>
          </dl>}
        </div>
      </section>}

      {data && aggregated && <ErrorBoundary label="활용 추이"><Suspense fallback={<Spinner label="활용 추이를 불러오는 중" />}><PerformanceCharts data={data} /></Suspense></ErrorBoundary>}
      {hardware && <PerformanceHardwareDetails data={hardware} />}
      {business && <PerformanceBusinessDetails data={business} />}
    </div>
  )
}
