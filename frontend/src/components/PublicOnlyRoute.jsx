import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import AuthLoading from './AuthLoading'

// For login and registration pages: signed-in users go back to the page they asked for,
// or to the dashboard.
export default function PublicOnlyRoute() {
  const { user, initializing, registering } = useAuth()
  const location = useLocation()

  if (initializing) return <AuthLoading />
  if (user && !registering) return <Navigate to={location.state?.from ?? '/dashboard'} replace />

  return <Outlet />
}
