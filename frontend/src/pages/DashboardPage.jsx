import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { LogOut } from 'lucide-react'
import api from '../utils/api'
import { getApiErrorMessage } from '../utils/apiErrors'
import { applyDeletion, requestDeletion } from '../utils/flipbookDeletion'
import { copyLink, publicFlipbookUrl } from '../utils/publication'
import { startConversionPolling } from '../utils/conversionPolling'
import { isMissing, saveFlipbookDetails } from '../utils/flipbookDetails'
import EditFlipbookDialog from '../components/EditFlipbookDialog'
import { useAuth } from '../hooks/useAuth'
import PdfUploadCard from '../components/PdfUploadCard'
import FlipbookList from '../components/FlipbookList'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog'
import AnalyticsSection from '../components/analytics/AnalyticsSection'
import { rememberOwnedFlipbooks } from '../utils/viewTracking'

// Each check takes about half a second (auth and a database read), so one check starts about every
// 1.5 seconds: Ready shows within about a second of the server finishing, on average.
const CONVERSION_POLL_INTERVAL_MS = 1000

// Placeholder dashboard: account details, PDF upload (Milestone 3), page conversion (Milestone 4),
// publishing (Milestone 6), deletion and editing details (Milestone 8).
function toggled(set, value, present) {
  const next = new Set(set)
  if (present) next.add(value)
  else next.delete(value)
  return next
}

export default function DashboardPage() {
  const { signOut } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [flipbooks, setFlipbooks] = useState(null)
  const [flipbooksLoadFailed, setFlipbooksLoadFailed] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deletingIds, setDeletingIds] = useState(() => new Set())
  // Guards against a second request for the same flipbook before the re-render disables its button.
  const deletesInFlight = useRef(new Set())
  // Published flipbooks allowed by the user's plan (null: unlimited), as reported by the server.
  const [publishLimit, setPublishLimit] = useState(null)
  const [publishingIds, setPublishingIds] = useState(() => new Set())
  const publicationsInFlight = useRef(new Set())
  const [editing, setEditing] = useState(null)
  // Bumped by "Try again" to reload the account or the list without reloading the page.
  const [profileLoadKey, setProfileLoadKey] = useState(0)
  const [listLoadKey, setListLoadKey] = useState(0)

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
  }, [profileLoadKey])

  useEffect(() => {
    let cancelled = false

    async function loadFlipbooks() {
      try {
        const response = await api.get('/api/flipbooks')
        if (cancelled) return
        setFlipbooks(response.data.data.flipbooks)
        // So this browser's own visits to these public links are not counted in analytics.
        rememberOwnedFlipbooks(response.data.data.flipbooks.map((flipbook) => flipbook.slug))
        setPublishLimit(response.data.data.publishing?.limit ?? null)
      } catch (error) {
        if (cancelled) return
        setFlipbooksLoadFailed(true)
        toast.error(getApiErrorMessage(error))
      }
    }

    loadFlipbooks()
    return () => {
      cancelled = true
    }
  }, [listLoadKey])

  // Conversion runs in the background on the server; poll each processing flipbook until it settles.
  const processingIds = flipbooks?.filter((flipbook) => flipbook.status === 'processing').map((flipbook) => flipbook.id).join(',') ?? ''

  // Each poll also brings the conversion's progress. Polling restarts only when the set of
  // processing flipbooks changes, and stops when none is left (Ready or Failed) or on unmount.
  // After a reload the list shows processing flipbooks again, so progress resumes by itself.
  useEffect(() => {
    if (!processingIds) return
    return startConversionPolling({
      ids: processingIds.split(','),
      intervalMs: CONVERSION_POLL_INTERVAL_MS,
      fetchFlipbook: async (id) => {
        try {
          const response = await api.get(`/api/flipbooks/${id}`)
          return response.data.data.flipbook
        } catch (error) {
          // Deleted elsewhere: stop following it instead of asking forever.
          if (isMissing(error)) return null
          throw error
        }
      },
      onUpdate: (id, updated) => {
        if (!updated) return removeMissing(id)
        if (updated.status === 'ready') toast.success(`"${updated.title}" is ready: ${updated.pageCount} pages converted.`)
        if (updated.status === 'failed') toast.error(updated.conversionError ?? "We couldn't convert this PDF.")
        setFlipbooks((current) => current.map((flipbook) => (flipbook.id === id ? updated : flipbook)))
      },
    })
  }, [processingIds])

  function retryProfile() {
    setLoadFailed(false)
    setProfileLoadKey((key) => key + 1)
  }

  function retryList() {
    setFlipbooksLoadFailed(false)
    setListLoadKey((key) => key + 1)
  }

  function replaceRow(updated) {
    setFlipbooks((current) => current.map((flipbook) => (flipbook.id === updated.id ? updated : flipbook)))
  }

  // An action answered 404: the flipbook is gone (deleted in another tab, for example), so its
  // row goes too instead of offering actions that can only fail.
  function removeMissing(flipbookId) {
    setFlipbooks((current) => current?.filter((flipbook) => flipbook.id !== flipbookId) ?? current)
    toast.error('This flipbook no longer exists.')
  }

  async function handleConvert(flipbookId) {
    try {
      const response = await api.post(`/api/flipbooks/${flipbookId}/convert`)
      replaceRow(response.data.data.flipbook)
    } catch (error) {
      if (isMissing(error)) removeMissing(flipbookId)
      else toast.error(getApiErrorMessage(error))
    }
  }

  // The server normally starts conversion with the upload (status processing); polling then
  // follows it. Only a flipbook left "uploaded" (conversion queue full) needs a separate start.
  function handleUploaded(flipbook) {
    setFlipbooks((current) => [flipbook, ...(current ?? [])])
    if (flipbook.status === 'uploaded') handleConvert(flipbook.id)
  }

  function setDeleting(flipbookId, deleting) {
    setDeletingIds((current) => toggled(current, flipbookId, deleting))
  }

  // action is "publish" or "unpublish". The row is updated from the server's answer, never guessed.
  async function handlePublication(flipbook, action) {
    if (publicationsInFlight.current.has(flipbook.id)) return
    publicationsInFlight.current.add(flipbook.id)
    setPublishingIds((current) => toggled(current, flipbook.id, true))
    try {
      const response = await api.post(`/api/flipbooks/${flipbook.id}/${action}`)
      const updated = response.data.data.flipbook
      setFlipbooks((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      if (action === 'publish') toast.success(`"${updated.title}" is published. Anyone with the link can view it.`)
      else toast.success(`"${updated.title}" is unpublished. Its link no longer works.`)
    } catch (error) {
      if (isMissing(error)) removeMissing(flipbook.id)
      else toast.error(getApiErrorMessage(error))
    } finally {
      publicationsInFlight.current.delete(flipbook.id)
      setPublishingIds((current) => toggled(current, flipbook.id, false))
    }
  }

  // Title and link. The row is replaced with the server's answer; the dialog shows failures.
  async function handleSaveDetails(changes, confirmSlugChange) {
    const flipbook = editing
    const result = await saveFlipbookDetails(api, flipbook.id, changes, { confirmSlugChange })
    if (result.ok) {
      replaceRow(result.flipbook)
      setEditing(null)
      toast.success('Details saved.')
    } else if (result.missing) {
      setEditing(null)
      removeMissing(flipbook.id)
    }
    return result
  }

  async function handleCopyLink(flipbook) {
    const url = publicFlipbookUrl(window.location.origin, flipbook.slug)
    if (await copyLink(navigator.clipboard, url)) {
      toast.success('Link copied.')
      return
    }
    // Clipboard refused (permissions or an insecure context): show the link to copy by hand.
    toast(
      <div className="flex flex-col gap-2 text-sm">
        <span>Copy this link:</span>
        <input
          readOnly
          value={url}
          aria-label="Public link"
          className="input input-bordered input-sm w-64"
          onFocus={(event) => event.target.select()}
          autoFocus
        />
      </div>,
      { duration: 15000 }
    )
  }

  async function handleConfirmDelete() {
    const flipbook = pendingDelete
    setPendingDelete(null)
    if (!flipbook || deletesInFlight.current.has(flipbook.id)) return

    deletesInFlight.current.add(flipbook.id)
    setDeleting(flipbook.id, true)
    const result = await requestDeletion(api, flipbook.id)
    deletesInFlight.current.delete(flipbook.id)
    setDeleting(flipbook.id, false)
    setFlipbooks((current) => applyDeletion(current, flipbook.id, result))

    if (result.outcome === 'deleted') toast.success(`"${flipbook.title}" was deleted.`)
    else if (result.outcome === 'gone') toast.success('This flipbook had already been deleted.')
    else toast.error(result.message)
  }

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
            {loadFailed && (
              <div className="flex items-center gap-3">
                <p className="text-base-content/70">We couldn't load your account.</p>
                <button type="button" className="btn btn-outline btn-xs" onClick={retryProfile}>
                  Try again
                </button>
              </div>
            )}
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

        <div className="mt-6 flex flex-col gap-6">
          <PdfUploadCard onUploaded={handleUploaded} />
          <FlipbookList
            flipbooks={flipbooks}
            loadFailed={flipbooksLoadFailed}
            onRetryLoad={retryList}
            onEdit={setEditing}
            onConvert={handleConvert}
            onDelete={setPendingDelete}
            deletingIds={deletingIds}
            onPublish={(flipbook) => handlePublication(flipbook, 'publish')}
            onUnpublish={(flipbook) => handlePublication(flipbook, 'unpublish')}
            onCopyLink={handleCopyLink}
            publishingIds={publishingIds}
            publishLimit={publishLimit}
            plan={profile?.plan}
          />
          <AnalyticsSection />
        </div>
        <EditFlipbookDialog key={editing?.id ?? 'closed'} flipbook={editing} onSave={handleSaveDetails} onClose={() => setEditing(null)} />
        <ConfirmDeleteDialog flipbook={pendingDelete} onConfirm={handleConfirmDelete} onCancel={() => setPendingDelete(null)} />
      </div>
    </main>
  )
}
