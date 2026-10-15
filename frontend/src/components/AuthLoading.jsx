export default function AuthLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-base-200" role="status">
      <span className="text-xl font-semibold tracking-tight">CraftFlip</span>
      <span className="loading loading-dots loading-md text-base-content/60" aria-hidden="true"></span>
      <span className="sr-only">Restoring your session…</span>
    </div>
  )
}
