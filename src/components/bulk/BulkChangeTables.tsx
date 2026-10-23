import { TokenLimit } from '../TokenValue'
import type { AdminBulkChangeApplyItem, AdminBulkChangeFieldDiff, AdminBulkChangePreviewItem, AdminBulkChangeTargetType } from '../../api/queries'
import { diffFieldLabel, formatDiffValue } from '../../lib/bulk-change'
import { labelForBulkReason, labelForBulkResult } from '../../lib/labels'
import { AccessIncreaseDetails } from '../resource/AccessIncreaseReview'
import { DataTable, TBody, TD, TH, THead, TR } from '../ui'

type TargetLabel = (id: string, name?: string | null) => string
const serverLabel: TargetLabel = (id, name) => name ?? id

export function BulkChangePreviewTable({ items, targetType, label = serverLabel }: {
  items: AdminBulkChangePreviewItem[]
  targetType: AdminBulkChangeTargetType
  label?: TargetLabel
}) {
  return <DataTable caption="일괄 변경 미리보기">
    <THead><TR><TH>대상</TH><TH>적용 여부</TH><TH>변경 내용</TH><TH>사유</TH></TR></THead>
    <TBody>{items.map((item) => <TR key={item.targetId}>
      <TD className="font-medium text-foreground-primary">{label(item.targetId, item.name)}</TD>
      <TD className="whitespace-nowrap">{!item.applicable ? '적용 안 됨' : item.fields.length === 0 ? '변경 없음' : '적용'}</TD>
      <TD><BulkChangeDiffList fields={item.fields} targetType={targetType} />{item.actorAccessImpact && <AccessIncreaseDetails impact={item.actorAccessImpact} />}</TD>
      <TD>{item.reason ? labelForBulkReason(item.reason) : '—'}</TD>
    </TR>)}</TBody>
  </DataTable>
}

export function BulkChangeResultTable({ items, targetType, label = serverLabel }: {
  items: AdminBulkChangeApplyItem[]
  targetType: AdminBulkChangeTargetType
  label?: TargetLabel
}) {
  return <DataTable caption="일괄 변경 결과">
    <THead><TR><TH>대상</TH><TH>결과</TH><TH>변경 내용</TH><TH>사유</TH></TR></THead>
    <TBody>{items.map((item) => <TR key={item.targetId}>
      <TD className="font-medium text-foreground-primary">{label(item.targetId, item.name)}</TD>
      <TD className="whitespace-nowrap">{labelForBulkResult(item.result)}</TD>
      <TD><BulkChangeDiffList fields={item.fields} targetType={targetType} /></TD>
      <TD>{item.reason ? labelForBulkReason(item.reason) : '—'}</TD>
    </TR>)}</TBody>
  </DataTable>
}

export function BulkChangeDiffList({ fields, targetType }: {
  fields: AdminBulkChangeFieldDiff[]
  targetType: AdminBulkChangeTargetType
}) {
  if (fields.length === 0) return <span className="text-foreground-muted">—</span>
  return <ul className="space-y-0.5">{fields.map((diff) => <li key={diff.field}>
    <span className="text-foreground-muted">{diffFieldLabel(diff.field)}</span>{' '}
    {<BulkValue field={diff.field} value={diff.oldValue} targetType={targetType} />} →{' '}
    {<BulkValue field={diff.field} value={diff.newValue} targetType={targetType} />}
  </li>)}</ul>
}

export function BulkValue({ field, value, targetType }: { field: string; value: unknown; targetType: AdminBulkChangeTargetType }) {
  return (field === 'tpm' || field === 'dailyTokens') && typeof value === 'number'
    ? <TokenLimit value={value} daily={field === 'dailyTokens'} /> : <>{formatDiffValue(field, value, targetType)}</>
}
