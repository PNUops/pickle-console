import { useAuth, type UserRole } from './auth-context'
import { authorityKey, canEnterAdministration, hasAnyWork, hasSameSourceWorks, hasWork, rowAllows, workSources, type WorkTarget } from './institution-authority'

export function useInstitutionPermissions() {
  const { user } = useAuth()
  return {
    authority: user?.institutionAuthority ?? null,
    role: user?.role ?? 'USER',
    fingerprint: authorityKey(user),
    canEnterAdministration: canEnterAdministration(user),
    canWork: (id: string, target: WorkTarget = {}, sysRoles: readonly UserRole[] = []) => hasWork(user, id, target, sysRoles),
    canAnyWork: (ids: readonly string[], sysRoles: readonly UserRole[] = []) => hasAnyWork(user, ids, sysRoles),
    canSameSource: (ids: readonly string[], target: WorkTarget, sysRoles: readonly UserRole[] = []) => hasSameSourceWorks(user, ids, target, sysRoles),
    sources: (id: string) => workSources(user, id),
    rowAllows,
  }
}
