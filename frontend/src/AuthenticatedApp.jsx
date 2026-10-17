import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import ProtectedRoute from './components/ProtectedRoute'
import PublicOnlyRoute from './components/PublicOnlyRoute'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import AuthLoading from './components/AuthLoading'

// The viewer carries the page-flip engine, so it loads only when a flipbook is opened.
const FlipbookViewerPage = lazy(() => import('./pages/FlipbookViewerPage'))

// Every route that knows about the signed-in user. Loaded separately from the public viewer,
// so visitors of /view/:slug never load Firebase or start an auth session.
export default function AuthenticatedApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />

        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route
            path="/flipbooks/:id"
            element={
              <Suspense fallback={<AuthLoading />}>
                <FlipbookViewerPage />
              </Suspense>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
