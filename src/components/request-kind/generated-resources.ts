import type { GeneratedRequestResource } from '../../api/request-review'

export function generatedResourcesMoving(resources: GeneratedRequestResource[] = []): boolean {
  return resources.some((resource) => resource.type === 'VM' && ['CREATING', 'DELETING', 'REBOOTING'].includes(resource.state)
    || resource.type === 'GPU' && ['QUEUED', 'RELEASING'].includes(resource.state))
}

