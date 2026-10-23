import { useQuery } from '@tanstack/react-query'
import { fetchOpenRouterCatalogue } from '../api/queries'
import { requestReaderKey } from '../api/request-review'
import { useAuth } from '../auth/auth-context'
import { hasWork, SYS_READERS } from '../auth/institution-authority'

export function useModelCatalogue() {
  const { user } = useAuth()
  const canRead = hasWork(user, 'llm.model-catalogue.read', {}, SYS_READERS)
  const query = useQuery({
    queryKey: ['admin', 'model-catalogue', requestReaderKey(user)],
    queryFn: fetchOpenRouterCatalogue,
    enabled: canRead,
    retry: false,
    staleTime: 5 * 60_000,
  })
  return { canRead, query }
}

export type ModelCatalogueState = ReturnType<typeof useModelCatalogue>
