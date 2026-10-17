import { useEffect, useRef, useState } from 'react'
import { MAX_TITLE_LENGTH, detailsChanges, detailsProblem, finishSlug, slugFromInput } from '../utils/flipbookDetails'
import { publicFlipbookPath } from '../utils/publication'

// Edit a flipbook's title and link. Open while `flipbook` is set (the parent gives it a key per
// flipbook, so the form starts from that flipbook's values). onSave(changes, confirmSlugChange)
// resolves to the save result; the dialog stays open with the message when it fails.
export default function EditFlipbookDialog({ flipbook, onSave, onClose }) {
  const dialogRef = useRef(null)
  const [title, setTitle] = useState(flipbook?.title ?? '')
  const [slug, setSlug] = useState(flipbook?.slug ?? '')
  const [confirmed, setConfirmed] = useState(false)
  const [serverAsksConfirmation, setServerAsksConfirmation] = useState(false)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (flipbook && !dialog.open) dialog.showModal()
    if (!flipbook && dialog.open) dialog.close()
  }, [flipbook])

  const changes = flipbook ? detailsChanges(flipbook, { title, slug }) : {}
  const linkChanging = 'slug' in changes
  // Changing a link that has been public breaks it for good (Slug rules), so it needs consent.
  const needsConfirmation = linkChanging && (flipbook?.hasBeenPublished || serverAsksConfirmation)

  async function handleSubmit(event) {
    event.preventDefault()
    if (Object.keys(changes).length === 0) return onClose()
    const localProblem = detailsProblem(changes)
    if (localProblem) return setProblem(localProblem)
    if (needsConfirmation && !confirmed) return setProblem('Please confirm that the old link will stop working.')

    setSaving(true)
    setProblem(null)
    const result = await onSave(changes, needsConfirmation && confirmed)
    setSaving(false)
    if (!result.ok) {
      if (result.requiresConfirmation) setServerAsksConfirmation(true)
      setProblem(result.message)
    }
  }

  return (
    <dialog ref={dialogRef} className="modal" onClose={() => !saving && onClose()} aria-labelledby="edit-dialog-title">
      <form className="modal-box flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <h3 id="edit-dialog-title" className="text-lg font-semibold">
          Edit details
        </h3>

        <label className="form-control">
          <span className="label-text mb-1 text-sm">Title</span>
          <input
            className="input input-bordered input-sm"
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            onChange={(event) => setTitle(event.target.value)}
            disabled={saving}
            required
          />
        </label>

        <label className="form-control">
          <span className="label-text mb-1 text-sm">Public link</span>
          <div className="flex items-center gap-1 text-sm">
            <span className="shrink-0 text-base-content/60">/view/</span>
            <input
              className="input input-bordered input-sm min-w-0 flex-1"
              value={slug}
              onChange={(event) => setSlug(slugFromInput(event.target.value))}
              onBlur={() => setSlug(finishSlug(slug))}
              disabled={saving}
              spellCheck={false}
              autoCapitalize="off"
            />
          </div>
          <span className="mt-1 text-xs text-base-content/60">Lowercase letters, numbers and hyphens, 3 to 80 characters.</span>
        </label>

        {needsConfirmation && (
          <div className="rounded-box border border-warning/40 bg-warning/10 p-3 text-sm">
            <p>
              This flipbook has been published. Anyone using the old link ({publicFlipbookPath(flipbook.slug)}) will see a "doesn't
              exist" page, and the old link is never given to another flipbook.
            </p>
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" className="checkbox checkbox-sm" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={saving} />
              <span>I understand the old link will stop working</span>
            </label>
          </div>
        )}

        {problem && (
          <p className="text-sm text-error" role="alert">
            {problem}
          </p>
        )}

        <div className="modal-action mt-0">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
            {saving ? <span className="loading loading-spinner loading-xs" aria-label="Saving"></span> : 'Save'}
          </button>
        </div>
      </form>
      <form method="dialog" className="modal-backdrop">
        <button type="submit" disabled={saving}>
          Close
        </button>
      </form>
    </dialog>
  )
}
