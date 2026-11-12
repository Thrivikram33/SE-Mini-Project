function requestErrorHandler(error, _req, res, _next) {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'INVALID_REQUEST',
      message: 'Request body must contain valid JSON.',
    })
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'REQUEST_TOO_LARGE',
      message: 'Request body exceeds the supported size.',
    })
  }
  if (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') {
    return res.status(415).json({
      error: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Request body encoding is not supported.',
    })
  }

  if (Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
    const errorCode = error.statusCode === 400
      ? 'INVALID_REQUEST'
      : error.statusCode === 404
        ? 'NOT_FOUND'
        : 'REQUEST_FAILED'

    return res.status(error.statusCode).json({
      error: errorCode,
      message: error.message,
    })
  }

  // Error messages can contain parser excerpts or database details. Log only a safe code.
  console.error('Request processing failed:', error.code || error.type || 'UNKNOWN_ERROR')
  return res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected server error occurred.',
  })
}

module.exports = { requestErrorHandler }
