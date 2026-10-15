import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { LogOut } from 'lucide-react'
import api from '../utils/api'
import { useAuth } from '../hooks/useAuth'

// Milestone 2 placeholder: confirms the signed-in user's backend profile. The full dashboard is Milestone 7.
export default function DashboardPage() {
  const { signOut } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      try {
        const response = await api.get('/api/auth/me')
        if (!cancelled) setProfile(response.data.data.user)
      } catch (error) {
        if (cancelled) return
        setLoadFailed(true)
        toast.error(error.response?.data?.message ?? 'Something went wrong. Please try again.')
      }
    }

    loadProfile()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSignOut() {
    try {
      await signOut()
    } catch {
      toast.error('Could not sign out. Please try again.')
    }
  }

  return (
    <main className="min-h-screen bg-base-200 px-4 py-12">
      <div className="mx-auto w-full max-w-lg">
        <header className="flex items-center justify-between mb-8">
          <span className="text-lg font-semibold tracking-tight">CraftFlip</span>
          <button type="button" className="btn btn-ghost btn-sm gap-2" onClick={handleSignOut}>
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </header>

        <section className="card bg-base-100 shadow-sm">
          <div className="card-body">
            <h1 className="text-2xl font-semibold">Your account</h1>
            {!profile && !loadFailed && <span className="loading loading-dots loading-md mt-2"></span>}
            {loadFailed && <p className="text-base-content/70">We couldn't load your account. Please try again.</p>}
            {profile && (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-base-content/60">Name</dt>
                <dd>{profile.displayName ?? '—'}</dd>
                <dt className="text-base-content/60">Email</dt>
                <dd className="break-all">{profile.email ?? '—'}</dd>
                <dt className="text-base-content/60">Plan</dt>
                <dd className="capitalize">{profile.plan}</dd>
                <dt className="text-base-content/60">Member since</dt>
                <dd>{new Date(profile.createdAt).toLocaleDateString()}</dd>
              </dl>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
