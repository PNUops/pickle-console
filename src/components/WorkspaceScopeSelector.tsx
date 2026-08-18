import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router'
import { fetchWorkspaces } from '../api/queries'
import { PopoverPanel, usePopover } from './ui'
import { CreateWorkspaceModal } from './workspace/CreateWorkspaceModal'
import { cn } from '../lib/cn'
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
 *
 * It is a popover rather than a native select because making a workspace
 * belongs at the bottom of this list — you come here looking for one, find it
 * does not exist yet, and make it without leaving the screen. A native select
 * cannot hold a button.
 */
export function WorkspaceScopeSelector() {
  const scope = useScope()
  const navigate = useNavigate()
  const location = useLocation()
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: fetchWorkspaces })
  const { open, toggle, close, rootRef, triggerRef } = usePopover()
  const [createOpen, setCreateOpen] = useState(false)

  const switchTo = (next: string | null) => {
    close()
    navigate(consolePathInScope(next, location.pathname))
  }

  // A scope with no option yet — the list is still loading — must not read as
  // "전체": the screen behind it is filtered, and the control would be lying.
  const current = workspaces.data?.find((workspace) => workspace.id === scope)
  const label = scope == null ? '전체 워크스페이스' : (current?.name ?? '워크스페이스 확인 중…')

  const rowClass =
    'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50'

  const check = (selected: boolean) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('size-4 shrink-0 text-primary-600', !selected && 'invisible')}
    >
      <path d="m5 12 5 5L20 6" />
    </svg>
  )

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="워크스페이스 선택"
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm font-medium text-neutral-800 focus-visible:outline-2 focus-visible:outline-primary-600"
      >
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-4 shrink-0 text-neutral-400"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <PopoverPanel
        open={open}
        align="start"
        role="menu"
        aria-label="워크스페이스"
        className="w-full py-1"
      >
        <button type="button" role="menuitem" onClick={() => switchTo(null)} className={rowClass}>
          {check(scope == null)}
          전체 워크스페이스
        </button>
        {workspaces.data?.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            role="menuitem"
            onClick={() => switchTo(String(workspace.id))}
            className={rowClass}
          >
            {check(workspace.id === scope)}
            <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
            <span className="shrink-0 text-xs text-neutral-400">
              {WORKSPACE_KIND_LABELS[workspace.kind]}
            </span>
          </button>
        ))}
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            close()
            setCreateOpen(true)
          }}
          className={cn(rowClass, 'mt-1 border-t border-neutral-100 pt-2 font-medium text-primary-700')}
        >
          <span aria-hidden="true" className="w-4 shrink-0 text-center">
            +
          </span>
          새 워크스페이스 만들기
        </button>
      </PopoverPanel>

      <CreateWorkspaceModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
