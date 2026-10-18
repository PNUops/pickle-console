import { fetchAdminRoutes } from './queries'

/** Route collection institution filters describe the linked VM, not the domain's actual authority target. */
export async function fetchInstitutionDomainRoute(domainId: string) {
  let page = 0
  while (true) {
    const result = await fetchAdminRoutes({ page, size: 100 })
    const route = result.content.find((row) => row.domainId === domainId)
    if (route) return route
    if (page + 1 >= result.totalPages) return null
    page += 1
  }
}
