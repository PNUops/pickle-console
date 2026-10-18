import type { UserRole } from '../auth/auth-context'
import { SYS_READERS } from '../auth/institution-authority'
import { useInstitutionPermissions } from '../auth/use-institution-permissions'

export const DOMAIN_READ_COMMANDS = ['domain.metadata.read', 'domain.metadata.support.read', 'domain.observe', 'domain.renewal', 'domain.release', 'domain.acl.support.read', 'domain.acl.support.manage'] as const
export const PUBLICATION_READ_COMMANDS = ['vm.publication.read', 'vm.metadata.support.read', 'vm.publication.operate', 'vm.custom-domain.verify'] as const
export const GPU_READ_COMMANDS = ['gpu.metadata.read', 'gpu.metadata.support.read', 'gpu.observe', 'gpu.observe.support.read', 'gpu.period', 'gpu.recall', 'gpu.acl.support.read', 'gpu.acl.support.manage'] as const
export const DEADLINE_READS = ['vm.metadata.read', 'vm.metadata.support.read', 'llm.metadata.read', 'llm.metadata.support.read', 'domain.metadata.read', 'domain.metadata.support.read', 'gpu.metadata.read', 'gpu.metadata.support.read'] as const
export const CERTIFICATE_READS = ['shared-certificate.read', 'vm.publication.read'] as const
export const ROOT_READS = ['root-domain.catalogue.read', 'institution.root-policy.read', 'institution.root-policy.write'] as const

export function useInstitutionResourcePermissions() {
  const permissions = useInstitutionPermissions()
  return {
    ...permissions,
    forRow: (row: { orgId?: string | null; workspaceId?: string | null; allowedWorkIds?: readonly string[] | null }, work: string, sysRoles: readonly UserRole[] = SYS_READERS) =>
      permissions.rowAllows(row, work) && permissions.canWork(work, row, sysRoles),
  }
}
