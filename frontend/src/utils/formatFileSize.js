const ONE_MB = 1024 * 1024

export function formatFileSize(bytes) {
  if (bytes < ONE_MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / ONE_MB).toFixed(1)} MB`
}
