import type { ModelCatalogueState } from '../lib/use-model-catalogue'
import { formatDateTime } from '../lib/format'
import { Alert, Button, Spinner } from './ui'

export function ModelCatalogueStatus({ state }: { state: ModelCatalogueState }) {
  const { canRead, query } = state
  if (!canRead) return <Alert>모델 목록을 조회할 권한이 없습니다. 허용된 정책 입력은 직접 작성할 수 있습니다.</Alert>
  const catalogue = query.data
  const refreshFailed = catalogue != null && (catalogue.lastError != null || catalogue.consecutiveFailures > 0)
  return <section aria-label="모델 목록 갱신 진단" className="space-y-3 rounded-lg border border-line p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-medium">공급자 목록 갱신 상태</p>
      <Button variant="secondary" loading={query.isFetching} onClick={() => { void query.refetch() }}>
        저장된 목록 다시 조회
      </Button>
    </div>
    {query.isPending && <Spinner label="저장된 모델 목록 불러오는 중" />}
    {query.isError && <Alert variant="danger">
      <p>저장된 목록 조회 실패: {query.error.message}</p>
      {catalogue && <p>이전 조회 값이에요.</p>}
    </Alert>}
    {catalogue && <>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div><dt className="text-foreground-muted">마지막 공급자 성공</dt><dd>{catalogue.lastSuccessAt == null ? '성공 기록 없음' : formatDateTime(catalogue.lastSuccessAt)}</dd></div>
      </dl>
      {refreshFailed && <Alert variant="warning">
        <p className="font-medium">공급자 갱신 실패</p>
        <p className="break-all">오류 분류: <code>{catalogue.lastError ?? '미보고'}</code></p>
      </Alert>}
      {catalogue.lastSuccessAt == null && <Alert>
        <p>아직 성공한 공급자 목록이 없습니다.</p>
        {catalogue.lastAttemptAt == null && <p>공급자 목록을 갱신한 시도 기록도 없습니다.</p>}
      </Alert>}
      {catalogue.freshness === 'STALE' && <Alert variant="warning">모델 목록이 오래됐어요.</Alert>}
    </>}
  </section>
}
