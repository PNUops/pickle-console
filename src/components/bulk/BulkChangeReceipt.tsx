import type { AdminBulkOperation } from '../../api/bulk-results'
import { diffFieldLabel } from '../../lib/bulk-change'
import { formatDateTime } from '../../lib/format'
import { labelForBulkReason } from '../../lib/labels'
import { DataTable, MessageBar, TBody, TD, TH, THead, TR } from '../ui'
import { BulkChangeResultTable, BulkValue } from './BulkChangeTables'

const EFFECT_KIND: Record<string, string> = { AUDIT: '감사 기록', QUEUE: '작업 큐', EXTERNAL_CALLBACK: '공급자 후속 처리', CALLBACK: '후속 처리' }
const EFFECT_OUTCOME: Record<string, string> = { REGISTERED: '후속 처리 등록됨', ACCEPTED: '작업 접수 확인', COMPLETED: '후속 처리 완료', FAILED: '후속 처리 실패', UNKNOWN: '접수·완료 확인 없음' }
const QUEUE_STATE: Record<string, string> = { ENQUEUED: '큐에서 대기', SCHEDULED: '예약됨', PROCESSING: '작업 실행 중', SUCCEEDED: '작업 성공(외부 완료 별도)', FAILED: '작업 실패', DELETED: '작업 삭제됨', AWAITING: '선행 작업 대기', UNKNOWN: '현재 작업 상태 확인 불가' }

export function BulkChangeReceipt({ operation }: { operation: AdminBulkOperation }) {
  if (operation.status !== 'COMMITTED' || operation.result.batchId !== operation.operationId) return <MessageBar variant="warning">이 적용의 커밋 결과를 확인하지 못했습니다.</MessageBar>
  const names = new Map(operation.result.items.map((item) => [item.targetId, item.name]))
  const hidden = new Set(operation.observations.filter((item) => item.refusal).map((item) => item.targetId))
  const name = (id: string) => hidden.has(id) ? id : names.get(id) ?? id
  return <section className="space-y-4">
    <MessageBar variant="success" title="적용 결과가 저장됐습니다">
      DB 커밋: {formatDateTime(operation.committedAt)}. 큐 접수와 외부 리소스의 실제 완료는 별도로 확인합니다.
    </MessageBar>
    <p className="break-all text-sm">적용 ID: <code>{operation.operationId}</code></p>
    <h2 className="font-semibold">저장 당시 결과</h2>
    <BulkChangeResultTable items={operation.result.items.map((item) => hidden.has(item.targetId) ? { ...item, name: null, fields: [] } : item)} targetType={operation.targetType} />
    <p className="text-sm text-foreground-muted">현재 권한으로 조회할 수 없는 대상은 이름과 변경값을 가립니다. 당시 저장된 적용·거절 결과는 그대로 보존합니다.</p>
    <DataTable caption="현재 대상 관측">
      <THead><TR><TH>대상</TH><TH>조회 시각</TH><TH>현재 DB 값</TH></TR></THead>
      <TBody>{operation.observations.map((item) => <TR key={item.targetId}>
        <TD className="break-all">{name(item.targetId)}</TD>
        <TD>{formatDateTime(item.observedAt)}</TD>
        <TD>{item.refusal ? <span>현재 조회 불가: {labelForBulkReason(item.refusal)}</span> : <dl className="space-y-1">{Object.entries(item.values).map(([field, value]) => <div key={field}><dt className="inline text-foreground-muted">{diffFieldLabel(field)}: </dt><dd className="inline">{<BulkValue field={field} value={value} targetType={operation.targetType} />}</dd></div>)}</dl>}</TD>
      </TR>)}</TBody>
    </DataTable>
    <DataTable caption="후속 작업 접수와 관측" className="min-w-[48rem]">
      <THead><TR><TH>대상</TH><TH>종류</TH><TH>후속 처리 확인</TH><TH>현재 작업 상태</TH><TH>참조 ID</TH></TR></THead>
      <TBody>{operation.effects.map((effect) => {
        const masked = effect.targetId != null && hidden.has(effect.targetId)
        return <TR key={effect.id}>
          <TD className="break-all">{effect.targetId ? name(effect.targetId) : '이 적용 전체'}</TD>
          <TD>{EFFECT_KIND[effect.kind] ?? effect.kind}</TD>
          <TD>{effect.kind === 'AUDIT' && effect.outcome === 'COMPLETED' ? '감사 기록 완료' : EFFECT_OUTCOME[effect.outcome] ?? effect.outcome}{effect.observedAt && <span className="block text-xs">{formatDateTime(effect.observedAt)}</span>}</TD>
          <TD>{masked ? '현재 조회 불가' : effect.queueState ? <>{QUEUE_STATE[effect.queueState] ?? effect.queueState}{effect.queueObservedAt && <span className="block text-xs">{formatDateTime(effect.queueObservedAt)}</span>}</> : '현재 작업 상태 확인 없음'}</TD>
          <TD className="break-all">{!masked && effect.externalReference ? <code>{effect.externalReference}</code> : '—'}</TD>
        </TR>
      })}</TBody>
    </DataTable>
    <p className="text-sm text-foreground-muted">등록됨은 큐 접수 성공을 뜻하지 않으며, 작업 성공도 외부 자원의 물리적 완료를 증명하지 않습니다. 현재 대상 값이 요청값과 같아도 이 적용이 외부 변경을 완료했다는 증거는 아닙니다.</p>
  </section>
}
