// Database setup: opens the SQLite file, creates tables, and (re)seeds reference data.
//
// We use Node's built-in `node:sqlite` module — no native npm packages to compile.
// The database lives at data/echoes.db (see src/config.js) and persists between runs.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

let db = null;

/** SQL that creates every table. Safe to run repeatedly (IF NOT EXISTS). */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  current_era   TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clues (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id    TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  clue_key     TEXT NOT NULL,          -- stable id, e.g. "broken-inscription"
  label        TEXT NOT NULL,          -- human-readable description
  from_era     TEXT,                   -- which era the clue was found in
  created_at   TEXT NOT NULL,
  UNIQUE (player_id, clue_key)         -- a player can only collect a clue once
);

CREATE TABLE IF NOT EXISTS quests (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  content_type  TEXT NOT NULL DEFAULT 'fiction',  -- ALWAYS 'fiction' for quests
  steps_json    TEXT NOT NULL,         -- JSON array of step titles, e.g. ["Step 1", ...]
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quest_progress (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id      TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  quest_id       TEXT NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'in_progress'
                 CHECK (status IN ('in_progress', 'completed')),
  current_step   INTEGER NOT NULL DEFAULT 0,   -- index of the next unfinished step
  started_at     TEXT NOT NULL,
  completed_at   TEXT,
  UNIQUE (player_id, quest_id)                 -- one progress row per player per quest
);

CREATE TABLE IF NOT EXISTS era_switches (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id    TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  from_era     TEXT NOT NULL,
  to_era       TEXT NOT NULL,
  switched_at  TEXT NOT NULL,
  reason       TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS npcs (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  era          TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT 'fiction'   -- ALWAYS 'fiction' for NPCs
);

CREATE TABLE IF NOT EXISTS memories (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  npc_id        TEXT NOT NULL REFERENCES npcs(id) ON DELETE CASCADE,
  player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,          -- what the player DID
  choice        TEXT,                   -- what the player CHOSE (nullable)
  era           TEXT NOT NULL,
  importance    INTEGER NOT NULL DEFAULT 1 CHECK (importance BETWEEN 1 AND 5),
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_npc_player ON memories(npc_id, player_id);

CREATE TABLE IF NOT EXISTS facts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  statement      TEXT NOT NULL,
  era            TEXT NOT NULL,
  verification   TEXT NOT NULL CHECK (verification IN ('verified', 'fiction')),
  source_title   TEXT,                  -- required when verification='verified'
  source_url     TEXT,                  -- required when verification='verified'
  created_at     TEXT NOT NULL
);
`;

/**
 * Get the shared database connection (opens + migrates on first call).
 * Tables are created idempotently, so this is safe to call anywhere.
 */
export function getDb() {
  if (db) return db;

  if (config.dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  }
  db = new DatabaseSync(config.dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

/** Close the connection (used by the reset script and tests). */
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

/** Current UTC timestamp in ISO format — one convention for every table. */
export function now() {
  return new Date().toISOString();
}
