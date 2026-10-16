import type { WorkspaceMemberRole } from '../../api/queries'
import { WORKSPACE_ROLE_LABELS } from '../../lib/labels'
import { Button, Modal, Select } from '../ui'

export function WorkspaceMemberRoleSelect({ name, role, disabled, onChange }: {
  name: string
  role: WorkspaceMemberRole
  disabled?: boolean
  onChange: (role: WorkspaceMemberRole) => void
}) {
  return <Select aria-label={`${name} 역할 변경`} value={role} disabled={disabled} onChange={(event) => onChange(event.target.value as WorkspaceMemberRole)}>
    {(['OWNER', 'MEMBER'] as const).map((value) => <option key={value} value={value}>{WORKSPACE_ROLE_LABELS[value]}</option>)}
  </Select>
}

export function RemoveWorkspaceMemberModal({ target, pending, onCancel, onConfirm }: {
  target: { userId: string; name: string; email: string } | null
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return <Modal open={target !== null} onClose={onCancel} title="구성원 제거" footer={<>
    <Button variant="secondary" onClick={onCancel} disabled={pending}>취소</Button>
    <Button variant="danger" loading={pending} onClick={onConfirm}>제거</Button>
  </>}>
    <p className="text-sm text-neutral-600">{target?.name}({target?.email}) 님을 이 워크스페이스에서 제거합니다.</p>
  </Modal>
}
