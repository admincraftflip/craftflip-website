import { formatFileSize } from '../utils/formatFileSize'

const STATUS_BADGES = {
  uploaded: { label: 'Uploaded', className: 'badge-ghost' },
  processing: { label: 'Processing', className: 'badge-info' },
  ready: { label: 'Ready', className: 'badge-success' },
  failed: { label: 'Failed', className: 'badge-error' },
}

function StatusBadge({ status }) {
  const badge = STATUS_BADGES[status] ?? { label: status, className: 'badge-ghost' }
  return <span className={`badge badge-sm shrink-0 ${badge.className}`}>{badge.label}</span>
}

export default function FlipbookList({ flipbooks, loadFailed }) {
  return (
    <section className="card bg-base-100 shadow-sm">
      <div className="card-body">
        <h2 className="text-lg font-semibold">Your PDFs</h2>

        {!flipbooks && !loadFailed && <span className="loading loading-dots loading-md mt-2"></span>}
        {loadFailed && <p className="text-sm text-base-content/70">We couldn't load your PDFs. Please try again.</p>}
        {flipbooks?.length === 0 && (
          <p className="text-sm text-base-content/70">No PDFs yet. Upload one to get started.</p>
        )}

        {flipbooks?.length > 0 && (
          <ul className="divide-y divide-base-200">
            {flipbooks.map((flipbook) => (
              <li key={flipbook.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{flipbook.title}</p>
                  <p className="truncate text-xs text-base-content/60">
                    {flipbook.originalFilename} · {formatFileSize(flipbook.sizeBytes)} ·{' '}
                    {new Date(flipbook.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge status={flipbook.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
