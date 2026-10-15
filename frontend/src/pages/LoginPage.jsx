import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useAuthAction } from '../hooks/useAuthAction'
import AuthLayout from '../components/AuthLayout'
import GoogleSignInButton from '../components/GoogleSignInButton'

export default function LoginPage() {
  const { signInWithEmail, signInWithGoogle } = useAuth()
  const { pendingAction, busy, runAuthAction } = useAuthAction()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    runAuthAction('email', () => signInWithEmail(email.trim(), password))
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back to CraftFlip."
      footer={
        <>
          New to CraftFlip?{' '}
          <Link to="/register" state={location.state} className="link link-primary">
            Create an account
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
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {pendingAction === 'email' && <span className="loading loading-spinner loading-sm"></span>}
          Sign in
        </button>
      </form>
    </AuthLayout>
  )
}
