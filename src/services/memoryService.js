// NPC memory: recording player actions and retrieving the relevant ones.
//
// Everything here is deterministic — no AI, no embeddings, no API keys.
// "Relevance" is a simple, explainable score:
//
//   score = importance (1–5)
//         + 5 × (number of query words found in the action/choice text)
//         + 2 if the memory happened in the era the NPC belongs to
//
// Ties break by recency (newest first), so results are stable and testable.
import { getDb, now } from '../db/database.js';
import { notFound, validationError } from '../lib/errors.js';
import { isKnownEra } from '../data/eras.js';

/** Look up an NPC row or throw 404. */
export function getNpc(npcId) {
  const npc = getDb().prepare('SELECT * FROM npcs WHERE id = ?').get(npcId);
  if (!npc) throw notFound('NPC', npcId);
  return npc;
}

/** All NPCs (for the dashboard dropdowns and the game's NPC roster). */
export function listNpcs() {
  return getDb().prepare('SELECT * FROM npcs ORDER BY era, name').all();
}

/**
 * Save one player action into an NPC's memory.
 * The NPC must exist; the era must be a known era.
 */
export function recordMemory({ npc_id, player_id, action, choice, era, importance }) {
  const db = getDb();
  const npc = getNpc(npc_id);

  const player = db.prepare('SELECT id FROM players WHERE id = ?').get(player_id);
  if (!player) throw notFound('Player', player_id);

  // Default the memory's era to the NPC's own era when the caller omits it.
  const memoryEra = era ?? npc.era;
  if (!isKnownEra(memoryEra)) {
    throw validationError([
      { field: 'era', issue: `must be one of the known eras (got "${memoryEra}")` },
    ]);
  }

  const info = db
    .prepare(
      `INSERT INTO memories (npc_id, player_id, action, choice, era, importance, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(npc_id, player_id, action, choice ?? null, memoryEra, importance, now());

  return getMemoryById(Number(info.lastInsertRowid));
}

function getMemoryById(id) {
  return getDb().prepare('SELECT * FROM memories WHERE id = ?').get(id);
}

/**
 * Retrieve an NPC's memories, most relevant first.
 *
 * options:
 *   playerId — only memories of this player (recommended: NPCs remember *you*)
 *   query    — optional words to score relevance against
 *   era      — optional era filter
 *   limit    — max rows (default 20)
 */
export function getRelevantMemories(npcId, { playerId, query, era, limit = 20 } = {}) {
  const npc = getNpc(npcId);
  const db = getDb();

  // Start with every memory this NPC has (optionally for one player).
  const conditions = ['npc_id = ?'];
  const params = [npcId];
  if (playerId) {
    conditions.push('player_id = ?');
    params.push(playerId);
  }
  if (era) {
    conditions.push('era = ?');
    params.push(era);
  }
  const rows = db
    .prepare(`SELECT * FROM memories WHERE ${conditions.join(' AND ')}`)
    .all(...params);

  const terms = query
    ? query.toLowerCase().split(/\s+/).filter((word) => word.length > 1)
    : [];

  const scored = rows.map((memory) => {
    const text = `${memory.action} ${memory.choice ?? ''}`.toLowerCase();
    const matches = terms.filter((term) => text.includes(term)).length;
    const score =
      memory.importance +
      5 * matches +
      (memory.era === npc.era ? 2 : 0);
    return { ...memory, score };
  });

  // Most relevant first; newest first inside equal scores (deterministic order).
  scored.sort((a, b) => b.score - a.score || b.created_at.localeCompare(a.created_at));
  return {
    npc: { id: npc.id, name: npc.name, era: npc.era },
    total: scored.length,
    query: query ?? null,
    memories: scored.slice(0, limit),
  };
}

/** Every memory a player has triggered across all NPCs (debug view). */
export function getMemoriesForPlayer(playerId) {
  const db = getDb();
  const player = db.prepare('SELECT id FROM players WHERE id = ?').get(playerId);
  if (!player) throw notFound('Player', playerId);
  return db
    .prepare(
      `SELECT m.*, n.name AS npc_name
         FROM memories m
         JOIN npcs n ON n.id = m.npc_id
        WHERE m.player_id = ?
        ORDER BY m.created_at DESC`
    )
    .all(playerId);
}
