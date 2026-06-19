import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import type { Role } from '../lib/erpApi'

export function Protected({
  roles,
  children,
}: {
  roles?: Role[]
  children: React.ReactNode
}) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/app/inspection" replace />
  return <>{children}</>
}
