import { useContext } from 'react'
import { AdminScopeContext, type AdminScopeValue } from './admin-scope-context'

export function useAdminScope(): AdminScopeValue {
  const context = useContext(AdminScopeContext)
  if (!context) throw new Error('useAdminScope must be used within <AdminScopeProvider>')
  return context
}
