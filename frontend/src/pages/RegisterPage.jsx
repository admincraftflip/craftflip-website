import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { useAuthAction } from '../hooks/useAuthAction'
import AuthLayout from '../components/AuthLayout'
import GoogleSignInButton from '../components/GoogleSignInButton'

const MIN_PASSWORD_LENGTH = 6

export default function RegisterPage() {
  const { registerWithEmail, signInWithGoogle } = useAuth()
  const { pendingAction, busy, runAuthAction } = useAuthAction()
  const location = useLocation()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    runAuthAction('email', () => registerWithEmail(displayName.trim(), email.trim(), password))
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Turn your PDFs into flipbooks worth sharing."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" state={location.state} className="link link-primary">
            Sign in
          </Link>
        </>
      }
    >
      <GoogleSignInButton
        onClick={() => runAuthAction('google', signInWithGoogle)}
        disabled={busy}
        loading={pendingAction === 'google'}
      />

      <div className="divider my-0 text-xs text-base-content/60">or</div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <label className="form-control">
          <span className="label-text mb-1">Name</span>
          <input
            type="text"
            className="input input-bordered"
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <label className="form-control">
          <span className="label-text mb-1">Email</span>
          <input
            type="email"
            className="input input-bordered"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="form-control">
          <span className="label-text mb-1">Password</span>
          <input
            type="password"
            className="input input-bordered"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <span className="label-text-alt text-base-content/60 mt-1">At least {MIN_PASSWORD_LENGTH} characters.</span>
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {pendingAction === 'email' && <span className="loading loading-spinner loading-sm"></span>}
          Create account
        </button>
      </form>
    </AuthLayout>
  )
}
