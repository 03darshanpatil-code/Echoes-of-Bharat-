// Player state: creating players, collecting clues, and switching eras.
//
// Time travel is deterministic: switching eras always records a row in
// `era_switches`, and the player's `current_era` only ever changes through
// the switchEra() function — one code path, easy to reason about.
import { getDb, now } from '../db/database.js';
import { randomUUID } from 'node:crypto';
import { conflict, notFound, validationError } from '../lib/errors.js';
import { DEFAULT_ERA, ERAS, isKnownEra } from '../data/eras.js';

/** Create a player. Optional id lets tests/Unity pick a predictable id. */
export function createPlayer({ id, name, era = DEFAULT_ERA }) {
  const db = getDb();
  const playerId = id ?? `p_${randomUUID().slice(0, 12)}`; // server-generated when omitted
  if (!isKnownEra(era)) {
    throw validationError([
      { field: 'era', issue: `must be one of: ${ERAS.map((e) => e.id).join(', ')}` },
    ]);
  }
  if (db.prepare('SELECT 1 FROM players WHERE id = ?').get(playerId)) {
    throw conflict('PLAYER_EXISTS', `A player with id "${playerId}" already exists`);
  }
  db.prepare(
    'INSERT INTO players (id, name, current_era, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(playerId, name, era, now(), now());
  return getPlayer(playerId);
}

/** Full player record (row only — see getPlayerState for the rich version). */
export function getPlayer(playerId) {
  const player = getDb().prepare('SELECT * FROM players WHERE id = ?').get(playerId);
  if (!player) throw notFound('Player', playerId);
  return player;
}

/** Everything the game needs about a player in one response. */
export function getPlayerState(playerId) {
  const db = getDb();
  const player = getPlayer(playerId);

  const clues = db
    .prepare('SELECT clue_key, label, from_era, created_at FROM clues WHERE player_id = ? ORDER BY created_at')
    .all(playerId);

  const quests = db
    .prepare(
      `SELECT p.quest_id, q.title, p.status, p.current_step, p.started_at, p.completed_at,
              q.steps_json
         FROM quest_progress p
         JOIN quests q ON q.id = p.quest_id
        WHERE p.player_id = ?
        ORDER BY p.started_at`
    )
    .all(playerId)
    .map((row) => {
      const steps = JSON.parse(row.steps_json);
      const { steps_json, ...rest } = row;
      return { ...rest, total_steps: steps.length, steps };
    });

  const lastSwitch = db
    .prepare('SELECT * FROM era_switches WHERE player_id = ? ORDER BY switched_at DESC, id DESC LIMIT 1')
    .get(playerId);

  const memoryCount = db
    .prepare('SELECT COUNT(*) AS n FROM memories WHERE player_id = ?')
    .get(playerId).n;

  return { ...player, clues, quests, last_era_switch: lastSwitch ?? null, memory_count: memoryCount };
}

/** All players (dashboard list). */
export function listPlayers() {
  return getDb().prepare('SELECT * FROM players ORDER BY created_at').all();
}

/** Collect a clue. Clues are unique per player — collecting twice is a 409. */
export function addClue(playerId, { clue_key, label, from_era }) {
  const db = getDb();
  getPlayer(playerId); // 404 if missing
  if (from_era !== undefined && !isKnownEra(from_era)) {
    throw validationError([{ field: 'from_era', issue: 'must be a known era id' }]);
  }
  const existing = db
    .prepare('SELECT * FROM clues WHERE player_id = ? AND clue_key = ?')
    .get(playerId, clue_key);
  if (existing) {
    throw conflict('CLUE_ALREADY_FOUND', `Clue "${clue_key}" was already collected`, [
      { field: 'clue_key', issue: 'already collected' },
    ]);
  }
  db.prepare(
    'INSERT INTO clues (player_id, clue_key, label, from_era, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(playerId, clue_key, label, from_era ?? null, now());
  return db
    .prepare('SELECT clue_key, label, from_era, created_at FROM clues WHERE player_id = ? AND clue_key = ?')
    .get(playerId, clue_key);
}

/**
 * Switch the player's era (the time-travel mechanic).
 * Records the switch in history and updates current_era atomically.
 */
export function switchEra(playerId, { to_era, reason = '' }) {
  const db = getDb();
  const player = getPlayer(playerId);

  if (!isKnownEra(to_era)) {
    throw validationError([
      { field: 'to_era', issue: `must be one of: ${ERAS.map((e) => e.id).join(', ')}` },
    ]);
  }
  if (player.current_era === to_era) {
    throw conflict('ALREADY_IN_ERA', `Player is already in "${to_era}"`, [
      { field: 'to_era', issue: 'player is already in this era' },
    ]);
  }

  db.prepare(
    'INSERT INTO era_switches (player_id, from_era, to_era, switched_at, reason) VALUES (?, ?, ?, ?, ?)'
  ).run(playerId, player.current_era, to_era, now(), reason);
  db.prepare('UPDATE players SET current_era = ?, updated_at = ? WHERE id = ?').run(
    to_era,
    now(),
    playerId
  );
  return getPlayer(playerId);
}

/** Full switch history for one player (newest first). */
export function getEraHistory(playerId) {
  getPlayer(playerId); // 404 if missing
  return getDb()
    .prepare('SELECT * FROM era_switches WHERE player_id = ? ORDER BY switched_at DESC, id DESC')
    .all(playerId);
}
