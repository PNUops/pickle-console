import { useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addLlmKeyAccessGrant,
  addVmAccessGrant,
  fetchLlmKeyAccessGrants,
  fetchVmAccessGrants,
  fetchWorkspace,
  removeLlmKeyAccessGrant,
  removeVmAccessGrant,
  updateLlmKeyAccessGrant,
  updateVmAccessGrant,
  type ResourceRole,
  type ResourceSummary,
  type VmAccessGrant,
  type VmAccessList,
} from '../../api/queries'
import { toApiError } from '../../api/problem'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Modal,
  ResourceRoleBadge,
  Select,
  Spinner,
} from '../ui'
import {
  LLM_KEY_RESOURCE_ROLE_HINTS,
  RESOURCE_ROLE_HINTS,
  RESOURCE_ROLE_LABELS,
} from '../../lib/labels'
import { formatDateTime } from '../../lib/format'

const ASSIGNABLE: ResourceRole[] = ['OWNER', 'EDITOR', 'MEMBER', 'VIEWER']
/** 워크스페이스 전체에는 리소스를 좌우하는 등급을 줄 수 없다 (서버도 같은 제한). */
const WORKSPACE_WIDE_ASSIGNABLE: ResourceRole[] = ['MEMBER', 'VIEWER']

type ResourceType = ResourceSummary['type']

/**
 * 종류 하나가 접근 목록 화면에 보태는 전부.
 *
 * 규칙은 종류를 가리지 않는다 — 네 개의 호출과 등급 상한은 서버에서도 공용
 * 코드다. 종류마다 다른 것은 사람이 읽는 문장뿐이고(VM 이야기와 키 이야기는
 * 같은 문장이 아니다), api의 `ResourceAccessMessages`가 내린 것과 같은 결론이다.
 */
interface AccessKind {
  /** 쿼리 키 접두 — 이 종류의 상세·목록 캐시와 같은 접두를 써야 갱신이 닿는다. */
  queryKey: string
  fetchGrants: (resourceId: string) => Promise<VmAccessList>
  addGrant: (
    resourceId: string,
    body: { granteeType: 'USER' | 'WORKSPACE'; userId?: string; role: ResourceRole },
  ) => Promise<VmAccessGrant>
  updateGrant: (
    resourceId: string,
    grantId: string,
    role: ResourceRole,
  ) => Promise<VmAccessGrant>
  removeGrant: (resourceId: string, grantId: string) => Promise<void>
  roleHints: Record<ResourceRole, string>
  /** 목록 위에서 이 목록이 무엇을 정하는지 말하는 문장. */
  listIntro: string
  /** 워크스페이스 전체 항목이 가리키는 사람들. */
  workspaceWideWho: string
  /** 목록이 비었을 때. */
  emptyList: string
  /** 부여 폼 아래의 자격 안내. */
  grantEligibility: string
  /** 회수 확인 모달의 첫 문장 — 대상 이름이 앞에 붙는다. */
  revokeSentence: (who: string) => string
  /** 회수가 되돌리지 못하는 것. 종류마다 완전히 다른 목록이다. */
  revokeCaveats: ReactNode
}

const ACCESS_KINDS: Record<ResourceType, AccessKind> = {
  VM: {
    queryKey: 'vms',
    fetchGrants: fetchVmAccessGrants,
    addGrant: addVmAccessGrant,
    updateGrant: updateVmAccessGrant,
    removeGrant: removeVmAccessGrant,
    roleHints: RESOURCE_ROLE_HINTS,
    listIntro:
      '이 VM에는 아래 목록에 있는 사람만 접근할 수 있습니다. 같은 워크스페이스이라도 목록에 없으면 이름과 상태만 보입니다.',
    workspaceWideWho: '이 VM을 소유한 워크스페이스의 구성원 전원',
    emptyList: '접근 권한이 하나도 없습니다. 이 VM에 닿을 수 있는 사람이 없습니다.',
    grantEligibility:
      '이 VM을 소유한 워크스페이스의 구성원만 부여 대상이 됩니다. 워크스페이스 전체에는 참여자 또는 열람자까지만 줄 수 있습니다.',
    revokeSentence: (who) => `${who}의 이 VM 접근 권한을 회수합니다.`,
    revokeCaveats: (
      <ul className="list-disc space-y-1 pl-4">
        <li>
          이미 열람한 초기 비밀번호는 그대로 남습니다. 완전히 막으려면 개요 탭에서
          비밀번호를 재생성해 주세요.
        </li>
        <li>
          이미 열려 있는 SSH 세션은 끊기지 않습니다. 웹 터미널은 1분 안에 닫힙니다.
        </li>
      </ul>
    ),
  },
  LLM_API_KEY: {
    queryKey: 'llm-keys',
    fetchGrants: fetchLlmKeyAccessGrants,
    addGrant: addLlmKeyAccessGrant,
    updateGrant: updateLlmKeyAccessGrant,
    removeGrant: removeLlmKeyAccessGrant,
    roleHints: LLM_KEY_RESOURCE_ROLE_HINTS,
    listIntro:
      '이 LLM API 키에는 아래 목록에 있는 사람만 접근할 수 있습니다. 같은 워크스페이스이라도 목록에 없으면 이름과 상태만 보입니다.',
    workspaceWideWho: '이 키를 소유한 워크스페이스의 구성원 전원',
    emptyList: '접근 권한이 하나도 없습니다. 이 LLM API 키에 닿을 수 있는 사람이 없습니다.',
    grantEligibility:
      '이 키를 소유한 워크스페이스의 구성원만 부여 대상이 됩니다. 워크스페이스 전체에는 참여자 또는 열람자까지만 줄 수 있습니다.',
    revokeSentence: (who) => `${who}의 이 LLM API 키 접근 권한을 회수합니다.`,
    revokeCaveats: (
      <ul className="list-disc space-y-1 pl-4">
        <li>
          이미 발급받아 확인한 키 평문은 회수되지 않습니다. 그 값을 못 쓰게 하려면
          키를 재발급해 주세요 — 재발급하면 이전 값이 곧바로 무효가 됩니다.
        </li>
        <li>
          게이트웨이에는 폴링 주기 안에 반영됩니다. 그때까지 진행 중인 요청은
          그대로 처리될 수 있습니다.
        </li>
      </ul>
    ),
  },
}

/**
 * 리소스 하나에 누가 접근할 수 있는지를 정하는 화면.
 *
 * 접근은 이 목록으로만 판정한다 — 워크스페이스에 속해 있다는 것만으로는 그
 * 리소스에 닿지 않는다. 그래서 화면의 중심은 "누구에게 무엇까지"이고, 회수할
 * 때는 회수가 닿지 않는 것을 같이 말해 준다.
 */
export function ResourceAccessSection({
  type,
  resourceId,
}: {
  type: ResourceType
  resourceId: string
}) {
  const kind = ACCESS_KINDS[type]
  const queryClient = useQueryClient()
  const access = useQuery({
    queryKey: [kind.queryKey, resourceId, 'access'],
    queryFn: () => kind.fetchGrants(resourceId),
  })
  // 소유 워크스페이스는 응답이 알려 준다 — 리소스 상세를 못 여는 사람도 이 화면은
  // 열기 때문에 워크스페이스 id 를 상세에서 가져올 수 없다.
  const workspaceId = access.data?.resource.workspaceId
  const workspace = useQuery({
    queryKey: ['workspaces', workspaceId],
    queryFn: () => fetchWorkspace(workspaceId!),
    enabled: workspaceId != null,
  })
  const [error, setError] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<VmAccessGrant | null>(null)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: [kind.queryKey, resourceId, 'access'] })
    void queryClient.invalidateQueries({ queryKey: [kind.queryKey, resourceId] })
  }

  const changeRole = useMutation({
    mutationFn: ({ grantId, role }: { grantId: string; role: ResourceRole }) =>
      kind.updateGrant(resourceId, grantId, role),
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err) => setError(toApiError(err, '등급을 변경하지 못했습니다.').message),
  })

  const revoke = useMutation({
    mutationFn: (grantId: string) => kind.removeGrant(resourceId, grantId),
    onSuccess: () => {
      setError(null)
      setRevokeTarget(null)
      invalidate()
    },
    onError: (err) => {
      setRevokeTarget(null)
      setError(toApiError(err, '접근 권한을 회수하지 못했습니다.').message)
    },
  })

  const rows = access.data?.grants ?? []
  const listed = new Set(rows.map((grant) => grant.user?.userId).filter(Boolean))
  const candidates = (workspace.data?.members ?? []).filter(
    (member) => !listed.has(member.userId),
  )
  const hasWorkspaceWide = rows.some((grant) => grant.granteeType === 'WORKSPACE')

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>접근 권한 ({rows.length}건)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-neutral-600">{kind.listIntro}</p>
          {error && <Alert variant="danger">{error}</Alert>}
          {access.isPending ? (
            <Spinner />
          ) : access.isError ? (
            <Alert variant="warning" title="접근 권한을 불러오지 못했습니다">
              <Button size="sm" variant="secondary" onClick={() => void access.refetch()}>
                다시 시도
              </Button>
            </Alert>
          ) : (
            <ul className="divide-y divide-neutral-200">
              {rows.map((grant) => (
                <li key={grant.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {grant.granteeType === 'WORKSPACE' ? '워크스페이스 전체' : grant.user?.name}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {grant.granteeType === 'WORKSPACE'
                        ? kind.workspaceWideWho
                        : grant.user?.email}
                      {' · '}
                      {formatDateTime(grant.createdAt)} 부여
                    </p>
                  </div>
                  <ResourceRoleBadge role={grant.role} />
                  <Select
                    className="w-32"
                    value={grant.role}
                    disabled={changeRole.isPending}
                    onChange={(event) =>
                      changeRole.mutate({
                        grantId: grant.id,
                        role: event.target.value as ResourceRole,
                      })
                    }
                  >
                    {(grant.granteeType === 'WORKSPACE' ? WORKSPACE_WIDE_ASSIGNABLE : ASSIGNABLE).map(
                      (role) => (
                        <option key={role} value={role}>
                          {RESOURCE_ROLE_LABELS[role]}
                        </option>
                      ),
                    )}
                  </Select>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setRevokeTarget(grant)}
                  >
                    회수
                  </Button>
                </li>
              ))}
              {rows.length === 0 && (
                <li className="py-6 text-sm text-neutral-500">{kind.emptyList}</li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddGrantForm
        kind={kind}
        resourceId={resourceId}
        candidates={candidates}
        hasWorkspaceWide={hasWorkspaceWide}
        onError={setError}
        onDone={invalidate}
      />

      {revokeTarget && (
        <RevokeModal
          kind={kind}
          grant={revokeTarget}
          pending={revoke.isPending}
          onCancel={() => setRevokeTarget(null)}
          onConfirm={() => revoke.mutate(revokeTarget.id)}
        />
      )}
    </div>
  )
}

function AddGrantForm({
  kind,
  resourceId,
  candidates,
  hasWorkspaceWide,
  onError,
  onDone,
}: {
  kind: AccessKind
  resourceId: string
  candidates: { userId: string; name: string; email: string }[]
  hasWorkspaceWide: boolean
  onError: (message: string | null) => void
  onDone: () => void
}) {
  const [target, setTarget] = useState<string>('')
  const [role, setRole] = useState<ResourceRole>('MEMBER')
  const workspaceWide = target === 'WORKSPACE'
  const assignable = workspaceWide ? WORKSPACE_WIDE_ASSIGNABLE : ASSIGNABLE

  const add = useMutation({
    mutationFn: () =>
      kind.addGrant(resourceId, {
        granteeType: workspaceWide ? 'WORKSPACE' : 'USER',
        userId: workspaceWide ? undefined : target,
        role,
      }),
    onSuccess: () => {
      onError(null)
      setTarget('')
      setRole('MEMBER')
      onDone()
    },
    onError: (err) => onError(toApiError(err, '접근 권한을 부여하지 못했습니다.').message),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!target) return
    add.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>접근 권한 부여</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <FormField label="대상" className="w-full sm:w-64">
            <Select value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="">선택</option>
              {!hasWorkspaceWide && <option value="WORKSPACE">워크스페이스 전체</option>}
              {candidates.map((member) => (
                <option key={member.userId} value={String(member.userId)}>
                  {member.name} ({member.email})
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="등급" className="w-full sm:w-44" description={kind.roleHints[role]}>
            <Select
              value={role}
              onChange={(event) => setRole(event.target.value as ResourceRole)}
            >
              {assignable.map((value) => (
                <option key={value} value={value}>
                  {RESOURCE_ROLE_LABELS[value]}
                </option>
              ))}
            </Select>
          </FormField>
          <Button type="submit" loading={add.isPending} disabled={!target}>
            부여
          </Button>
        </form>
        <p className="mt-3 text-xs text-neutral-500">{kind.grantEligibility}</p>
      </CardContent>
    </Card>
  )
}

/** 회수가 되돌리지 못하는 것을 여기서 한 번은 말해 준다. */
function RevokeModal({
  kind,
  grant,
  pending,
  onCancel,
  onConfirm,
}: {
  kind: AccessKind
  grant: VmAccessGrant
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const who = grant.granteeType === 'WORKSPACE' ? '워크스페이스 전체' : (grant.user?.name ?? '이 사용자')
  return (
    <Modal
      open
      onClose={onCancel}
      title="접근 권한 회수"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            취소
          </Button>
          <Button variant="danger" loading={pending} onClick={onConfirm}>
            회수
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-neutral-600">
        <p>{kind.revokeSentence(who)}</p>
        <Alert variant="warning" title="회수가 되돌리지 못하는 것">
          {kind.revokeCaveats}
        </Alert>
      </div>
    </Modal>
  )
}
