import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMailDeliveries, fetchMailDelivery, resendMailDelivery, type MailDelivery, type RequestMailSelection } from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { canRunSysRoutine, isSysTier } from '../auth/permissions'
import { OperationResult } from '../components/OperationResult'
import { Alert, Badge, Button, Card, Drawer, FormField, Input, Modal, Pagination, Select, Spinner, Table, TBody, TD, TH, THead, TR } from '../components/ui'
import { formatDateTime } from '../lib/format'
import { useListUrl } from '../lib/use-list-url'
import { useActiveResult } from '../lib/use-active-result'
import { useAdminScope } from '../lib/use-admin-scope'
import { adminPaths } from '../lib/paths'
import { MAIL_MODE_LABELS, MAIL_QUEUE_FILTERS, MAIL_QUEUE_LABELS, MAIL_SOURCE_LABELS, MAIL_STATUS_LABELS, mailAttemptOutcomeLabel, mailDeliveryListParams, mailDeliveryListState, mailDeliveryResourcePath, mailFailureLabel, mayResendMail } from '../lib/mail-delivery'
import { orgRecipientReason } from '../lib/org-operations'
import { USER_ROLE_LABELS, USER_STATUS_LABELS } from '../lib/labels'

const PAGE_SIZE = 20

export function AdminNotificationLogPage() {
  const { user } = useAuth()
  const scope = useAdminScope()
  const [params, change, normalize] = useListUrl()
  const state = mailDeliveryListState(params)
  const canRead = !!user && isSysTier(user.role)
  const canOperate = !!user && canRunSysRoutine(user.role)
  const [resendTarget, setResendTarget] = useState<MailDelivery | null>(null)
  const [accepted, setAccepted] = useState<{ id: string; context: string } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const previousParams = useRef(params.toString())
  const { selected, invalidSelected, invalidTarget, ...listFilters } = state
  const filters = { sourceKind: listFilters.sourceKind, status: listFilters.status, queueState: listFilters.queueState, event: listFilters.event, email: listFilters.email, requestId: listFilters.requestId, announcementId: listFilters.announcementId, orgId: listFilters.orgId, page: listFilters.page, size: PAGE_SIZE }
  const context = JSON.stringify(filters)
  useLayoutEffect(() => normalize(mailDeliveryListParams(params).toString()), [normalize, params])
  useLayoutEffect(() => {
    if (previousParams.current !== params.toString()) { setResendTarget(null); setAccepted(null) }
    previousParams.current = params.toString()
  }, [params])
  const log = useQuery({ queryKey: ['admin', 'mail-deliveries', filters], queryFn: () => fetchMailDeliveries(filters), enabled: canRead && !invalidTarget,
    refetchInterval: (query) => query.state.data?.content.some((row) => row.status === 'PENDING' || row.status === 'SENDING') ? 10_000 : false })
  useLayoutEffect(() => { if (log.isError) setResendTarget(null) }, [log.isError])
  const updateFilter = (key: string, value: string) => { setResendTarget(null); setAccepted(null); change({ [key]: value, selected: undefined }, true) }
  const closeDetail = () => {
    const former = selected
    change({ selected: undefined })
    requestAnimationFrame(() => {
      const button = listRef.current?.querySelector<HTMLButtonElement>(`[data-delivery-id="${former}"]`)
      ;(button ?? searchRef.current)?.focus()
    })
  }
  if (!canRead) return <Alert variant="danger">메일 발송 이력은 시스템 관리자 계층에서만 조회할 수 있습니다.</Alert>
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold text-neutral-900">알림 발송 이력</h1>
      <p className="mt-1 text-sm text-neutral-600">업무 알림과 가입·인증·비밀번호 재설정 메일의 수신자별 처리 기록입니다. SMTP 인계는 메일함 도착이나 열람을 확인한 결과가 아닙니다.</p>
      <p className="mt-2 text-xs text-neutral-500">전체 시스템 이력입니다. 기관은 아래 변경 대상 기관 필터로 좁힙니다. 일반 업무 메일은 묶음 대기 후 처리하며, 계정 메일은 서버 메모리 큐의 접수와 처리 결과를 기록합니다.</p>
      <Button className="mt-3" variant="secondary" loading={log.isFetching} disabled={invalidTarget} onClick={() => void log.refetch()}>현재 발송 상태 조회</Button>
    </div>
    <Card className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="메일 발송 이력 필터">
      <FormField label="메일 종류"><Select value={state.sourceKind ?? ''} onChange={(event) => updateFilter('sourceKind', event.target.value)}><option value="">전체 종류</option>{Object.entries(MAIL_SOURCE_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</Select></FormField>
      <FormField label="전달 상태"><Select value={state.status ?? ''} onChange={(event) => updateFilter('status', event.target.value)}><option value="">전체 상태</option>{Object.entries(MAIL_STATUS_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</Select></FormField>
      <FormField label="큐 단계"><Select value={state.queueState ?? ''} onChange={(event) => updateFilter('queueState', event.target.value)}><option value="">전체 큐 단계</option>{MAIL_QUEUE_FILTERS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</Select></FormField>
      <FormField label="변경 대상 기관"><Select value={state.orgId ?? ''} onChange={(event) => updateFilter('orgId', event.target.value)}><option value="">전체 기관</option>{state.orgId && !scope.options.some((org) => org.id === state.orgId) && <option value={state.orgId}>기관 ID: {state.orgId}</option>}{scope.options.map((org) => <option key={org.id} value={org.id}>{org.name}{org.status === 'DISABLED' ? ' · 비활성' : ''}</option>)}</Select></FormField>
      <FormField label="이벤트"><Input value={state.event ?? ''} placeholder="request.submitted 등 정확한 이벤트" onChange={(event) => updateFilter('event', event.target.value)} /></FormField>
      <FormField label="수신 이메일"><Input ref={searchRef} value={state.email ?? ''} placeholder="발송 당시 이메일" onChange={(event) => updateFilter('email', event.target.value)} /></FormField>
      <FormField label="신청 ID"><Input value={state.requestId ?? ''} onChange={(event) => updateFilter('requestId', event.target.value)} /></FormField>
      <FormField label="발송건 ID"><Input value={state.announcementId ?? ''} onChange={(event) => updateFilter('announcementId', event.target.value)} /></FormField>
    </Card>
    {invalidTarget && <Alert variant="danger">신청·발송건·기관 ID는 올바른 UUID여야 합니다. 조회 조건을 수정해 주세요.</Alert>}
    {invalidSelected && <Alert variant="danger">발송 상세 ID가 올바르지 않습니다.<Button variant="secondary" onClick={() => change({ selected: undefined })}>상세 선택 지우기</Button></Alert>}
    {accepted?.context === context && <OperationResult stage="accepted">발송 {accepted.id}의 재발송을 접수했습니다. 큐 상태와 SMTP 인계 결과는 다시 조회해 확인합니다.</OperationResult>}
    {!invalidTarget && log.isPending && <Spinner label="메일 발송 이력 불러오는 중" />}
    {log.isError && <Alert variant="danger">{log.error.message}<Button variant="secondary" onClick={() => void log.refetch()}>발송 이력 다시 조회</Button></Alert>}
    {log.data && !log.isError && !invalidTarget && <><p className="text-sm">조회된 발송 {log.data.totalElements}건</p><div ref={listRef}><Card>
      <Table><THead><TR><TH>발송 당시 수신 주소</TH><TH>제목과 종류</TH><TH>이벤트</TH><TH>상태와 큐</TH><TH>시도</TH><TH>접수·인계 시각</TH>{canOperate && <TH>재발송</TH>}</TR></THead><TBody>
        {log.data.content.map((delivery) => <TR key={delivery.id}>
          <TD className="break-all text-xs">{delivery.recipientEmail ?? '당시 주소 기록 없음'}{delivery.legacyAddressUnknown && <span className="block text-neutral-500">기존 이력 · 주소 확인 불가</span>}</TD>
          <TD><button type="button" data-delivery-id={delivery.id} className="cursor-pointer break-words text-left font-medium text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring" onClick={() => { setResendTarget(null); setAccepted(null); change({ selected: delivery.id }) }}>{delivery.title}</button><span className="block text-xs">{MAIL_SOURCE_LABELS[delivery.sourceKind] ?? delivery.sourceKind}</span></TD>
          <TD className="break-all text-xs">{delivery.event}</TD><TD><DeliveryState delivery={delivery} />{delivery.failureCode && <span className="block text-xs text-danger-700">{mailFailureLabel(delivery.failureCode)}</span>}</TD>
          <TD>{delivery.attempts}회</TD><TD className="text-xs">{formatDateTime(delivery.createdAt)}<span className="block">{delivery.sentAt ? `SMTP 인계 ${formatDateTime(delivery.sentAt)}` : 'SMTP 인계 기록 없음'}</span></TD>
          {canOperate && <TD>{mayResendMail(delivery) ? <Button variant="secondary" size="sm" onClick={() => { setAccepted(null); setResendTarget(delivery) }}>재발송</Button> : <span className="text-xs text-neutral-500">{delivery.cannotResendReason ? mailFailureLabel(delivery.cannotResendReason) : '재발송 대상 아님'}</span>}</TD>}
        </TR>)}
      </TBody></Table>{log.data.content.length === 0 && <p className="p-8 text-center text-sm text-neutral-500">조건에 맞는 발송 이력이 없습니다.</p>}
    </Card></div><Pagination page={log.data.page} totalPages={log.data.totalPages} onPageChange={(page) => { setResendTarget(null); setAccepted(null); change({ page, selected: undefined }) }} /></>}
    <Drawer open={!!selected} onClose={closeDetail} title="메일 발송 상세" className="sm:max-w-3xl">
      {selected && <MailDeliveryDetail key={selected} deliveryId={selected} canOperate={canOperate} onResend={setResendTarget} />}
    </Drawer>
    {resendTarget && <ResendConfirmModal key={resendTarget.id} delivery={resendTarget} onClose={() => setResendTarget(null)} onDone={() => { setResendTarget(null); setAccepted({ id: resendTarget.id, context }) }} />}
  </div>
}

function DeliveryState({ delivery }: { delivery: MailDelivery }) {
  const unconfirmed = delivery.processingUnconfirmed
  return <div className="space-y-1"><Badge variant={unconfirmed ? 'warning' : delivery.status === 'SENT' ? 'success' : delivery.status === 'FAILED' || delivery.status === 'UNKNOWN' ? 'danger' : 'neutral'}>{unconfirmed ? '현재 처리 확인 필요' : MAIL_STATUS_LABELS[delivery.status] ?? delivery.status}</Badge>
    {unconfirmed ? <span className="block text-xs">원기록: {MAIL_STATUS_LABELS[delivery.status] ?? delivery.status}</span> : delivery.queueState !== delivery.status && <span className="block text-xs">{MAIL_QUEUE_LABELS[delivery.queueState] ?? delivery.queueState}</span>}{delivery.nextAttemptAt && !unconfirmed && <span className="block text-xs">다음 예약 {formatDateTime(delivery.nextAttemptAt)}</span>}
  </div>
}

function MailDeliveryDetail({ deliveryId, canOperate, onResend }: { deliveryId: string; canOperate: boolean; onResend: (delivery: MailDelivery) => void }) {
  const query = useQuery({ queryKey: ['admin', 'mail-delivery', deliveryId], queryFn: () => fetchMailDelivery(deliveryId), refetchInterval: (data) => ['PENDING', 'SENDING'].includes(data.state.data?.delivery.status ?? '') ? 10_000 : false })
  if (query.isPending) return <Spinner label="메일 발송 상세 불러오는 중" />
  if (query.isError) return <Alert variant="danger">{query.error.message}<Button variant="secondary" onClick={() => void query.refetch()}>상세 다시 조회</Button></Alert>
  const { delivery, attemptHistory, selection } = query.data
  const resourcePath = mailDeliveryResourcePath(delivery.linkPath, delivery.orgId)
  return <div className="space-y-5"><h3 className="break-words text-lg font-semibold">{delivery.title}</h3><DeliveryState delivery={delivery} />
    <Button variant="secondary" loading={query.isFetching} onClick={() => void query.refetch()}>상세 상태 다시 조회</Button>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-neutral-500">발송 당시 확정 주소</dt><dd className="break-all">{delivery.recipientEmail ?? '기록 없음'}</dd></div>
      <div><dt className="text-neutral-500">현재 계정 주소</dt><dd className="break-all">{delivery.currentUserEmail ?? '조회 정보 없음'}</dd></div>
      <div><dt className="text-neutral-500">종류 / 이벤트</dt><dd>{MAIL_SOURCE_LABELS[delivery.sourceKind] ?? delivery.sourceKind} / {delivery.event}</dd></div>
      <div><dt className="text-neutral-500">시도 횟수</dt><dd>{delivery.attempts}회</dd></div>
      <div><dt className="text-neutral-500">최종 오류 또는 생략 사유</dt><dd>{mailFailureLabel(delivery.failureCode)}</dd></div>
      <div><dt className="text-neutral-500">발송 당시 정책</dt><dd>버전 {delivery.policyRevision ?? '기록 없음'} / {delivery.mailMode ? MAIL_MODE_LABELS[delivery.mailMode] ?? delivery.mailMode : '기록 없음'}</dd></div>
    </dl>
    <p className="text-xs text-neutral-600">현재 계정 주소나 기관 명단으로 과거 발송 대상을 다시 계산하지 않습니다. SMTP 인계는 수신함 도착을 보장하지 않습니다.</p>
    {delivery.legacyAddressUnknown && <Alert variant="warning">이 기존 기록에는 당시 주소가 없습니다. 현재 계정 주소를 과거 수신 주소로 간주하지 않습니다.</Alert>}
    {delivery.sourceKind === 'ACCOUNT' && <Alert variant="info">계정 메일은 서버 메모리 큐에서 처리됩니다. 결과 확인이 필요한 항목은 서버 중단 등으로 SMTP 인계 결과가 확정되지 않은 기록일 수 있습니다. 인증·재설정 토큰과 본문은 이 화면에 보관하지 않으며, 재요청은 해당 계정 화면에서 수행합니다.</Alert>}
    {delivery.processingUnconfirmed && <Alert variant="warning">현재 서버가 이어서 처리하는 메모리 큐인지 확인되지 않았습니다. 원래 접수·처리 기록은 유지하며, 발송 작업을 자동으로 다시 실행하지 않습니다.</Alert>}
    {delivery.status === 'UNKNOWN' && <Alert variant="warning">SMTP 처리 결과를 확정할 수 없습니다. 중복 전송을 피하기 위해 이 화면에서 재발송하지 않습니다.</Alert>}
    <nav aria-label="발송 관련 업무" className="flex flex-wrap gap-3 text-sm text-primary-700">
      {delivery.requestId && <Link to={adminPaths.requestDetail(delivery.requestId, delivery.orgId ?? undefined)}>관련 신청</Link>}
      {delivery.orgId && <><Link to={adminPaths.orgOperations(delivery.orgId)}>현재 기관 명단</Link><Link to={adminPaths.orgAudit(delivery.orgId)}>기관 변경 감사</Link></>}
      {delivery.userId && <Link to={adminPaths.users(delivery.orgId ?? undefined, delivery.userId)}>사용자 상세</Link>}
      {delivery.announcementId && <Link to={adminPaths.announcementDetail(delivery.announcementId)}>알림 발송건 상세</Link>}
      {delivery.notificationId && <Link to={adminPaths.auditTarget('notification', delivery.notificationId)}>재발송 감사</Link>}
      {resourcePath && <Link to={resourcePath}>관련 리소스 상세</Link>}
    </nav>
    <section className="space-y-3"><h4 className="font-semibold">SMTP 시도 이력</h4><Table><THead><TR><TH>시도</TH><TH>시작</TH><TH>종료</TH><TH>결과</TH><TH>사유</TH></TR></THead><TBody>{attemptHistory.map((attempt) => <TR key={`${attempt.dispatchId}:${attempt.attemptNo}`}><TD>{attempt.attemptNo}</TD><TD className="text-xs">{formatDateTime(attempt.startedAt)}</TD><TD className="text-xs">{attempt.completedAt ? formatDateTime(attempt.completedAt) : '미완료'}</TD><TD>{mailAttemptOutcomeLabel(attempt.outcome)}</TD><TD>{mailFailureLabel(attempt.failureCode)}</TD></TR>)}</TBody></Table>{attemptHistory.length === 0 && <p className="text-sm text-neutral-500">기록된 개별 시도가 없습니다. 기존 누적 횟수로 시도별 결과를 추정하지 않습니다.</p>}</section>
    {selection && <RequestMailSelectionSnapshot selection={selection} />}
    {!selection && delivery.requestId && <p className="text-sm text-neutral-500">이 신청의 발송 당시 기관 선정 명단은 기록되지 않았습니다.</p>}
    {canOperate && (mayResendMail(delivery) ? <Button variant="secondary" onClick={() => onResend(delivery)}>재발송</Button> : <p className="text-sm">재발송 불가: {mailFailureLabel(delivery.cannotResendReason)}</p>)}
  </div>
}

export function RequestMailSelectionSnapshot({ selection }: { selection: RequestMailSelection }) {
  return <section className="space-y-3"><h3 className="font-semibold">접수 당시 기관 알림 선정</h3>
    <p className="text-sm">정책 버전 {selection.policyRevision} · 방식 {MAIL_MODE_LABELS[selection.mailMode] ?? selection.mailMode} · 선정 {formatDateTime(selection.selectedAt)}</p>
    <p className="text-xs text-neutral-600">당시 신청자: {selection.requester.name} / {selection.requester.email} / {USER_STATUS_LABELS[selection.requester.status as keyof typeof USER_STATUS_LABELS] ?? selection.requester.status}. 현재 기관 명단과 별도로 보존한 기록입니다.</p>
    <Table><THead><TR><TH>당시 기관 역할 사용자</TH><TH>계정 / 기관 역할</TH><TH>이메일 선정</TH><TH>콘솔 선정</TH></TR></THead><TBody>{selection.staff.map((member) => <TR key={member.userId}>
      <TD><Link className="text-primary-700 hover:underline" to={adminPaths.users(selection.orgId, member.userId)}>{member.name}</Link><span className="block break-all text-xs">{member.email}</span></TD><TD>{USER_STATUS_LABELS[member.status]} / {USER_ROLE_LABELS[member.role]}</TD>
      <TD>{member.currentMailRecipient ? '선정' : '제외'}<span className="block text-xs">{orgRecipientReason(member.currentMailRecipient ? member.selectionReason : member.exclusionReason)}</span></TD><TD>{member.inAppRecipient ? '선정' : '제외'}</TD>
    </TR>)}</TBody></Table>{selection.staff.length === 0 && <Alert variant="warning">접수 당시 기관 역할 명단이 0명입니다.</Alert>}
    {selection.staff.filter((member) => member.currentMailRecipient).length === 0 && <Alert variant="warning">접수 당시 기관 메일 수신자가 0명입니다. 신청자의 본인 확인 메일과는 별개입니다.</Alert>}
  </section>
}

function ResendConfirmModal({ delivery, onClose, onDone }: { delivery: MailDelivery; onClose: () => void; onDone: () => void }) {
  const active = useActiveResult()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const resend = useMutation({ mutationFn: () => resendMailDelivery(delivery.id), onSuccess: async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['admin', 'mail-deliveries'] }), queryClient.invalidateQueries({ queryKey: ['admin', 'mail-delivery', delivery.id] })])
    if (active.current) onDone()
  }, onError: (err) => { if (active.current) setError(toApiError(err, '메일 재발송을 접수하지 못했습니다.').message) } })
  return <Modal open onClose={onClose} title="알림 재발송" footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button loading={resend.isPending} disabled={!mayResendMail(delivery)} onClick={() => resend.mutate()}>재발송</Button></>}>
    <div className="space-y-3"><p className="text-sm">발송 당시 확정 주소 <strong className="break-all">{delivery.recipientEmail ?? '기록 없음'}</strong>로 <strong>{delivery.title}</strong>의 재발송을 접수합니다.</p>
      <p className="text-sm">기존 수신자와 주소를 유지합니다. 접수 이후 큐 처리와 SMTP 인계는 상세에서 확인합니다.</p>
      <p className="text-xs">최종 사유: {mailFailureLabel(delivery.failureCode)}</p>{error && <Alert variant="danger">{error}</Alert>}
    </div>
  </Modal>
}
