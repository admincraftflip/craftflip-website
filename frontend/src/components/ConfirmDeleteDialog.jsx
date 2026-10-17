import { useEffect, useRef } from 'react'

// Confirmation before permanently deleting a flipbook. Open while `flipbook` is set;
// Escape, the backdrop and Cancel all call onCancel.
export default function ConfirmDeleteDialog({ flipbook, onConfirm, onCancel }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (flipbook && !dialog.open) dialog.showModal()
    if (!flipbook && dialog.open) dialog.close()
  }, [flipbook])

  return (
    <dialog ref={dialogRef} className="modal" onClose={onCancel} aria-labelledby="delete-dialog-title">
      <div className="modal-box">
        <h3 id="delete-dialog-title" className="text-lg font-semibold">
          Delete this flipbook?
        </h3>
        <p className="py-3 text-sm text-base-content/70">
          “{flipbook?.title}”, its original PDF and its converted pages will be permanently deleted. This can't be undone.
        </p>
        <div className="modal-action">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-error btn-sm" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="submit">Close</button>
      </form>
    </dialog>
  )
}
