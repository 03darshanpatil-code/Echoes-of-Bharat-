// Error handling: every failed request returns the same JSON shape.
//
//   { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
//
// This is the ONLY place that writes error responses, so the format never drifts.
import { ApiError, invalidJson } from '../lib/errors.js';

/** Converts any thrown error into the standard JSON error response. */
export function errorHandler(err, req, res, next) {
  // Malformed JSON body (thrown by express.json before routes run).
  if (err?.type === 'entity.parse.failed') {
    const e = invalidJson();
    return res.status(e.status).json({ error: { code: e.code, message: e.message } });
  }

  if (err instanceof ApiError) {
    const body = { code: err.code, message: err.message };
    if (err.details?.length) body.details = err.details;
    return res.status(err.status).json({ error: body });
  }

  // Unexpected bug — log it for ourselves, never leak the stack to clients.
  console.error('[unhandled error]', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server' },
  });
}

/** 404 for any API path that no route matched. */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No API route for ${req.method} ${req.originalUrl}` },
  });
}
