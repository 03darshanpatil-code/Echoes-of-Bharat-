// Central error types.
// Every API error response has the same shape:
//   { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [{ "field": "...", "issue": "..." }] } }

/** An error that carries an HTTP status code and a machine-readable code. */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details; // optional array of { field, issue }
  }
}

/** 400 — the request body/query failed validation. */
export function validationError(details) {
  return new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', details);
}

/** 404 — a resource does not exist. */
export function notFound(resource, id) {
  return new ApiError(404, 'NOT_FOUND', `${resource} not found: ${String(id)}`);
}

/** 409 — the request conflicts with the current game state. */
export function conflict(code, message, details) {
  return new ApiError(409, code, message, details);
}

/** 400 — the request body was not valid JSON. */
export function invalidJson() {
  return new ApiError(400, 'INVALID_JSON', 'Request body is not valid JSON');
}
