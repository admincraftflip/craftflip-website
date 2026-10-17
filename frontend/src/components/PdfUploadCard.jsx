import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { FileText, Upload } from 'lucide-react'
import api from '../utils/api'
import { getApiErrorMessage } from '../utils/apiErrors'
import { formatFileSize } from '../utils/formatFileSize'

// Mirrors the backend limit so oversized files are caught before uploading. The backend still enforces it.
const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024

function looksLikePdf(file) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export default function PdfUploadCard({ onUploaded }) {
  const fileInputRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  // null while idle, 0-100 while uploading.
  const [progress, setProgress] = useState(null)
  const uploading = progress !== null

  function handleFileChange(event) {
    const file = event.target.files?.[0]
    // Reset so choosing the same file again still triggers a change.
    event.target.value = ''
    if (!file) return

    if (!looksLikePdf(file)) {
      toast.error('Please choose a PDF file.')
      return
    }
    if (file.size > MAX_PDF_SIZE_BYTES) {
      toast.error('PDF files must be 50 MB or smaller.')
      return
    }
    setSelectedFile(file)
  }

  async function handleUpload() {
    const formData = new FormData()
    formData.append('pdf', selectedFile)

    setProgress(0)
    try {
      const response = await api.post('/api/flipbooks', formData, {
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) setProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100))
        },
      })
      toast.success('PDF uploaded.')
      setSelectedFile(null)
      onUploaded(response.data.data.flipbook)
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    } finally {
      setProgress(null)
    }
  }

  return (
    <section className="card bg-base-100 shadow-sm">
      <div className="card-body gap-4">
        <header>
          <h2 className="text-lg font-semibold">Upload a PDF</h2>
          <p className="text-sm text-base-content/70">PDF only, up to 50 MB.</p>
        </header>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={handleFileChange}
        />

        {selectedFile ? (
          <div className="flex items-center gap-3 rounded-box border border-base-300 p-3">
            <FileText size={20} className="shrink-0 text-base-content/60" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{selectedFile.name}</p>
              <p className="text-xs text-base-content/60">{formatFileSize(selectedFile.size)}</p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => fileInputRef.current.click()}
              disabled={uploading}
            >
              Change
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-outline gap-2" onClick={() => fileInputRef.current.click()}>
            <FileText size={18} aria-hidden="true" />
            Choose PDF
          </button>
        )}

        {uploading && (
          <div className="flex flex-col gap-1" role="status">
            <progress className="progress progress-primary w-full" value={progress} max="100"></progress>
            <span className="text-xs text-base-content/60">
              {progress < 100 ? `Uploading original PDF… ${progress}%` : 'Storing your PDF securely…'}
            </span>
          </div>
        )}

        {selectedFile && (
          <button type="button" className="btn btn-primary gap-2" onClick={handleUpload} disabled={uploading}>
            {uploading ? (
              <span className="loading loading-spinner loading-sm"></span>
            ) : (
              <Upload size={18} aria-hidden="true" />
            )}
            Upload
          </button>
        )}
      </div>
    </section>
  )
}
