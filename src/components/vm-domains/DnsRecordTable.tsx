import type { DomainVerification } from '../../api/queries'
import { formatDateTime } from '../../lib/format'
import { CopyButton } from '../CopyButton'
import { Table, TBody, TD, TH, THead, TR } from '../ui'

/**
 * 커스텀 도메인 검증에 필요한 DNS 레코드 표 — 레코드별 확인 상태와 값 복사
 * 버튼을 함께 둔다 (값을 손으로 옮겨 적게 하지 않는다).
 */
export function DnsRecordTable({ verification }: { verification: DomainVerification }) {
  return (
    <div className="space-y-2">
      <Table>
        <THead>
          <TR>
            <TH>종류</TH>
            <TH>이름</TH>
            <TH>값</TH>
            <TH>확인</TH>
          </TR>
        </THead>
        <TBody>
          {verification.requiredRecords.map((record) => {
            const verified =
              record.type === 'A' ? verification.aVerified : verification.txtVerified
            return (
              <TR key={`${record.type}-${record.name}`}>
                <TD className="font-mono">{record.type}</TD>
                <TD className="font-mono break-all">
                  <span className="mr-2">{record.name}</span>
                  <CopyButton value={record.name} label="복사" />
                </TD>
                <TD className="font-mono break-all">
                  <span className="mr-2">{record.value}</span>
                  <CopyButton value={record.value} label="복사" />
                </TD>
                <TD className="whitespace-nowrap">
                  {verified ? (
                    <span className="text-success-700">확인됨</span>
                  ) : (
                    <span className="text-neutral-400">대기 중</span>
                  )}
                </TD>
              </TR>
            )
          })}
        </TBody>
      </Table>
      {verification.lastError && (
        <p className="text-sm text-warning-800">{verification.lastError}</p>
      )}
      {verification.lastCheckedAt && (
        <p className="text-xs text-neutral-500">
          마지막 확인 {formatDateTime(verification.lastCheckedAt)}
        </p>
      )}
    </div>
  )
}
