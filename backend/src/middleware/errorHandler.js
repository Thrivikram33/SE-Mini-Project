import { ApiError } from '../shared/apiError.js'

export function notFound(_req, _res, next) {
  next(new ApiError(404, 'NOT_FOUND', 'The requested API resource was not found.'))
}

export function errorHandler(error, req, res, _next) {
  const known = error instanceof ApiError
  const invalidJson = !known && error?.type === 'entity.parse.failed'
  const oversizedBody = !known && error?.type === 'entity.too.large'
  const status = known ? error.status : invalidJson ? 400 : oversizedBody ? 413 : 500
  const body = {
    error: {
      code: known ? error.code : invalidJson ? 'INVALID_JSON' : oversizedBody ? 'REQUEST_TOO_LARGE' : 'INTERNAL_ERROR',
      message: known ? error.message : invalidJson ? 'Request body must contain valid JSON.' : oversizedBody ? 'Request body exceeds the allowed size.' : 'An unexpected server error occurred.',
      requestId: req.requestId,
    },
  }
  if (known && error.details) body.error.details = error.details
  if (!known && !invalidJson && !oversizedBody) console.error(JSON.stringify({ requestId: req.requestId, errorCode: 'UNEXPECTED_ERROR' }))
  res.status(status).json(body)
}
