export function notFound(req, res) {
  res.status(404).json({ success: false, message: 'Not found.' })
}

// Express calls this for errors thrown or passed to next(). Never send stack traces to the client.
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON in request body.' })
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'The request is too large.' })
  }

  console.error(`Unhandled error: ${error.name}: ${error.message}`)
  res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' })
}
