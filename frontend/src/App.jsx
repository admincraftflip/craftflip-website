import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import AuthLoading from './components/AuthLoading'

// Two separately loaded parts: the public viewer (no sign-in, no Firebase) and everything else.
const PublicViewerPage = lazy(() => import('./pages/PublicViewerPage'))
const AuthenticatedApp = lazy(() => import('./AuthenticatedApp'))

function PublicLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100" role="status">
      <span className="loading loading-dots loading-md text-stone-400" aria-label="Loading flipbook"></span>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/view/:slug"
          element={
            <Suspense fallback={<PublicLoading />}>
              <PublicViewerPage />
            </Suspense>
          }
        />
        <Route
          path="/embed/:slug"
          element={
            <Suspense fallback={<PublicLoading />}>
              <PublicViewerPage embed />
            </Suspense>
          }
        />
        <Route
          path="*"
          element={
            <Suspense fallback={<AuthLoading />}>
              <AuthenticatedApp />
            </Suspense>
          }
        />
      </Routes>
      <Toaster position="top-center" />
    </BrowserRouter>
  )
}

export default App
