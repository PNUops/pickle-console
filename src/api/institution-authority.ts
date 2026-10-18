import { fetchAuthedBytes } from './client'
import type { InstitutionAuthority } from '../auth/institution-authority'

/** Missing or malformed authority never falls back to an institution display role. */
export async function fetchInstitutionAuthority(signal: AbortSignal): Promise<InstitutionAuthority | null> {
  try {
    const response = await fetchAuthedBytes('/api/v1/me/institution-authority', signal)
    if (!response.ok) return null
    const value = await response.json() as InstitutionAuthority
    if (!value || !['VALID_EMPTY', 'VALID_SOURCES', 'INVALID'].includes(value.state)
      || !['USER', 'ORG_VIEWER', 'ORG_MANAGER', 'ORG_ADMIN', 'SYS_VIEWER', 'SYS_MANAGER', 'SYS_ADMIN'].includes(value.accountRole)
      || typeof value.catalogueRevision !== 'string' || !Array.isArray(value.assignments) || !Array.isArray(value.catalogue)
      || value.state === 'VALID_SOURCES' && (typeof value.authorityFingerprint !== 'string' || !value.authorityFingerprint)) return null
    if (value.catalogue.some((work) => !work || typeof work.id !== 'string' || typeof work.name !== 'string'
      || typeof work.selectable !== 'boolean' || typeof work.includedInFull !== 'boolean'
      || typeof work.globalResourceReadInFull !== 'boolean'
      || work.group != null && !['VM', 'LLM', 'DOMAIN', 'GPU', 'WORKSPACE'].includes(work.group)
      || !['GLOBAL', 'INSTITUTION', 'RESOURCE', 'RESOURCE_SUPPORT', 'WORKSPACE_SUPPORT', 'QUALIFIED_WORKSPACE'].includes(work.boundary))) return null
    if (new Set(value.assignments.map((grant) => grant?.institutionId)).size !== value.assignments.length) return null
    if (value.assignments.some((grant) => !grant || typeof grant.institutionId !== 'string'
      || !grant.permission || !['FULL', 'SELECTED'].includes(grant.permission.mode)
      || !Array.isArray(grant.permission.work) || !grant.permission.scopes
      || !Number.isSafeInteger(grant.permission.revision) || grant.permission.revision < 1
      || grant.permission.mode === 'FULL' && (grant.permission.work.length > 0 || Object.keys(grant.permission.scopes).length > 0)
      || grant.permission.mode === 'SELECTED' && (grant.permission.work.length === 0
        || new Set(grant.permission.work).size !== grant.permission.work.length
        || grant.permission.work.some((id) => !value.catalogue.some((work) => work.id === id && work.selectable))
        || value.catalogue.some((work) => grant.permission.work.includes(work.id) && work.group != null && grant.permission.scopes[work.group] == null))
      || Object.keys(grant.permission.scopes).some((group) => !['VM', 'LLM', 'DOMAIN', 'GPU', 'WORKSPACE'].includes(group))
      || Object.values(grant.permission.scopes).some((scope) => !scope || !['ALL', 'LISTED'].includes(scope.mode)
        || !Array.isArray(scope.workspaceIds) || scope.workspaceIds.some((id) => typeof id !== 'string')))) return null
    return value
  } catch {
    return null
  }
}
