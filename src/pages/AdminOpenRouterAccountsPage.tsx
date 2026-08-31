import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import {
  createOpenRouterAccount,
  fetchOpenRouterAccounts,
  type CreateOpenRouterAccount,
  type OpenRouterAccount,
} from '../api/queries'
import { toApiError } from '../api/problem'
import { useAuth } from '../auth/auth-context'
import { canManageOpenRouterAccount } from '../auth/permissions'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FormField,
  Input,
  LoadingBlock,
  MessageBar,
  Modal,
  PageHeader,
  Select,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../components/ui'
import { adminPaths } from '../lib/paths'
import { useAdminScope } from '../lib/use-admin-scope'
import { AccountCreditsCompact } from '../components/OpenRouterCredits'

const ACCOUNT_CACHE_REFETCH_MS = 2 * 60 * 1000

function accountStatus(account: OpenRouterAccount) {
  return account.status === 'ACTIVE' ? (
    <Badge variant="success">활성</Badge>
  ) : (
    <Badge>보관됨</Badge>
  )
}

function credentialSummary(account: OpenRouterAccount): string {
  if (account.rotationCredential?.status === 'STAGED') return '교체 대기 · 기존 credential 유지'
  if (account.rotationCredential?.status === 'RETIRING') return '교체 완료 · 이전 credential 정리 대기'
  if (account.activeCredential) return '활성 credential 있음'
  return 'credential 없음'
}

export function AdminOpenRouterAccountsPage() {
  const { user } = useAuth()
  const scope = useAdminScope()
  const role = scope.tier === 'org' ? scope.activeOrgRole : user?.role
  const canManage = !!role && canManageOpenRouterAccount(role)
  const [createOpen, setCreateOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const accounts = useQuery({
    queryKey: ['admin', 'llm-accounts', { orgId: scope.activeOrgId ?? null }],
    queryFn: () => fetchOpenRouterAccounts(scope.activeOrgId),
    enabled: scope.ready,
    refetchInterval: ACCOUNT_CACHE_REFETCH_MS,
  })

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="리소스"
        title="OpenRouter 사업 계정"
        description="기관의 사업·재원·결제 단위와 management credential 상태를 조회합니다. 계정끼리 잔액이나 사용액을 합치지 않습니다."
        actions={
          canManage ? (
            <Button onClick={() => setCreateOpen(true)}>사업 계정 등록</Button>
          ) : undefined
        }
      />

      {notice && <MessageBar variant="success">{notice}</MessageBar>}
      {accounts.isPending && <LoadingBlock label="OpenRouter 사업 계정 목록 불러오는 중" />}
      {accounts.isError && <MessageBar variant="danger">{accounts.error.message}</MessageBar>}
      {accounts.isSuccess && accounts.data.length === 0 && (
        <EmptyState
          title="등록된 OpenRouter 사업 계정이 없습니다"
          description="금액 축을 승인하려면 이 기관에 검증된 management credential이 있는 활성 사업 계정이 필요합니다."
        />
      )}
      {accounts.isSuccess && accounts.data.length > 0 && (
        <DataTable caption="OpenRouter 사업 계정 목록">
          <THead>
            <TR>
              <TH>사업 계정</TH>
              <TH>기관</TH>
              <TH>상태</TH>
              <TH>재원·증빙</TH>
              <TH>Credential</TH>
              <TH>Key binding</TH>
              <TH>Credits</TH>
            </TR>
          </THead>
          <TBody>
            {accounts.data.map((account) => (
              <TR key={account.id}>
                <TD>
                  <Link
                    to={adminPaths.llmAccountDetail(account.id, scope.activeOrgId)}
                    className="font-medium text-brand-foreground hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring"
                  >
                    {account.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-foreground-muted">
                    {account.eligibleForBinding ? '금액 축 binding 가능' : '금액 축 binding 불가'}
                  </p>
                </TD>
                <TD>{account.orgName}</TD>
                <TD>{accountStatus(account)}</TD>
                <TD className="text-xs">
                  <span className="block">재원 {account.fundingReference ?? '미입력'}</span>
                  <span className="block text-foreground-muted">
                    증빙 {account.evidenceReference ?? '미입력'}
                  </span>
                </TD>
                <TD>{credentialSummary(account)}</TD>
                <TD>{account.boundKeyCount.toLocaleString('ko-KR')}개</TD>
                <TD><AccountCreditsCompact credits={account.credits} /></TD>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}

      {createOpen && (
        <CreateAccountModal
          fixedOrgId={scope.activeOrgId}
          orgOptions={scope.options}
          onClose={() => setCreateOpen(false)}
          onCreated={(account) => {
            setCreateOpen(false)
            setNotice(`${account.name} 사업 계정을 등록했습니다.`)
          }}
        />
      )}
    </div>
  )
}

function CreateAccountModal({
  fixedOrgId,
  orgOptions,
  onClose,
  onCreated,
}: {
  fixedOrgId?: string
  orgOptions: { id: string; name: string }[]
  onClose: () => void
  onCreated: (account: OpenRouterAccount) => void
}) {
  const queryClient = useQueryClient()
  const [orgId, setOrgId] = useState(fixedOrgId ?? '')
  const [name, setName] = useState('')
  const [fundingReference, setFundingReference] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [confirmName, setConfirmName] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (body: CreateOpenRouterAccount) => createOpenRouterAccount(body),
    onSuccess: async (account) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'llm-accounts'] })
      onCreated(account)
    },
    onError: (failure) =>
      setError(toApiError(failure, 'OpenRouter 사업 계정을 등록하지 못했습니다.').message),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    setError(null)
    const normalizedName = name.trim()
    if (!orgId || !normalizedName || confirmName !== normalizedName) return
    create.mutate({
      orgId,
      name: normalizedName,
      fundingReference: fundingReference.trim() || null,
      evidenceReference: evidenceReference.trim() || null,
      confirmName,
    })
  }

  return (
    <Modal open onClose={onClose} title="OpenRouter 사업 계정 등록">
      <form className="space-y-4" onSubmit={submit} noValidate>
        {error && <MessageBar variant="danger">{error}</MessageBar>}
        <p className="text-sm text-foreground-secondary">
          사업 계정은 재원·결제 단위입니다. Management credential은 계정을 만든 뒤 별도로
          검증해 등록합니다.
        </p>
        <FormField label="기관" required error={submitted && !orgId ? '기관을 선택해 주세요.' : undefined}>
          {fixedOrgId ? (
            <Input
              value={orgOptions.find((org) => org.id === fixedOrgId)?.name ?? fixedOrgId}
              readOnly
              aria-readonly="true"
            />
          ) : (
            <Select value={orgId} onChange={(event) => setOrgId(event.target.value)}>
              <option value="">기관 선택</option>
              {orgOptions.map((org) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="사업 계정 이름" required error={submitted && !name.trim() ? '이름을 입력해 주세요.' : undefined}>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="재원 참조" description="선택">
            <Input value={fundingReference} onChange={(event) => setFundingReference(event.target.value)} />
          </FormField>
          <FormField label="증빙 참조" description="선택">
            <Input value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} />
          </FormField>
        </div>
        <FormField
          label={`계속하려면 이름(${name.trim() || '사업 계정 이름'})을 정확히 입력하세요`}
          required
          error={submitted && confirmName !== name.trim() ? '사업 계정 이름과 정확히 같아야 합니다.' : undefined}
        >
          <Input
            value={confirmName}
            onChange={(event) => setConfirmName(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button type="submit" loading={create.isPending}>등록</Button>
        </div>
      </form>
    </Modal>
  )
}
