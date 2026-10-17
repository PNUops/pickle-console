import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { components } from '../../api/schema'
import { fetchAdminWorkspaceInvitations, type WorkspaceMemberRole } from '../../api/queries'
import { cancelAdminWorkspaceInvitation, deleteAdminWorkspace, inviteAdminWorkspaceMembers, previewAdminWorkspaceInvitations, previewAdminWorkspaceMember, removeAdminWorkspaceMember, updateAdminWorkspace, updateAdminWorkspaceMember } from '../../api/workspace-support'
import { toApiError } from '../../api/problem'
import { useActiveResult } from '../../lib/use-active-result'
import { WORKSPACE_ROLE_LABELS } from '../../lib/labels'
import { Alert, Button } from '../ui'
import { useAccessIncreaseReview } from '../../lib/use-access-increase-review'
import { EditWorkspaceModal, OwnershipTransferModal } from './WorkspaceModals'
import { RemoveWorkspaceMemberModal, WorkspaceMemberRoleSelect } from './WorkspaceMemberControls'
import { InviteMembersForm, PendingInvitationsSection } from './WorkspaceInvitations'
import { WorkspaceTerminationImpactButton } from './WorkspaceTerminationImpact'
import { WorkspaceTerminationDialog } from './WorkspaceTerminationDialog'

type Workspace = components['schemas']['AdminWorkspaceDetailResponse']
type Member = components['schemas']['AdminWorkspaceMemberResponse']

function useRefreshWorkspace(workspaceId: string) {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: ['admin', 'workspaces'] })
    void client.invalidateQueries({ queryKey: ['admin-workspaces', workspaceId] })
    void client.invalidateQueries({ queryKey: ['admin-workspace-invitations', workspaceId] })
    void client.invalidateQueries({ queryKey: ['workspaces'] })
    void client.invalidateQueries({ queryKey: ['resources'] })
    void client.invalidateQueries({ queryKey: ['admin-resource-access'] })
  }
}

export function AdminWorkspaceOverviewControls({ workspace, onDeleted }: { workspace: Workspace; onDeleted: () => void }) {
  const active = useActiveResult()
  const refresh = useRefreshWorkspace(workspace.id)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const remove = useMutation({ mutationFn: (fingerprint: string) => deleteAdminWorkspace(workspace.id, { fingerprint, confirmed: true }), onSuccess: () => {
    refresh()
    if (!active.current) return
    setDeleting(false)
    onDeleted()
  } })
  return <div className="space-y-3">
    {error && <Alert variant="danger">{error}</Alert>}
    <div className="flex flex-wrap gap-2">
      {workspace.canUpdateInfo && <Button variant="secondary" onClick={() => setEditing(true)}>정보 수정</Button>}
      {workspace.canUpdateInfo && <WorkspaceTerminationImpactButton workspaceId={workspace.id} admin />}
      {workspace.canDelete && <Button variant="danger" onClick={() => { setError(null); setDeleting(true) }}>워크스페이스 삭제</Button>}
    </div>
    {workspace.deleteBlockedReason === 'PERSONAL' && <p className="text-sm text-foreground-muted">개인 워크스페이스의 구성원과 유형은 변경할 수 없으며 계정 탈퇴 시 함께 정리됩니다.</p>}
    {workspace.deleteBlockedReason === 'REMAINING_RESOURCES' && <p className="text-sm text-foreground-muted">남은 리소스를 먼저 정리해야 워크스페이스를 삭제할 수 있습니다.</p>}
    {editing && workspace.canUpdateInfo && <EditWorkspaceModal workspace={workspace} onClose={() => setEditing(false)} saveInfo={async (body) => { const result = await updateAdminWorkspace(workspace.id, body); refresh(); return result }} />}
    {deleting && workspace.canDelete && <WorkspaceTerminationDialog workspaceId={workspace.id} admin expectedName={workspace.name} onClose={() => setDeleting(false)} onConfirm={(fingerprint) => remove.mutateAsync(fingerprint)} />}

  </div>
}

export function AdminWorkspaceMemberActions({ workspace, member }: { workspace: Workspace; member: Member }) {
  const active = useActiveResult()
  const refresh = useRefreshWorkspace(workspace.id)
  const review = useAccessIncreaseReview()
  const [ownerConfirm, setOwnerConfirm] = useState(false)
  const [removeConfirm, setRemoveConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<string | null>(null)
  const named = { userId: member.userId, name: member.name, email: member.email, role: member.workspaceRole }
  const change = useMutation({ mutationFn: async (role: WorkspaceMemberRole) => {
    const impact = await previewAdminWorkspaceMember(workspace.id, member.userId, { role })
    if (!active.current) return null
    const confirmation = await review.confirm(impact, `${workspace.name} (${workspace.id}) · ${member.name} (${member.email}) · ${WORKSPACE_ROLE_LABELS[role]}`)
    if (confirmation === null || !active.current) return null
    return updateAdminWorkspaceMember(workspace.id, member.userId, { role, ...(confirmation ? { confirmation } : {}) })
  }, onSuccess: (result) => {
    if (!result) return
    refresh()
    if (!active.current) return
    setError(null)
    setReceipt(`${member.userId} · ${WORKSPACE_ROLE_LABELS[result.role]} 역할로 변경했습니다.`)
  }, onError: (err) => { if (active.current) setError(toApiError(err, '구성원 역할을 변경하지 못했습니다.').message) } })
  const remove = useMutation({ mutationFn: () => removeAdminWorkspaceMember(workspace.id, member.userId), onSuccess: () => {
    refresh()
    if (!active.current) return
    setRemoveConfirm(false)
    setError(null)
    setReceipt(`${member.userId} 구성원을 제거했습니다.`)
  }, onError: (err) => { if (active.current) { setRemoveConfirm(false); setError(toApiError(err, '구성원을 제거하지 못했습니다.').message) } } })
  return <div className="space-y-2">
    {error && <Alert variant="danger">{error}</Alert>}
    {receipt && <p role="status" className="break-all text-xs">이번 변경: {receipt}</p>}
    <div className="flex flex-wrap gap-2">
      {workspace.canManageOwners && member.canChangeRole && <WorkspaceMemberRoleSelect name={member.name} role={member.workspaceRole} disabled={change.isPending || remove.isPending} onChange={(role) => { setError(null); if (role === member.workspaceRole) return; if (role === 'OWNER') setOwnerConfirm(true); else change.mutate(role) }} />}
      {workspace.canManageMembers && member.canRemove && <Button variant="secondary" size="sm" disabled={change.isPending || remove.isPending} onClick={() => { setError(null); setRemoveConfirm(true) }}>제거</Button>}
    </div>
    <OwnershipTransferModal target={ownerConfirm ? named : null} pending={change.isPending} onCancel={() => setOwnerConfirm(false)} onConfirm={() => { setOwnerConfirm(false); change.mutate('OWNER') }} />
    <RemoveWorkspaceMemberModal target={removeConfirm ? member : null} pending={remove.isPending} onCancel={() => setRemoveConfirm(false)} onConfirm={() => remove.mutate()} />
    {review.modal}
  </div>
}

export function AdminWorkspaceInviteControls({ workspace }: { workspace: Workspace }) {
  const active = useActiveResult()
  const refresh = useRefreshWorkspace(workspace.id)
  const review = useAccessIncreaseReview()
  return <>
    {workspace.canInviteMembers && <InviteMembersForm workspaceId={workspace.id} onInvited={refresh} showRosterPreview={false}
      beforeSend={async (entries) => { const impact = await previewAdminWorkspaceInvitations(workspace.id, entries); if (!active.current) return null; return review.confirm(impact, `${workspace.name} (${workspace.id}) · ${entries.map((entry) => entry.email ?? entry.studentNo).join(', ')}`) }}
      sendEntries={(entries, confirmation) => inviteAdminWorkspaceMembers(workspace.id, entries, confirmation)} />}
    {review.modal}
  </>
}

export function AdminWorkspacePendingInvitations({ workspace }: { workspace: Workspace }) {
  const refresh = useRefreshWorkspace(workspace.id)
  return <PendingInvitationsSection workspaceId={workspace.id} support canManage={workspace.canInviteMembers}
    onChanged={refresh} loadInvitations={() => fetchAdminWorkspaceInvitations(workspace.id)}
    cancelInvitation={(invitationId, fingerprint) => cancelAdminWorkspaceInvitation(workspace.id, invitationId, { fingerprint, confirmed: true })} />
}
