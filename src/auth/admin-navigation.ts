import { bulkKindsFor, type BulkFamily } from '../lib/bulk-change'
import { canEnterAdministration, hasAnyWork, SYS_READERS, type AuthorityActor } from './institution-authority'

export const REQUEST_READ_WORK = [...['vm', 'llm', 'domain', 'gpu'].flatMap((kind) => [`${kind}.request.read`, `${kind}.request.support.read`, `${kind}.request.decide`]), 'vm.recipient.retry', 'llm.recipient.retry']
export const ROSTER_WORK = ['vm.roster.issue', 'llm.roster.issue']
export const SUMMARY_WORK = ['vm.metadata.read', 'vm.observe', 'vm.publication.read', ...['vm', 'llm', 'domain', 'gpu'].map((kind) => `${kind}.request.read`)]

function resourceWork(actor: AuthorityActor, kind: 'VM' | 'LLM' | 'DOMAIN' | 'GPU'): string[] {
  return actor.institutionAuthority?.catalogue.filter((work) => work.group === kind && !work.id.includes('.request.') && !work.id.includes('.roster.') && !work.id.includes('.recipient.')).map((work) => work.id) ?? []
}

/** Route and navigation admission share the same finite operation mapping. */
export function canVisitAdministration(actor: AuthorityActor | null | undefined, path: string): boolean {
  if (!canEnterAdministration(actor) || !actor) return false
  if (actor.role.startsWith('SYS_')) return true
  const pathname = path.split('?')[0]
  const any = (ids: readonly string[]) => hasAnyWork(actor, ids)
  if (pathname === '/admin' || /^\/admin\/(docs|account|notifications)(\/|$)/.test(pathname)) return true
  if (/^\/admin\/requests\/new/.test(pathname)) return any(ROSTER_WORK)
  if (/^\/admin\/requests(\/|$)/.test(pathname)) return any(REQUEST_READ_WORK)
  if (/^\/admin\/vms(\/|$)/.test(pathname)) return any(resourceWork(actor, 'VM'))
  if (/^\/admin\/llm\/keys(\/|$)/.test(pathname)) return any(resourceWork(actor, 'LLM'))
  if (/^\/admin\/llm\/usage/.test(pathname)) return any(['llm.observe'])
  if (/^\/admin\/llm\/models/.test(pathname)) return any(['llm.model-catalogue.read'])
  if (/^\/admin\/llm\/accounts/.test(pathname)) return any(['institution.account.read', 'institution.account.finance.read', 'institution.account.manage', 'institution.account.credential.manage'])
  if (/^\/admin\/llm\/status/.test(pathname)) return any(['llm.observe'])
  if (/^\/admin\/domains/.test(pathname)) return any([...resourceWork(actor, 'DOMAIN'), 'vm.publication.read', 'vm.metadata.support.read', 'vm.publication.operate', 'vm.custom-domain.verify', 'shared-certificate.read', 'root-domain.catalogue.read', 'institution.root-policy.read', 'institution.root-policy.write'])
  if (/^\/admin\/gpus/.test(pathname)) return any(resourceWork(actor, 'GPU'))
  if (/^\/admin\/terminal-sessions/.test(pathname)) return any(['vm.terminal-session.read'])
  if (/^\/admin\/workspaces/.test(pathname)) return any(['workspace.support.read', 'workspace.info.update', 'workspace.members.manage', 'workspace.invitations.manage', 'workspace.owners.manage', 'workspace.terminate', 'workspace.recipient.cancel'])
  if (/^\/admin\/users/.test(pathname)) return any(['student.lookup', 'student.support.read', 'student.profile.correct'])
    || /^\/admin\/users\/[^/]+$/.test(pathname) && any(['vm', 'llm', 'domain', 'gpu'].flatMap((kind) => [`${kind}.acl.support.read`, `${kind}.acl.support.manage`]))
  if (/^\/admin\/resource-access/.test(pathname)) return any(['vm', 'llm', 'domain', 'gpu'].flatMap((kind) => [`${kind}.acl.support.read`, `${kind}.acl.support.manage`]))
  if (/^\/admin\/org-operations/.test(pathname)) return any(['institution.staff.read', 'institution.request-mail.read', 'institution.request-mail.configure', 'institution.delegate'])
  if (/^\/admin\/audit/.test(pathname)) return any(['institution.audit.read'])
  if (/^\/admin\/announcements/.test(pathname)) return any(['institution.announcement.read', 'institution.announcement.send', 'workspace.announcement.send'])
  if (/^\/admin\/notices\/(new|[^/]+\/edit)$/.test(pathname)) return any(['notice.manage'])
  if (/^\/admin\/notices/.test(pathname)) return any(['notice.read', 'notice.manage'])
  if (/^\/admin\/expiry/.test(pathname)) return any(['vm.metadata.read', 'vm.metadata.support.read', 'llm.metadata.read', 'llm.metadata.support.read', 'domain.metadata.read', 'domain.metadata.support.read', 'gpu.metadata.read', 'gpu.metadata.support.read'])
  if (/^\/admin\/bulk\/(vms|llm-keys|domains)/.test(pathname)) {
    const family = pathname.split('/')[3] as BulkFamily
    return bulkKindsFor(family, actor).length > 0
  }
  if (/^\/admin\/bulk\/operations\//.test(pathname)) return (['vms', 'llm-keys', 'domains'] as const).some((family) => bulkKindsFor(family, actor).length > 0)
  return false
}

export function canReadSummary(actor: AuthorityActor | null | undefined): boolean {
  return hasAnyWork(actor, SUMMARY_WORK, SYS_READERS)
}
