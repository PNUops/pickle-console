import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import {
  confirmOpenRouterCredentialAction,
  fetchOpenRouterAccount,
  revokeOpenRouterCredential,
  stageOpenRouterCredential,
  updateOpenRouterAccount,
  type OpenRouterAccount,
  type OpenRouterCredentialState,
  type UpdateOpenRouterAccount,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { canManageOpenRouterAccount } from '../auth/permissions'
import {
  Badge,
  Button,
  Checkbox,
  CommandBar,
  DescriptionList,
  FormField,
  Input,
  LoadingBlock,
  MessageBar,
  Modal,
  PageHeader,
  Select,
} from '../components/ui'
import { formatDateTime } from '../lib/format'
import { adminPaths } from '../lib/paths'
import { useAdminScope } from '../lib/use-admin-scope'
import { INVALID_ID_MESSAGE, isUuid } from '../lib/validation'

type ConfirmAction = 'activate' | 'cancel' | 'rollback' | 'finalize' | 'delete'

const ACTION_COPY: Record<ConfirmAction, { title: string; label: string; success: string }> = {
  activate: {
    title: '대기 credential 활성화',
    label: '활성화',
    success: '대기 중인 management credential을 활성화했습니다.',
  },
  cancel: {
    title: '대기 credential 취소',
    label: '대기 취소',
    success: '대기 중인 management credential을 취소했습니다.',
  },
  rollback: {
    title: 'Credential 교체 되돌리기',
    label: '되돌리기',
    success: '이전 management credential을 다시 활성화했습니다.',
  },
  finalize: {
    title: '이전 credential 정리',
    label: '정리',
    success: '폐기된 이전 management credential 암호문을 정리했습니다.',
  },
  delete: {
    title: '사용하지 않는 credential 삭제',
    label: '삭제',
    success: '폐기된 management credential 암호문을 삭제했습니다.',
  },
}

function time(value: string | null | undefined): string {
  return value ? formatDateTime(value) : '기록 없음'
}

function credentialError(value: OpenRouterCredentialState['verificationError']): string {
  switch (value) {
    case 'CREDENTIAL_ERROR': return 'Credential 오류'
    case 'THROTTLED': return 'Vendor 요청 제한'
    case 'VENDOR_UNAVAILABLE': return 'Vendor 연결 불가'
    case 'VENDOR_REJECTED': return 'Vendor 거부'
    default: return '최근 검증 오류 없음'
  }
}

function reconciledAfterActivation(credential: OpenRouterCredentialState | null | undefined): boolean {
  return !!credential?.activatedAt && !!credential.lastReconciledAt &&
    new Date(credential.lastReconciledAt).getTime() >= new Date(credential.activatedAt).getTime()
}

export function AdminOpenRouterAccountDetailPage() {
  const { accountId: accountIdParam } = useParams()
  const accountId = accountIdParam ?? ''
  const idValid = isUuid(accountId)
  const { user } = useAuth()
  const scope = useAdminScope()
  const role = scope.tier === 'org' ? scope.activeOrgRole : user?.role
  const canManage = !!role && canManageOpenRouterAccount(role)
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [stageOpen, setStageOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const detailKey = ['admin', 'llm-accounts', 'detail', { accountId, orgId: scope.activeOrgId ?? null }]
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: () => fetchOpenRouterAccount(accountId),
    enabled: idValid && scope.ready,
  })

  const applyUpdated = (account: OpenRouterAccount, message: string) => {
    queryClient.setQueryData(detailKey, account)
    void queryClient.invalidateQueries({ queryKey: ['admin', 'llm-accounts'] })
    setEditOpen(false)
    setStageOpen(false)
    setConfirmAction(null)
    setError(null)
    setNotice(message)
  }

  const action = useMutation({
    mutationFn: async ({ kind, confirmName }: { kind: ConfirmAction; confirmName: string }) =>
      kind === 'finalize' || kind === 'delete'
        ? revokeOpenRouterCredential(accountId, kind, confirmName)
        : confirmOpenRouterCredentialAction(accountId, kind, confirmName),
    onSuccess: (account, variables) => applyUpdated(account, ACTION_COPY[variables.kind].success),
    onError: (failure) => {
      setConfirmAction(null)
      setError(toApiError(failure, 'OpenRouter credential 상태를 변경하지 못했습니다.').message)
    },
  })

  if (!idValid) return <MessageBar variant="danger">{INVALID_ID_MESSAGE}</MessageBar>
  if (detail.isPending) return <LoadingBlock label="OpenRouter 사업 계정 상세 불러오는 중" />
  if (detail.isError) return <MessageBar variant="danger">{detail.error.message}</MessageBar>
  if (scope.activeOrgId != null && detail.data.orgId !== scope.activeOrgId) {
    return <MessageBar variant="danger">현재 관리 범위에서 이 OpenRouter 사업 계정을 찾을 수 없습니다.</MessageBar>
  }

  const account = detail.data
  const rotation = account.rotationCredential
  const canStage = canManage && account.status === 'ACTIVE' && rotation == null
  const canActivate = canManage && account.status === 'ACTIVE' && rotation?.status === 'STAGED'
  const canCancel = canManage && rotation?.status === 'STAGED'
  const canRollback = canManage && rotation?.status === 'RETIRING'
  const canFinalize = canManage && rotation?.status === 'RETIRING' &&
    reconciledAfterActivation(account.activeCredential)
  // Vendor에서 이미 폐기되어 최근 검증이 CREDENTIAL_ERROR인 credential은
  // credentialAvailable=false가 정상이다. Safe delete는 그 암호문을 치우는 복구
  // 경로이므로 존재·rotation·binding만으로 열고, 서버가 실제 401/403을 확인한다.
  const canDeleteActive = canManage && !!account.activeCredential && rotation == null &&
    account.boundKeyCount === 0
  const hasCredentialActions = canStage || canActivate || canCancel || canRollback || canFinalize || canDeleteActive

  return (
    <div className="space-y-5">
      <Link to={adminPaths.llmAccounts(scope.activeOrgId)} className="text-sm text-brand-foreground hover:underline">
        ← OpenRouter 사업 계정
      </Link>
      <PageHeader
        eyebrow={account.orgName}
        title={account.name}
        description="사업·재원 단위의 account metadata와 secret-free credential lifecycle입니다."
        actions={<Badge variant={account.status === 'ACTIVE' ? 'success' : 'neutral'}>{account.status === 'ACTIVE' ? '활성' : '보관됨'}</Badge>}
      />

      {(canManage || hasCredentialActions) && (
        <CommandBar
          aria-label="OpenRouter 사업 계정 동작"
          primary={
            <>
              {canManage && <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>정보 변경</Button>}
              {canStage && <Button size="sm" variant="secondary" onClick={() => setStageOpen(true)}>Credential 등록·교체</Button>}
              {canActivate && <Button size="sm" onClick={() => setConfirmAction('activate')}>대기 credential 활성화</Button>}
              {canCancel && <Button size="sm" variant="secondary" onClick={() => setConfirmAction('cancel')}>대기 취소</Button>}
              {canRollback && <Button size="sm" variant="secondary" onClick={() => setConfirmAction('rollback')}>교체 되돌리기</Button>}
            </>
          }
          secondary={
            <>
              {canFinalize && <Button size="sm" variant="danger" onClick={() => setConfirmAction('finalize')}>이전 credential 정리</Button>}
              {canDeleteActive && <Button size="sm" variant="danger" onClick={() => setConfirmAction('delete')}>Credential 삭제</Button>}
            </>
          }
        />
      )}

      {notice && <MessageBar variant="success">{notice}</MessageBar>}
      {error && <MessageBar variant="danger">{error}</MessageBar>}

      <DescriptionList
        columns={3}
        items={[
          { term: '기관', description: account.orgName },
          { term: '재원 참조', description: account.fundingReference ?? '입력하지 않음' },
          { term: '증빙 참조', description: account.evidenceReference ?? '입력하지 않음' },
          { term: '연결된 Pickle key', description: `${account.boundKeyCount.toLocaleString('ko-KR')}개` },
          { term: 'Credential 사용 가능', description: account.credentialAvailable ? '가능' : '불가' },
          { term: '금액 축 binding', description: account.eligibleForBinding ? '선택 가능' : '선택 불가' },
          { term: '등록', description: time(account.createdAt) },
          { term: '마지막 변경', description: time(account.updatedAt) },
        ]}
      />

      <section className="space-y-4 rounded-panel border border-stroke-subtle bg-surface-card p-4">
        <div>
          <h2 className="type-section-title">Management credential</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            평문, hash, prefix, label은 저장 상태 화면과 응답에 표시하지 않습니다.
          </p>
        </div>
        {!account.activeCredential && !rotation && (
          <MessageBar>등록된 management credential이 없습니다.</MessageBar>
        )}
        {account.activeCredential && <CredentialStateCard title="현재 ACTIVE" credential={account.activeCredential} />}
        {rotation && (
          <CredentialStateCard
            title={rotation.status === 'STAGED' ? '교체 대기 STAGED' : '정리 대기 RETIRING'}
            credential={rotation}
          />
        )}
        {rotation?.retiringOverdue && (
          <MessageBar variant="warning" title="RETIRING 상태가 24시간을 넘었습니다">
            Vendor console 폐기와 새 ACTIVE reconciliation 상태를 확인한 뒤 직접 정리하세요. 자동 삭제하지 않습니다.
          </MessageBar>
        )}
        {rotation?.status === 'RETIRING' && !reconciledAfterActivation(account.activeCredential) && (
          <MessageBar title="새 ACTIVE credential reconciliation 대기 중">
            새 credential로 key reconciliation이 성공한 뒤에만 이전 credential을 정리할 수 있습니다.
          </MessageBar>
        )}
      </section>

      {editOpen && (
        <EditAccountModal
          account={account}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => applyUpdated(updated, 'OpenRouter 사업 계정 정보를 변경했습니다.')}
        />
      )}
      {stageOpen && (
        <StageCredentialModal
          account={account}
          onClose={() => setStageOpen(false)}
          onSaved={(updated) => applyUpdated(updated, 'Management credential을 검증해 STAGED로 등록했습니다.')}
          onError={(message) => {
            setStageOpen(false)
            setError(message)
          }}
        />
      )}
      {confirmAction && (
        <CredentialConfirmModal
          account={account}
          action={confirmAction}
          loading={action.isPending}
          onClose={() => setConfirmAction(null)}
          onConfirm={(confirmName) => action.mutate({ kind: confirmAction, confirmName })}
        />
      )}
    </div>
  )
}

function CredentialStateCard({ title, credential }: { title: string; credential: OpenRouterCredentialState }) {
  return (
    <div className="rounded-panel border border-stroke-subtle bg-surface-subtle p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-foreground-primary">{title}</h3>
        <Badge variant={credential.verificationError ? 'warning' : credential.verifiedAt ? 'success' : 'neutral'}>
          {credential.verificationError ? '최근 검증 실패' : credential.verifiedAt ? '검증됨' : '검증 이력 없음'}
        </Badge>
      </div>
      <DescriptionList
        columns={3}
        items={[
          { term: '등록', description: time(credential.createdAt) },
          { term: '검증 성공', description: time(credential.verifiedAt) },
          { term: '최근 검증 시도', description: time(credential.lastVerificationAttemptAt) },
          { term: '최근 검증 결과', description: credentialError(credential.verificationError) },
          { term: '활성화', description: time(credential.activatedAt) },
          { term: '최근 reconciliation', description: time(credential.lastReconciledAt) },
          { term: 'Management API 사용', description: time(credential.lastUsedAt) },
          { term: 'RETIRING 전환', description: time(credential.retiringAt) },
        ]}
      />
    </div>
  )
}

function EditAccountModal({
  account,
  onClose,
  onSaved,
}: {
  account: OpenRouterAccount
  onClose: () => void
  onSaved: (account: OpenRouterAccount) => void
}) {
  const [name, setName] = useState(account.name)
  const [fundingReference, setFundingReference] = useState(account.fundingReference ?? '')
  const [evidenceReference, setEvidenceReference] = useState(account.evidenceReference ?? '')
  const [status, setStatus] = useState(account.status)
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: (body: UpdateOpenRouterAccount) => updateOpenRouterAccount(account.id, body),
    onSuccess: onSaved,
    onError: (failure) => setError(toApiError(failure, 'OpenRouter 사업 계정 정보를 변경하지 못했습니다.').message),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    save.mutate({
      name: name.trim(),
      fundingReference: fundingReference.trim() || null,
      evidenceReference: evidenceReference.trim() || null,
      status,
    })
  }
  return (
    <Modal open onClose={onClose} title="OpenRouter 사업 계정 정보 변경">
      <form className="space-y-4" onSubmit={submit}>
        {error && <MessageBar variant="danger">{error}</MessageBar>}
        <FormField label="사업 계정 이름" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="재원 참조"><Input value={fundingReference} onChange={(event) => setFundingReference(event.target.value)} /></FormField>
          <FormField label="증빙 참조"><Input value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} /></FormField>
        </div>
        <FormField label="상태" description="활성 또는 미만료 key가 연결되어 있으면 보관할 수 없습니다.">
          <Select value={status} onChange={(event) => setStatus(event.target.value as OpenRouterAccount['status'])}>
            <option value="ACTIVE">활성</option>
            <option value="ARCHIVED">보관됨</option>
          </Select>
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button type="submit" loading={save.isPending}>저장</Button>
        </div>
      </form>
    </Modal>
  )
}

function StageCredentialModal({
  account,
  onClose,
  onSaved,
  onError,
}: {
  account: OpenRouterAccount
  onClose: () => void
  onSaved: (account: OpenRouterAccount) => void
  onError: (message: string) => void
}) {
  const [managementKey, setManagementKey] = useState('')
  const [confirmName, setConfirmName] = useState('')
  const [pending, setPending] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (!managementKey || confirmName !== account.name || pending) return
    setPending(true)
    const oneUseKey = managementKey
    setManagementKey('')
    try {
      const updated = await stageOpenRouterCredential(account.id, oneUseKey, confirmName)
      onSaved(updated)
    } catch (failure) {
      onError(toApiError(failure, 'OpenRouter management credential을 검증하지 못했습니다.').message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Management credential 등록·교체">
      <form className="space-y-4" onSubmit={(event) => void submit(event)} noValidate>
        <MessageBar>
          Management 전용 권한과 vendor workspace를 disposable key로 검증합니다. 입력값은 응답이나 화면 기록에 남기지 않습니다.
        </MessageBar>
        <FormField label="OpenRouter management key" required error={submitted && !managementKey && !pending ? 'Management key를 입력해 주세요.' : undefined}>
          <Input
            type="password"
            value={managementKey}
            onChange={(event) => setManagementKey(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </FormField>
        <FormField
          label={`계속하려면 이름(${account.name})을 정확히 입력하세요`}
          required
          error={submitted && confirmName !== account.name ? '사업 계정 이름과 정확히 같아야 합니다.' : undefined}
        >
          <Input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="off" spellCheck={false} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button type="submit" loading={pending}>검증 후 대기 등록</Button>
        </div>
      </form>
    </Modal>
  )
}

function CredentialConfirmModal({
  account,
  action,
  loading,
  onClose,
  onConfirm,
}: {
  account: OpenRouterAccount
  action: ConfirmAction
  loading: boolean
  onClose: () => void
  onConfirm: (confirmName: string) => void
}) {
  const [confirmName, setConfirmName] = useState('')
  const [vendorRevoked, setVendorRevoked] = useState(false)
  const requiresVendorRevocation = action === 'finalize' || action === 'delete'
  const copy = ACTION_COPY[action]
  const ready = confirmName === account.name && (!requiresVendorRevocation || vendorRevoked)
  return (
    <Modal
      open
      onClose={onClose}
      title={copy.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>돌아가기</Button>
          <Button variant={requiresVendorRevocation || action === 'cancel' ? 'danger' : 'primary'} loading={loading} disabled={!ready} onClick={() => onConfirm(confirmName)}>
            {copy.label}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {action === 'activate' && <p className="text-sm text-foreground-secondary">STAGED credential을 다시 검증하고 활성화합니다. 기존 ACTIVE가 있으면 RETIRING으로 보존합니다.</p>}
        {action === 'rollback' && <p className="text-sm text-foreground-secondary">현재 ACTIVE를 STAGED로 되돌리고 이전 RETIRING을 다시 활성화합니다.</p>}
        {requiresVendorRevocation && (
          <Checkbox
            checked={vendorRevoked}
            onChange={(event) => setVendorRevoked(event.target.checked)}
            label="Vendor console에서 대상 management key를 폐기했습니다"
            description="API는 vendor key를 대신 폐기하지 않습니다. Vendor가 폐기를 확인해야 정리가 진행됩니다."
          />
        )}
        <FormField label={`계속하려면 이름(${account.name})을 정확히 입력하세요`} required>
          <Input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="off" spellCheck={false} />
        </FormField>
      </div>
    </Modal>
  )
}
