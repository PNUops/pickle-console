import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { requestReaderKey } from '../../api/request-review'
import { toApiError } from '../../api/problem'
import { useAuth } from '../../auth/auth-context'
import { useActiveResult } from '../../lib/use-active-result'
import { Alert, Button, Checkbox, ConfirmNameModal, Modal } from '../ui'
import { WorkspaceTerminationImpactBody } from './WorkspaceTerminationImpact'
import { useWorkspaceTerminationImpact } from './use-workspace-termination-impact'

interface Props {
  workspaceId: string
  expectedName?: string
  invitationId?: string
  targetLabel?: string
  admin?: boolean
  onClose: () => void
  onConfirm: (fingerprint: string) => Promise<void>
}

/** The existing destructive dialog contains both the observation and its confirmation. */
export function WorkspaceTerminationDialog(props: Props) {
  const { user } = useAuth()
  const location = useLocation()
  const context = `${requestReaderKey(user)}:${location.pathname}:${new URLSearchParams(location.search).get('org') ?? 'all'}:${props.workspaceId}:${props.invitationId ?? 'workspace'}`
  return <TerminationDialog key={context} {...props} source={`${location.pathname}${location.search}`} />
}

function TerminationDialog({ workspaceId, invitationId, targetLabel, admin = false, expectedName, onClose, onConfirm, source }: Props & { source: string }) {
  const active = useActiveResult()
  const read = useWorkspaceTerminationImpact({ workspaceId, invitationId, admin })
  const started = useRef(false)
  const submitting = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (!started.current) { started.current = true; void read.load() } })
  const submit = async () => {
    if (!active.current || submitting.current || !read.confirmed || !read.impact) return
    submitting.current = true
    setPending(true)
    setError(null)
    try {
      await onConfirm(read.impact.fingerprint)
    } catch (failure) {
      if (!active.current) return
      const problem = toApiError(failure, '종료 작업을 완료하지 못했습니다.')
      read.confirm(false)
      setError(problem.message)
      if (problem.problem?.status === 409) await read.load()
    } finally {
      if (active.current) { submitting.current = false; setPending(false) }
    }
  }
  const close = () => { if (!submitting.current) onClose() }
  const body = <div className="space-y-4 [overflow-wrap:anywhere]">
    <Alert variant="danger">{invitationId ? '이 초대와 연결된 가입 대기가 함께 종료됩니다. 다른 초대와 구성원, 승인 결정은 유지됩니다.' : '이 작업은 되돌릴 수 없습니다. 워크스페이스와 구성원 구성이 목록에서 사라집니다.'}</Alert>
    {error && <Alert variant="danger">{error} 현재 영향을 다시 확인한 뒤 명시적으로 확인해 주세요.</Alert>}
    <WorkspaceTerminationImpactBody read={read} invitationId={invitationId} targetLabel={targetLabel} admin={admin} source={source} />
    <Checkbox label="표시된 전체 종료 영향과 자동 정리 내용을 확인했습니다" checked={read.confirmed}
      disabled={pending || read.loading || !!read.error || read.stale || !read.impact?.executable}
      onChange={(event) => read.confirm(event.target.checked)} />
    <p className="text-sm text-foreground-muted">영향이 0건이어도 확인이 필요합니다. 실제 실행 시 최신 대상과 상태를 다시 검사하며, 등록된 리소스를 이 작업으로 삭제하거나 회수하지 않습니다.</p>
  </div>
  return expectedName !== undefined
    ? <ConfirmNameModal open onClose={close} title="워크스페이스 삭제" expectedName={expectedName} confirmLabel="워크스페이스 삭제" loading={pending}
      disabled={!read.confirmed} className="max-w-3xl" onConfirm={(typedName) => { if (typedName === expectedName) void submit() }}>{body}</ConfirmNameModal>
    : <Modal open onClose={close} title="초대 취소" className="max-w-3xl" footer={<><Button variant="secondary" onClick={close}>닫기</Button><Button variant="danger" loading={pending} disabled={!read.confirmed} onClick={() => void submit()}>초대 취소</Button></>}>{body}</Modal>
}
