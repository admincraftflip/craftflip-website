import { getApiErrorMessage } from './apiErrors.js'

// Sends the delete request and works out what the dashboard row should become:
// deleted or gone (already deleted) -> remove the row; failed -> show the server's current
// state of the flipbook (for example "deleting" after a file cleanup failure), so it can be retried.
export async function requestDeletion(client, flipbookId) {
  try {
    await client.delete(`/api/flipbooks/${flipbookId}`)
    return { outcome: 'deleted' }
  } catch (error) {
    if (error.response?.status === 404) return { outcome: 'gone' }
    const message = getApiErrorMessage(error)
    try {
      const response = await client.get(`/api/flipbooks/${flipbookId}`)
      return { outcome: 'failed', message, flipbook: response.data.data.flipbook }
    } catch (refreshError) {
      if (refreshError.response?.status === 404) return { outcome: 'gone' }
      return { outcome: 'failed', message, flipbook: null }
    }
  }
}

export function applyDeletion(flipbooks, flipbookId, result) {
  if (result.outcome !== 'failed') return flipbooks.filter((flipbook) => flipbook.id !== flipbookId)
  if (!result.flipbook) return flipbooks
  return flipbooks.map((flipbook) => (flipbook.id === flipbookId ? result.flipbook : flipbook))
}
