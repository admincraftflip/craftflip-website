import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

// Placeholder until the landing page is designed.
export default function HomePage() {
  const { user, initializing } = useAuth()

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-base-200 px-4 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">CraftFlip</h1>
      <p className="text-base-content/70 max-w-sm">Turn your PDFs into beautiful, shareable flipbooks.</p>
      {!initializing && (
        <div className="flex gap-3">
          {user ? (
            <Link to="/dashboard" className="btn btn-primary">Go to dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-primary">Sign in</Link>
              <Link to="/register" className="btn btn-outline">Create account</Link>
            </>
          )}
        </div>
      )}
    </main>
  )
}
