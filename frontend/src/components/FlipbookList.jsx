import { Link } from 'react-router-dom'
import { BookOpen, Link2, Pencil, SlidersHorizontal, Trash2 } from 'lucide-react'
import { formatFileSize } from '../utils/formatFileSize'
import { canPublish, isLive, publicFlipbookPath } from '../utils/publication'
import ConversionProgress from './ConversionProgress'
import { viewerStyleName } from '../utils/viewerStyles'

const STATUS_BADGES = {
  uploaded: { label: 'Uploaded', className: 'badge-ghost' },
  processing: { label: 'Processing', className: 'badge-info' },
  ready: { label: 'Ready', className: 'badge-success' },
  failed: { label: 'Failed', className: 'badge-error' },
  // Shown only when a deletion started but its file cleanup failed; deleting again retries it.
  deleting: { label: 'Not fully deleted', className: 'badge-warning' },
}

function StatusBadge({ status }) {
  const badge = STATUS_BADGES[status] ?? { label: status, className: 'badge-ghost' }
  return <span className={`badge badge-sm shrink-0 ${badge.className}`}>{badge.label}</span>
}

function pageCountLabel(pageCount) {
  return pageCount === 1 ? '1 page' : `${pageCount} pages`
}

const CONVERT_LABELS = { uploaded: 'Convert', failed: 'Retry' }

const PLAN_NAMES = { free: 'Free', starter: 'Starter', pro: 'Pro' }

// "2 of 3 published", and how to free a slot once the plan's limit is reached.
function PublishingSummary({ flipbooks, publishLimit, plan }) {
  if (!flipbooks?.length || publishLimit === null) return null
  const published = flipbooks.filter(isLive).length
  const planName = PLAN_NAMES[plan] ?? 'your'
  return (
    <p className="text-xs text-base-content/60">
      {published} of {publishLimit} published on the {planName} plan.
      {published >= publishLimit && ' Unpublish or delete a flipbook to publish another.'}
    </p>
  )
}

function PublicationControls({ flipbook, busy, onPublish, onUnpublish, onCopyLink }) {
  if (isLive(flipbook)) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="badge badge-success badge-outline badge-xs">Published</span>
        <Link to={`/flipbooks/${flipbook.id}`} className="link-hover text-base-content/60" title="Change the viewing style">
          {viewerStyleName(flipbook.viewerStyle)}
        </Link>
        <span className="truncate text-base-content/60">{publicFlipbookPath(flipbook.slug)}</span>
        <button type="button" className="btn btn-ghost btn-xs gap-1" onClick={() => onCopyLink(flipbook)}>
          <Link2 size={12} aria-hidden="true" />
          Copy link
        </button>
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => onUnpublish(flipbook)} disabled={busy}>
          {busy ? <span className="loading loading-spinner loading-xs" aria-label="Unpublishing"></span> : 'Unpublish'}
        </button>
      </div>
    )
  }
  if (!canPublish(flipbook)) return null
  return (
    <div className="mt-1 flex items-center gap-2 text-xs">
      <span className="text-base-content/60">
        Not published ·{' '}
        <Link to={`/flipbooks/${flipbook.id}`} className="link-hover" title="Change the viewing style">
          {viewerStyleName(flipbook.viewerStyle)}
        </Link>
      </span>
      <button type="button" className="btn btn-outline btn-xs" onClick={() => onPublish(flipbook)} disabled={busy}>
        {busy ? <span className="loading loading-spinner loading-xs" aria-label="Publishing"></span> : 'Publish'}
      </button>
    </div>
  )
}

export default function FlipbookList({
  flipbooks,
  loadFailed,
  onRetryLoad,
  onConvert,
  onEdit,
  onDelete,
  deletingIds,
  onPublish,
  onUnpublish,
  onCopyLink,
  publishingIds,
  publishLimit,
  plan,
}) {
  return (
    <section className="card bg-base-100 shadow-sm">
      <div className="card-body">
        <h2 className="text-lg font-semibold">Your PDFs</h2>
        <PublishingSummary flipbooks={flipbooks} publishLimit={publishLimit} plan={plan} />

        {!flipbooks && !loadFailed && <span className="loading loading-dots loading-md mt-2"></span>}
        {loadFailed && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-base-content/70">We couldn't load your PDFs.</p>
            <button type="button" className="btn btn-outline btn-xs" onClick={onRetryLoad}>
              Try again
            </button>
          </div>
        )}
        {flipbooks?.length === 0 && (
          <p className="text-sm text-base-content/70">No PDFs yet. Upload one to get started.</p>
        )}

        {flipbooks?.length > 0 && (
          <ul className="divide-y divide-base-200">
            {flipbooks.map((flipbook) => (
              <li key={flipbook.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{flipbook.title}</p>
                  {/* Only the filename and date shorten on a narrow row, so size and page count stay visible. */}
                  <p className="flex text-xs text-base-content/60">
                    <span className="truncate">{flipbook.originalFilename}</span>
                    <span className="shrink-0 whitespace-pre">
                      {` · ${formatFileSize(flipbook.sizeBytes)}`}
                      {flipbook.status === 'ready' && flipbook.pageCount ? ` · ${pageCountLabel(flipbook.pageCount)}` : ''}
                    </span>
                    <span className="overflow-hidden text-ellipsis whitespace-pre">{` · ${new Date(flipbook.createdAt).toLocaleDateString()}`}</span>
                  </p>
                  {flipbook.status === 'processing' && <ConversionProgress progress={flipbook.conversionProgress} />}
                  {flipbook.conversionError && <p className="text-xs text-error">{flipbook.conversionError}</p>}
                  <PublicationControls
                    flipbook={flipbook}
                    busy={publishingIds.has(flipbook.id) || deletingIds.has(flipbook.id)}
                    onPublish={onPublish}
                    onUnpublish={onUnpublish}
                    onCopyLink={onCopyLink}
                  />
                </div>
                <StatusBadge status={flipbook.status} />
                {flipbook.status === 'ready' && (
                  <Link to={`/flipbooks/${flipbook.id}`} className="btn btn-primary btn-xs gap-1">
                    <BookOpen size={14} aria-hidden="true" />
                    Open
                  </Link>
                )}
                {CONVERT_LABELS[flipbook.status] && (
                  <button type="button" className="btn btn-outline btn-xs" onClick={() => onConvert(flipbook.id)}>
                    {CONVERT_LABELS[flipbook.status]}
                  </button>
                )}
                {flipbook.status === 'ready' && (
                  <Link
                    to={`/flipbooks/${flipbook.id}?customize=1`}
                    className="btn btn-ghost btn-xs btn-square text-base-content/60"
                    title="Customize the reader: logo, colours, button, downloads, embed"
                    aria-label={`Customize ${flipbook.title}`}
                  >
                    <SlidersHorizontal size={14} aria-hidden="true" />
                  </Link>
                )}
                {flipbook.status !== 'deleting' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square text-base-content/60"
                    onClick={() => onEdit(flipbook)}
                    disabled={deletingIds.has(flipbook.id) || publishingIds.has(flipbook.id)}
                    title="Edit title and link"
                    aria-label={`Edit ${flipbook.title}`}
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                )}
                {/* A running conversion may still store page images, so deleting waits until it finishes. */}
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-square text-base-content/60"
                  onClick={() => onDelete(flipbook)}
                  disabled={flipbook.status === 'processing' || deletingIds.has(flipbook.id)}
                  title={flipbook.status === 'processing' ? 'You can delete this once the conversion finishes' : 'Delete'}
                  aria-label={`Delete ${flipbook.title}`}
                >
                  {deletingIds.has(flipbook.id) ? (
                    <span className="loading loading-spinner loading-xs" aria-hidden="true"></span>
                  ) : (
                    <Trash2 size={14} aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
