import { Worker } from 'node:worker_threads'

const WORKER_URL = new URL('./pdfRenderWorker.js', import.meta.url)
const WORKER_MEMORY_LIMIT_MB = 512

// code is one of: 'password', 'unreadable', 'render-failed', 'stopped'.
export class PdfRenderError extends Error {
  constructor(code) {
    super(`PDF render failed: ${code}`)
    this.code = code
  }
}

// Opens a PDF in its own worker thread and renders pages on request (the caller bounds how many
// run at once, and so how many page images are held in memory). Always call close() when done.
export async function openPdf(pdfBuffer) {
  const worker = new Worker(WORKER_URL, { resourceLimits: { maxOldGenerationSizeMb: WORKER_MEMORY_LIMIT_MB } })
  const pending = new Map()
  let nextRequestId = 0
  let stopped = null

  function stop(error) {
    if (stopped) return
    stopped = error
    for (const { reject } of pending.values()) reject(error)
    pending.clear()
  }

  worker.on('message', ({ id, ok, result, error }) => {
    const request = pending.get(id)
    if (!request) return
    pending.delete(id)
    if (ok) request.resolve(result)
    else request.reject(new PdfRenderError(error))
  })
  worker.on('error', () => stop(new PdfRenderError('render-failed')))
  worker.on('exit', () => stop(new PdfRenderError('stopped')))

  function request(message, transfer = []) {
    if (stopped) return Promise.reject(stopped)
    return new Promise((resolve, reject) => {
      const id = nextRequestId++
      pending.set(id, { resolve, reject })
      worker.postMessage({ ...message, id }, transfer)
    })
  }

  function close() {
    stop(new PdfRenderError('stopped'))
    return worker.terminate()
  }

  try {
    const data = new Uint8Array(pdfBuffer)
    const { pageCount } = await request({ type: 'open', data }, [data.buffer])
    return {
      pageCount,
      renderPage: async (pageNumber) => {
        const { data: image, width, height } = await request({ type: 'render', pageNumber })
        return { data: Buffer.from(image.buffer, image.byteOffset, image.byteLength), width, height }
      },
      close,
    }
  } catch (error) {
    await close()
    throw error
  }
}
