import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router'
import { fetchWorkspaces } from '../api/queries'
import { WORKSPACE_KIND_LABELS } from '../lib/labels'
import { consolePathInScope } from '../lib/paths'
import { useScope } from '../lib/use-scope'

/**
 * Picks the workspace every list on the screen is read through.
 *
 * "전체" is the default and stays available: most people have one workspace and
 * should never think about this. It earns its place for the other case — a
 * class or club whose members each see dozens of rows they cannot open.
 *
 * Switching rewrites the current path rather than navigating home, so the
 * person stays on the screen they were reading.
 */
export function WorkspaceScopeSelector() {
  const scope = useScope()
  const navigate = useNavigate()
  const location = useLocation()
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: fetchWorkspaces })

  const switchTo = (next: string) => {
    navigate(consolePathInScope(next === 'all' ? null : Number(next), location.pathname))
  }

  // A scope with no option yet — the list is still loading — must not read as
  // "전체": the screen behind it is filtered, and the control would be lying.
  const listed = workspaces.data?.some((workspace) => workspace.id === scope) ?? false

  return (
    <label className="block">
      <span className="sr-only">워크스페이스 선택</span>
      <select
        value={scope == null ? 'all' : listed ? String(scope) : 'unlisted'}
        onChange={(event) => switchTo(event.target.value)}
        className="w-full cursor-pointer rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm font-medium text-neutral-800 focus-visible:outline-2 focus-visible:outline-primary-600"
      >
        <option value="all">전체 워크스페이스</option>
        {scope != null && !listed && (
          <option value="unlisted" disabled>
            워크스페이스 확인 중…
          </option>
        )}
        {workspaces.data?.map((workspace) => (
          <option key={workspace.id} value={String(workspace.id)}>
            {workspace.name} ({WORKSPACE_KIND_LABELS[workspace.kind]})
          </option>
        ))}
      </select>
    </label>
  )
}
