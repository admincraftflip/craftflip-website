import { useEffect, useState } from 'react'
import api from '../utils/api'

// The owner preview's reader images (the logo, and the uploaded background): private, so they come
// through the authenticated API as blobs (an <img> or CSS background cannot send the Firebase
// token). asset is "logo" or "background"; revision changes when the image is replaced, which
// reloads it.
export function useOwnerImage(flipbookId, asset, revision) {
  const [loaded, setLoaded] = useState({ revision: null, url: null })

  useEffect(() => {
    if (!revision) return
    const controller = new AbortController()
    let url = null

    async function load() {
      try {
        const response = await api.get(`/api/flipbooks/${flipbookId}/${asset}`, { responseType: 'blob', signal: controller.signal })
        url = URL.createObjectURL(response.data)
        setLoaded({ revision, url })
      } catch {
        // The preview simply shows no image; saving settings is unaffected.
      }
    }

    load()
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [flipbookId, asset, revision])

  return revision && loaded.revision === revision ? loaded.url : null
}

export function useOwnerLogo(flipbookId, revision) {
  return useOwnerImage(flipbookId, 'logo', revision)
}
