import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router'
import { fetchWorkspaces } from '../api/queries'
import { WORKSPACE_KIND_LABELS } from '../lib/labels'
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
    const rest = currentSection(location.pathname)
    navigate(next === 'all' ? `/console${rest}` : `/console/${next}${rest}`)
  }

  return (
    <label className="block">
      <span className="sr-only">워크스페이스 선택</span>
      <select
        value={scope == null ? 'all' : String(scope)}
        onChange={(event) => switchTo(event.target.value)}
        className="w-full cursor-pointer rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm font-medium text-neutral-800 focus-visible:outline-2 focus-visible:outline-primary-600"
      >
        <option value="all">전체 워크스페이스</option>
        {workspaces.data?.map((workspace) => (
          <option key={workspace.id} value={String(workspace.id)}>
            {workspace.name} ({WORKSPACE_KIND_LABELS[workspace.kind]})
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * The part of the path that survives a scope switch: the list you are looking
 * at, without the scope segment. Anything that is not a scoped list (a VM's
 * detail, the account screen) drops back to that scope's dashboard, since the
 * page you were on belongs to one workspace already.
 */
function currentSection(pathname: string): string {
  const rest = pathname.replace(/^\/console\/?/, '')
  const segments = rest.split('/').filter(Boolean)
  const withoutScope = /^\d+$/.test(segments[0] ?? '') ? segments.slice(1) : segments
  const section = withoutScope.join('/')
  const scopedSections = ['resources', 'vms', 'requests', 'requests/new']
  return scopedSections.includes(section) ? `/${section}` : ''
}
