// Historical facts: storage + strict separation of verified vs. fictional.
//
// Rules enforced here (not just by convention):
//   • verification='fiction'  → source fields are stripped and stored as NULL.
//   • verification='verified' → both source_title AND source_url are required.
//   • GET /api/facts returns verified facts only unless you explicitly ask
//     for fiction (verification=fiction) or everything (verification=all).
import { getDb, now } from '../db/database.js';
import { notFound, validationError } from '../lib/errors.js';
import { FACT_ERAS, isKnownEra } from '../data/eras.js';

/**
 * List facts.
 * filter: { verification: 'verified'|'fiction'|'all', era: <era id> }
 * Defaults to verified only — the safe default for the game client.
 */
export function listFacts(filter = {}) {
  const { verification = 'verified', era } = filter;
  const conditions = [];
  const params = [];

  if (verification !== 'all') {
    conditions.push('verification = ?');
    params.push(verification);
  }
  if (era) {
    conditions.push('era = ?');
    params.push(era);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return getDb()
    .prepare(`SELECT * FROM facts ${where} ORDER BY id`)
    .all(...params);
}

/** One fact by id. */
export function getFact(id) {
  const fact = getDb().prepare('SELECT * FROM facts WHERE id = ?').get(id);
  if (!fact) throw notFound('Fact', id);
  return fact;
}

/**
 * Insert a fact with validation of the verification/source rules.
 * Returns the stored row (fiction always stored with NULL sources).
 */
export function addFact({ statement, era, verification, source_title, source_url }) {
  if (!FACT_ERAS.includes(era)) {
    throw validationError([
      { field: 'era', issue: `must be one of: ${FACT_ERAS.join(', ')}` },
    ]);
  }

  if (verification === 'fiction') {
    // Fiction must never masquerade as sourced history: drop any sources.
    const db = getDb();
    const info = db
      .prepare(
        `INSERT INTO facts (statement, era, verification, source_title, source_url, created_at)
         VALUES (?, ?, 'fiction', NULL, NULL, ?)`
      )
      .run(statement, era, now());
    return getFact(Number(info.lastInsertRowid));
  }

  // verified: both source fields are mandatory.
  const missing = [];
  if (!source_title) missing.push({ field: 'source_title', issue: 'is required for verified facts' });
  if (!source_url) missing.push({ field: 'source_url', issue: 'is required for verified facts' });
  if (missing.length) throw validationError(missing);

  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO facts (statement, era, verification, source_title, source_url, created_at)
       VALUES (?, ?, 'verified', ?, ?, ?)`
    )
    .run(statement, era, source_title, source_url, now());
  return getFact(Number(info.lastInsertRowid));
}

/** Counts per category — the dashboard uses this to show the separation. */
export function factSummary() {
  const db = getDb();
  return {
    verified: db.prepare(`SELECT COUNT(*) AS n FROM facts WHERE verification = 'verified'`).get().n,
    fiction: db.prepare(`SELECT COUNT(*) AS n FROM facts WHERE verification = 'fiction'`).get().n,
  };
}
