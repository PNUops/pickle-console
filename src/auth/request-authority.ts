import type { ResourceType } from '../api/queries'
import { hasAnyWork, hasWork, SYS_ADMIN, workSources, type AuthorityActor } from './institution-authority'

export function resourceWorkPrefix(type: ResourceType): string { return type === 'LLM_API_KEY' ? 'llm' : type.toLowerCase() }

export function canIssueRoster(actor: AuthorityActor | null | undefined, type: ResourceType, orgId?: string | null, workspaceId?: string | null): boolean {
  if (type !== 'VM' && type !== 'LLM_API_KEY' || !orgId) return false
  const work = `${resourceWorkPrefix(type)}.roster.issue`
  if (workspaceId) return hasWork(actor, work, { orgId, workspaceId }, SYS_ADMIN)
  if (actor?.role === 'SYS_ADMIN') return true
  return workSources(actor, work).some((source) => source.institutionId === orgId)
}

export function hasRosterWork(actor: AuthorityActor | null | undefined, type?: ResourceType): boolean {
  const work = type ? [`${resourceWorkPrefix(type)}.roster.issue`] : ['vm.roster.issue', 'llm.roster.issue']
  return hasAnyWork(actor, work, SYS_ADMIN)
}
