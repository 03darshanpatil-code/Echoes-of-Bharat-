// Tiny input-validation helper.
// Collects ALL problems in a request instead of stopping at the first one,
// so the client gets one useful error response:
//
//   { "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed",
//                "details": [ { "field": "name", "issue": "is required" } ] } }
//
// Usage:
//   const v = new Validator(req.body);
//   const name = v.string('name', { max: 80 });
//   v.done(); // throws a 400 ApiError if anything was wrong
import { validationError } from './errors.js';

/** Allowed id format: lowercase letters, digits, underscore, dash. */
export const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;

export class Validator {
  constructor(input) {
    this.input = input;
    this.details = [];
    if (input !== undefined && input !== null && (typeof input !== 'object' || Array.isArray(input))) {
      this.details.push({ field: '(body)', issue: 'must be a JSON object' });
      this.input = {};
    }
    if (this.input === undefined || this.input === null) this.input = {};
  }

  /**
   * Read a string field.
   * options: { required, min, max, pattern, values, trim }
   */
  string(field, options = {}) {
    const { required = true, min = 1, max = 200, pattern, values, trim = true } = options;
    let value = this.input[field];

    if (value === undefined || value === null || value === '') {
      if (required) {
        this.details.push({ field, issue: 'is required' });
        return undefined;
      }
      return options.default;
    }
    if (typeof value !== 'string') {
      this.details.push({ field, issue: 'must be a string' });
      return undefined;
    }
    if (trim) value = value.trim();
    if (value.length < min) {
      this.details.push({ field, issue: `must be at least ${min} character(s)` });
      return undefined;
    }
    if (value.length > max) {
      this.details.push({ field, issue: `must be at most ${max} characters` });
      return undefined;
    }
    if (pattern && !pattern.test(value)) {
      this.details.push({ field, issue: 'has an invalid format' });
      return undefined;
    }
    if (values && !values.includes(value)) {
      this.details.push({ field, issue: `must be one of: ${values.join(', ')}` });
      return undefined;
    }
    return value;
  }

  /**
   * Read an integer field. Accepts JSON numbers and numeric strings (query params).
   * options: { required, min, max, default }
   */
  integer(field, options = {}) {
    const { required = false, min = -Infinity, max = Infinity, default: defaultValue } = options;
    const raw = this.input[field];

    if (raw === undefined || raw === null || raw === '') {
      if (required) {
        this.details.push({ field, issue: 'is required' });
        return undefined;
      }
      return defaultValue;
    }
    const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isInteger(value)) {
      this.details.push({ field, issue: 'must be a whole number' });
      return undefined;
    }
    if (value < min || value > max) {
      this.details.push({ field, issue: `must be between ${min} and ${max}` });
      return undefined;
    }
    return value;
  }

  /** Read an http(s) URL field. */
  url(field, options = {}) {
    const { required = true, max = 500 } = options;
    const value = this.string(field, { required, max, trim: true });
    if (value === undefined) return undefined;
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        this.details.push({ field, issue: 'must start with http:// or https://' });
        return undefined;
      }
      return parsed.toString();
    } catch {
      this.details.push({ field, issue: 'must be a valid URL' });
      return undefined;
    }
  }

  /** Read an optional plain-object field (used for free-form metadata). */
  object(field, options = {}) {
    const { required = false } = options;
    const value = this.input[field];
    if (value === undefined || value === null) {
      if (required) this.details.push({ field, issue: 'is required' });
      return undefined;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      this.details.push({ field, issue: 'must be a JSON object' });
      return undefined;
    }
    return value;
  }

  /** Call last: throws the 400 error if any field failed validation. */
  done() {
    if (this.details.length > 0) throw validationError(this.details);
  }
}
