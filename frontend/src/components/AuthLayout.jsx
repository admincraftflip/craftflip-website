import { Link } from 'react-router-dom'

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-base-200 px-4 py-12">
      <div className="w-full max-w-sm">
        <Link to="/" className="block text-center text-lg font-semibold tracking-tight mb-8">
          CraftFlip
        </Link>
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body gap-5">
            <header>
              <h1 className="text-2xl font-semibold">{title}</h1>
              {subtitle && <p className="text-sm text-base-content/70 mt-1">{subtitle}</p>}
            </header>
            {children}
          </div>
        </div>
        {footer && <p className="text-center text-sm text-base-content/70 mt-6">{footer}</p>}
      </div>
    </main>
  )
}
