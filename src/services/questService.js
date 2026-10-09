// Quest rules: create, start, step through, and complete quests.
//
// Deterministic state machine — the ONLY legal transitions are:
//
//   (not started)  → start   → in_progress (step 0)
//   in_progress    → advance → in_progress (step + 1, capped at the end)
//   in_progress    → complete → completed   (only if every step is done)
//   completed      → advance/complete → 409 error (quest is over)
import { getDb, now } from '../db/database.js';
import { randomUUID } from 'node:crypto';
import { conflict, notFound, validationError } from '../lib/errors.js';

/** Load a quest row with its steps parsed from JSON, or throw 404. */
export function getQuest(questId) {
  const row = getDb().prepare('SELECT * FROM quests WHERE id = ?').get(questId);
  if (!row) throw notFound('Quest', questId);
  return { ...row, steps: JSON.parse(row.steps_json) };
}

/** All quests. */
export function listQuests() {
  return getDb()
    .prepare('SELECT * FROM quests ORDER BY created_at')
    .all()
    .map((row) => ({ ...row, steps: JSON.parse(row.steps_json) }));
}

/** Create a new quest (always fictional story content). */
export function createQuest({ id, title, description = '', steps }) {
  const db = getDb();
  const questId = id ?? `q_${randomUUID().slice(0, 12)}`; // server-generated when omitted
  if (db.prepare('SELECT 1 FROM quests WHERE id = ?').get(questId)) {
    throw conflict('QUEST_EXISTS', `A quest with id "${questId}" already exists`);
  }
  db.prepare(
    `INSERT INTO quests (id, title, description, content_type, steps_json, created_at)
     VALUES (?, ?, ?, 'fiction', ?, ?)`
  ).run(questId, title, description, JSON.stringify(steps), now());
  return getQuest(questId);
}

/** Current progress for one player+quest, or null if never started. */
export function getProgress(playerId, questId) {
  return (
    getDb()
      .prepare('SELECT * FROM quest_progress WHERE player_id = ? AND quest_id = ?')
      .get(playerId, questId) ?? null
  );
}

/** Progress for every quest a player has started. */
export function getProgressForPlayer(playerId) {
  return getDb()
    .prepare(
      `SELECT p.*, q.title, q.steps_json
         FROM quest_progress p
         JOIN quests q ON q.id = p.quest_id
        WHERE p.player_id = ?
        ORDER BY p.started_at`
    )
    .all(playerId)
    .map((row) => ({ ...row, steps: JSON.parse(row.steps_json) }));
}

/** Verify the player and quest exist (throws 404 otherwise). */
function requirePlayerAndQuest(playerId, questId) {
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM players WHERE id = ?').get(playerId)) {
    throw notFound('Player', playerId);
  }
  getQuest(questId); // throws 404 if missing
}

/** Start a quest: (not started) → in_progress at step 0. */
export function startQuest(playerId, questId) {
  requirePlayerAndQuest(playerId, questId);
  const existing = getProgress(playerId, questId);
  if (existing) {
    throw conflict(
      existing.status === 'completed' ? 'QUEST_ALREADY_COMPLETED' : 'QUEST_ALREADY_STARTED',
      existing.status === 'completed'
        ? 'This quest is already completed'
        : 'This quest is already in progress'
    );
  }
  getDb()
    .prepare(
      `INSERT INTO quest_progress (player_id, quest_id, status, current_step, started_at)
       VALUES (?, ?, 'in_progress', 0, ?)`
    )
    .run(playerId, questId, now());
  return getProgress(playerId, questId);
}

/**
 * Advance to the next step.
 * body.step (optional) sets an explicit step index instead of +1 —
 * useful for the dashboard and for fast-forwarding in tests.
 */
export function advanceQuest(playerId, questId, step) {
  requirePlayerAndQuest(playerId, questId);
  const quest = getQuest(questId);
  const progress = getProgress(playerId, questId);
  if (!progress) {
    throw conflict('QUEST_NOT_STARTED', 'Start the quest before updating its progress');
  }
  if (progress.status === 'completed') {
    throw conflict('QUEST_ALREADY_COMPLETED', 'This quest is already completed');
  }

  const nextStep =
    step === undefined
      ? Math.min(progress.current_step + 1, quest.steps.length) // +1 but never past the end
      : step;
  if (nextStep < 0 || nextStep > quest.steps.length) {
    throw validationError([
      { field: 'step', issue: `must be between 0 and ${quest.steps.length} (total steps)` },
    ]);
  }

  getDb()
    .prepare('UPDATE quest_progress SET current_step = ? WHERE id = ?')
    .run(nextStep, progress.id);
  return getProgress(playerId, questId);
}

/** Complete the quest — only legal when every step is finished. */
export function completeQuest(playerId, questId) {
  requirePlayerAndQuest(playerId, questId);
  const quest = getQuest(questId);
  const progress = getProgress(playerId, questId);
  if (!progress) {
    throw conflict('QUEST_NOT_STARTED', 'Start the quest before completing it');
  }
  if (progress.status === 'completed') {
    throw conflict('QUEST_ALREADY_COMPLETED', 'This quest is already completed');
  }
  if (progress.current_step < quest.steps.length) {
    throw conflict(
      'QUEST_STEPS_REMAINING',
      `Finish all steps first — ${quest.steps.length - progress.current_step} remaining`,
      [{ field: 'current_step', issue: `is ${progress.current_step}, total is ${quest.steps.length}` }]
    );
  }

  getDb()
    .prepare(`UPDATE quest_progress SET status = 'completed', completed_at = ? WHERE id = ?`)
    .run(now(), progress.id);
  return getProgress(playerId, questId);
}
