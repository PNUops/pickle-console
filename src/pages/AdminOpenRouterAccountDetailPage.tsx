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
import { AccountAllocationSection, AccountCreditsSection } from '../components/OpenRouterCredits'

const ACCOUNT_CACHE_REFETCH_MS = 2 * 60 * 1000

type ConfirmAction = 'activate' | 'cancel' | 'rollback' | 'finalize' | 'delete'

const ACTION_COPY: Record<ConfirmAction, { title: string; label: string; success: string }> = {
  activate: {
    title: '대기 중인 관리용 키 활성화',
    label: '활성화',
    success: '대기 중이던 관리용 키를 활성화했습니다.',
  },
  cancel: {
    title: '대기 중인 관리용 키 취소',
    label: '대기 취소',
    success: '대기 중이던 관리용 키를 취소했습니다.',
  },
  rollback: {
    title: '관리용 키 교체 되돌리기',
    label: '되돌리기',
    success: '이전 관리용 키를 다시 활성화했습니다.',
  },
  finalize: {
    title: '이전 관리용 키 정리',
    label: '정리',
    success: '폐기된 이전 관리용 키를 정리했습니다.',
  },
  delete: {
    title: '쓰지 않는 관리용 키 삭제',
    label: '삭제',
    success: '폐기된 관리용 키를 삭제했습니다.',
  },
}

function time(value: string | null | undefined): string {
  return value ? formatDateTime(value) : '기록 없음'
}

function credentialError(value: OpenRouterCredentialState['verificationError']): string {
  switch (value) {
    case 'CREDENTIAL_ERROR': return '관리용 키 인증 실패'
    case 'THROTTLED': return 'OpenRouter 요청 제한'
    case 'VENDOR_UNAVAILABLE': return 'OpenRouter 연결 불가'
    case 'VENDOR_REJECTED': return 'OpenRouter가 요청 거부'
    default: return '최근 확인 오류 없음'
  }
}

function reconciledAfterActivation(credential: OpenRouterCredentialState | null | undefined): boolean {
  return !!credential?.activatedAt && !!credential.lastReconciledAt &&
    new Date(credential.lastReconciledAt).getTime() >= new Date(credential.activatedAt).getTime()
}

function preserveObservedCredits(
  cached: OpenRouterAccount | undefined,
  mutationResult: OpenRouterAccount,
): OpenRouterAccount {
  return cached ? { ...mutationResult, credits: cached.credits } : mutationResult
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
    refetchInterval: ACCOUNT_CACHE_REFETCH_MS,
  })

  const applyUpdated = (account: OpenRouterAccount, message: string) => {
    const cached = queryClient.getQueryData<OpenRouterAccount>(detailKey)
    queryClient.setQueryData(detailKey, preserveObservedCredits(cached, account))
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
      setError(toApiError(failure, '관리용 키 상태를 변경하지 못했습니다.').message)
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
  // OpenRouter에서 이미 폐기되어 최근 확인이 CREDENTIAL_ERROR인 키는
  // credentialAvailable=false가 정상이다. Safe delete는 그 암호문을 치우는 복구
  // 경로이므로 존재와 교체 상태만으로 열고, 서버가 실제 401/403을 확인한다.
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
        description="사업 단위 결제 계정의 정보와 관리용 키 상태입니다. 키 값 자체는 저장하지도 보여 주지도 않습니다."
        actions={<Badge variant={account.status === 'ACTIVE' ? 'success' : 'neutral'}>{account.status === 'ACTIVE' ? '활성' : '보관됨'}</Badge>}
      />

      {(canManage || hasCredentialActions) && (
        <CommandBar
          aria-label="OpenRouter 사업 계정 동작"
          primary={
            <>
              {canManage && <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>정보 변경</Button>}
              {canStage && <Button size="sm" variant="secondary" onClick={() => setStageOpen(true)}>관리용 키 등록·교체</Button>}
              {canActivate && <Button size="sm" onClick={() => setConfirmAction('activate')}>대기 중인 키 활성화</Button>}
              {canCancel && <Button size="sm" variant="secondary" onClick={() => setConfirmAction('cancel')}>대기 취소</Button>}
              {canRollback && <Button size="sm" variant="secondary" onClick={() => setConfirmAction('rollback')}>교체 되돌리기</Button>}
            </>
          }
          secondary={
            <>
              {canFinalize && <Button size="sm" variant="danger" onClick={() => setConfirmAction('finalize')}>이전 키 정리</Button>}
              {canDeleteActive && <Button size="sm" variant="danger" onClick={() => setConfirmAction('delete')}>관리용 키 삭제</Button>}
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
          { term: '사업', description: account.program ?? '입력하지 않음' },
          { term: '담당자', description: account.contact ?? '입력하지 않음' },
          { term: '연결된 키', description: `${account.boundKeyCount.toLocaleString('ko-KR')}개` },
          { term: '관리용 키', description: account.credentialAvailable ? '사용 가능' : '사용 불가' },
          { term: '유료 모델 연결', description: account.eligibleForBinding ? '가능' : '불가' },
          { term: '등록', description: time(account.createdAt) },
          { term: '마지막 변경', description: time(account.updatedAt) },
        ]}
      />

      <AccountCreditsSection credits={account.credits} />
      <AccountAllocationSection allocation={account.allocation} credits={account.credits} />

      <section className="space-y-4 rounded-panel border border-stroke-subtle bg-surface-card p-4">
        <div>
          <h2 className="type-section-title">관리용 키</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            키 값과 그 일부는 저장하지도 화면에 보여 주지도 않습니다.
          </p>
        </div>
        {!account.activeCredential && !rotation && (
          <MessageBar>등록된 관리용 키가 없습니다.</MessageBar>
        )}
        {account.activeCredential && <CredentialStateCard title="사용 중" credential={account.activeCredential} />}
        {rotation && (
          <CredentialStateCard
            title={rotation.status === 'STAGED' ? '교체 대기' : '정리 대기'}
            credential={rotation}
          />
        )}
        {rotation?.retiringOverdue && (
          <MessageBar variant="warning" title="정리 대기가 24시간을 넘었습니다">
            OpenRouter 쪽에서 이전 키를 폐기했는지, 새 키로 대사가 성공했는지 확인한 뒤 직접
            정리하세요. 자동으로 삭제하지 않습니다.
          </MessageBar>
        )}
        {rotation?.status === 'RETIRING' && !reconciledAfterActivation(account.activeCredential) && (
          <MessageBar title="새 키로 대사가 끝나기를 기다리는 중">
            새 키로 키 대사가 한 번 성공한 뒤에야 이전 키를 정리할 수 있습니다.
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
          onSaved={(updated) => applyUpdated(updated, '관리용 키를 확인해 교체 대기로 등록했습니다.')}
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
          {credential.verificationError ? '최근 확인 실패' : credential.verifiedAt ? '확인됨' : '확인 이력 없음'}
        </Badge>
      </div>
      <DescriptionList
        columns={3}
        items={[
          { term: '등록', description: time(credential.createdAt) },
          { term: '확인 성공', description: time(credential.verifiedAt) },
          { term: '최근 확인 시도', description: time(credential.lastVerificationAttemptAt) },
          { term: '최근 확인 결과', description: credentialError(credential.verificationError) },
          { term: '활성화', description: time(credential.activatedAt) },
          { term: '최근 키 대사', description: time(credential.lastReconciledAt) },
          { term: '마지막 사용', description: time(credential.lastUsedAt) },
          { term: '정리 대기 전환', description: time(credential.retiringAt) },
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
  const [program, setProgram] = useState(account.program ?? '')
  const [contact, setContact] = useState(account.contact ?? '')
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
      program: program.trim() || null,
      contact: contact.trim() || null,
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
          <FormField label="사업명"><Input value={program} onChange={(event) => setProgram(event.target.value)} /></FormField>
          <FormField label="담당자"><Input value={contact} onChange={(event) => setContact(event.target.value)} /></FormField>
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
      onError(toApiError(failure, '관리용 키를 확인하지 못했습니다.').message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="관리용 키 등록·교체">
      <form className="space-y-4" onSubmit={(event) => void submit(event)} noValidate>
        <MessageBar>
          입력한 키로 일회용 키를 하나 만들었다 지워 보면서 권한과 계정을 확인합니다. 입력값은 응답이나 화면 기록에 남기지 않습니다.
        </MessageBar>
        <FormField label="OpenRouter 관리용 키" required error={submitted && !managementKey && !pending ? '관리용 키를 입력해 주세요.' : undefined}>
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
        {action === 'activate' && <p className="text-sm text-foreground-secondary">교체 대기 중인 키를 다시 확인하고 활성화합니다. 쓰던 키가 있으면 정리 대기로 남겨 둡니다.</p>}
        {action === 'rollback' && <p className="text-sm text-foreground-secondary">지금 쓰는 키를 교체 대기로 되돌리고 정리 대기 중이던 이전 키를 다시 활성화합니다.</p>}
        {requiresVendorRevocation && (
          <Checkbox
            checked={vendorRevoked}
            onChange={(event) => setVendorRevoked(event.target.checked)}
            label="OpenRouter 콘솔에서 해당 관리용 키를 폐기했습니다"
            description="Pickle이 대신 폐기하지 않습니다. 폐기를 확인해야 정리가 진행됩니다."
          />
        )}
        <FormField label={`계속하려면 이름(${account.name})을 정확히 입력하세요`} required>
          <Input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="off" spellCheck={false} />
        </FormField>
      </div>
    </Modal>
  )
}
