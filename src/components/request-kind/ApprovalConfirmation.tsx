import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { ApproveRequest, RequestDetail } from '../../api/queries'
import { formatSpec } from '../../lib/format'
import { adminPaths } from '../../lib/paths'
import { requestRecipientStatusLabel } from '../../lib/request-recipient-status'
import { approvalTargetCounts, commonApprovalComparisons, type ApprovalComparison, type ApprovalTargetFacts } from './approval-confirmation'
import { Alert, DataTable, TBody, TD, TH, THead, TR } from '../ui'

export function ApprovalConfirmation({ request, approval, comparisons = [], targetFacts = [], targetFactsKnown = false, workspaceReadable = false, nodeName, children }: {
  request: RequestDetail
  approval: ApproveRequest
  comparisons?: ApprovalComparison[]
  targetFacts?: ApprovalTargetFacts[]
  targetFactsKnown?: boolean
  workspaceReadable?: boolean
  nodeName?: string
  children: ReactNode
}) {
  const counts = approvalTargetCounts(request, targetFacts, targetFactsKnown)
  const entitled = counts.ready + counts.waiting + counts.unknown
  const recipients = request.recipients ?? []
  const beforeSubmission = request.id === ''
  const rows = [...commonApprovalComparisons(request, approval), ...comparisons]
  return <div className="space-y-5 text-sm [overflow-wrap:anywhere]">
    <section aria-label="승인 대상 확인" className="space-y-2">
      <h3 className="font-semibold text-foreground-primary">{request.displayName}</h3>
      <p>기관: {request.orgName}</p>
      <p>신청자: {request.requesterName}</p>
      <p>워크스페이스: {request.workspaceName}</p>
      <p>신청 대상 {counts.total}명 / 조회된 구성원 대상 {counts.ready}명 / 가입 대기 {counts.waiting}명 / 취소·제외 {counts.excluded}명 / 조건 미확인 {counts.unknown}명</p>
      <p className="text-foreground-muted">대상자 상태는 승인 시 서버에서 다시 확인합니다. 가입 대기 대상의 자원은 가입 조건과 부여 기간을 확인한 뒤 생성합니다.</p>
      {beforeSubmission && <p className="text-foreground-muted">제출 전 미리보기입니다. 명단으로 고른 계정의 구성원 추가와 새 초대는 제출할 때 처리하며, 현재 구성원이나 초대가 이미 추가된 상태를 뜻하지 않습니다.</p>}
      <details>
        <summary className="cursor-pointer text-primary-700">실제 대상 확인 ({counts.total}명)</summary>
        <ul className="mt-2 space-y-2">{recipients.length > 0 ? recipients.map((recipient) => {
          const target = targetFacts.find((fact) => fact.userId && fact.userId === recipient.userId)
          const condition = beforeSubmission && recipient.id.startsWith('s:')
            ? recipient.status === 'PENDING_JOIN' ? '제출 시 초대 예정 / 가입 대기' : '제출 시 구성원 추가 예정 / 서버 재확인'
            : target?.member === false ? '현재 워크스페이스 구성원 아님'
            : target?.userStatus && target.userStatus !== 'ACTIVE' ? '현재 활성 계정 아님'
              : recipient.status === 'QUEUED' && (!targetFactsKnown || !target) ? '현재 대상 조건 미확인' : requestRecipientStatusLabel(request.status, recipient.status, true)
          return <li key={recipient.id}>{recipient.name ?? recipient.invitee ?? '초대 대상 정보 조회 불가'} / {condition}</li>
        }) : <li>{request.requesterName} / 신청자 본인{counts.excluded > 0 && ' / 현재 대상 조건 불충족'}</li>}</ul>
      </details>
    </section>
    <DataTable caption="신청 희망값과 승인 부여값" className="block sm:table">
      <THead className="hidden sm:table-header-group"><TR><TH>항목</TH><TH>신청 희망값</TH><TH>승인 부여값</TH></TR></THead>
      <TBody className="block sm:table-row-group">{rows.map((row) => <TR key={row.label} className="block sm:table-row">
        <TD className="block font-medium sm:table-cell">{row.label}</TD>
        <TD className="block pt-0 sm:table-cell sm:pt-[var(--density-row-block-padding)]"><span className="mb-1 block text-xs text-foreground-muted sm:hidden">신청 희망값</span>{row.requested}</TD>
        <TD className="block pt-0 sm:table-cell sm:pt-[var(--density-row-block-padding)]"><span className="mb-1 block text-xs text-foreground-muted sm:hidden">승인 부여값</span>{row.granted}</TD>
      </TR>)}</TBody>
    </DataTable>
    {request.periodName && <p className="text-xs text-foreground-muted">기간 이름: {request.periodName}. 신청 종료일은 제출 당시 저장된 값입니다.</p>}
    {request.type !== 'DOMAIN' && <p>부여 사용 시작일: {approval.grantedStartDate ?? '시작일 미지정'}</p>}
    {recipients.length > 0 && <p>생성 대상에게 동일한 1명당 부여값을 적용합니다.</p>}
    {request.type === 'VM' && approval.vm && <section aria-label="VM 부여안 총량" className="space-y-2">
      <p className="font-semibold">취소·제외를 뺀 {entitled}명 기준 부여안 합계{counts.unknown > 0 && ' (조건 미확인 포함)'}: {formatSpec(approval.vm.grantedVcpu * entitled, approval.vm.grantedMemoryMb * entitled, approval.vm.grantedDiskGb * entitled)}</p>
      <p>배치: {nodeName ?? (approval.vm.nodeId ? '노드 정보 확인 필요' : '자동 배치')}</p>
      <p className="text-foreground-muted">이 합계는 실제 생성 완료나 물리 용량 예약을 뜻하지 않습니다. 각 대상자 생성 시점에 배치와 자원 상태를 확인합니다.</p>
    </section>}
    {counts.excluded > 0 && <Alert variant="warning">취소·제외된 {counts.excluded}명은 부여안 합계에 포함하지 않았습니다.</Alert>}
    {request.workspaceId && workspaceReadable && <Link to={adminPaths.workspaceDetail(request.workspaceId, request.orgId ?? undefined)} className="inline-flex text-primary-700 hover:underline">워크스페이스 관계 보기</Link>}
    <section aria-label="종류별 승인 확인" className="space-y-3">{children}</section>
  </div>
}
