import { Link, useSearchParams } from 'react-router'
import { workspaceSourceReturn } from '../../lib/workspace-source-return'

/** Bind a resource's return link to its server-provided workspace identity. */
export function WorkspaceSourceReturnLink({ workspaceId, admin = false }: { workspaceId: string | null | undefined; admin?: boolean }) {
  const [params] = useSearchParams()
  const path = workspaceSourceReturn(params.get('returnTo'), workspaceId, admin)
  return path ? <Link to={path} className="mb-2 block text-sm text-primary-700 hover:underline">← 워크스페이스</Link> : null
}
