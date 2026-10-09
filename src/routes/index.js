// All API routes in one file, grouped by feature.
// Routes only parse + validate input and shape output — the rules live in
// src/services/*, which keeps this file easy to read.
import { Router } from 'express';
import { Validator, ID_PATTERN } from '../lib/validate.js';
import { ERAS } from '../data/eras.js';
import * as players from '../services/playerService.js';
import * as quests from '../services/questService.js';
import * as memories from '../services/memoryService.js';
import * as facts from '../services/factService.js';
import { listEras } from '../data/eras.js';

const router = Router();
const ERA_IDS = ERAS.map((e) => e.id);

/** Wrap an async handler so thrown errors reach the error middleware. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ────────────────────────────── Health ──────────────────────────────
router.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), era_config: ERA_IDS });
});

// ─────────────────────────────── Eras ───────────────────────────────
router.get('/eras', (req, res) => {
  res.json({ eras: listEras() });
});

// ────────────────────────────── Players ─────────────────────────────
router.get('/players', (req, res) => {
  res.json({ players: players.listPlayers() });
});

router.post('/players', wrap((req, res) => {
  const v = new Validator(req.body);
  const id = v.string('id', { required: false, pattern: ID_PATTERN });
  const name = v.string('name', { max: 80 });
  const era = v.string('era', { required: false, values: ERA_IDS });
  v.done();
  res.status(201).json({ player: players.createPlayer({ id, name, era }) });
}));

router.get('/players/:playerId', wrap((req, res) => {
  res.json({ player: players.getPlayerState(req.params.playerId) });
}));

// ─────────────────────────────── Clues ──────────────────────────────
router.post('/players/:playerId/clues', wrap((req, res) => {
  const v = new Validator(req.body);
  const clue_key = v.string('clue_key', { max: 60 });
  const label = v.string('label', { max: 200 });
  const from_era = v.string('from_era', { required: false, values: ERA_IDS });
  v.done();
  res.status(201).json({ clue: players.addClue(req.params.playerId, { clue_key, label, from_era }) });
}));

// ───────────────────────────── Time travel ──────────────────────────
router.post('/players/:playerId/travel', wrap((req, res) => {
  const v = new Validator(req.body);
  const to_era = v.string('to_era', { values: ERA_IDS });
  const reason = v.string('reason', { required: false, max: 200 });
  v.done();
  res.json({ player: players.switchEra(req.params.playerId, { to_era, reason }) });
}));

router.get('/players/:playerId/travel-history', wrap((req, res) => {
  res.json({ history: players.getEraHistory(req.params.playerId) });
}));

// ─────────────────────────────── Quests ─────────────────────────────
router.get('/quests', (req, res) => {
  res.json({ quests: quests.listQuests() });
});

router.post('/quests', wrap((req, res) => {
  const v = new Validator(req.body);
  const id = v.string('id', { required: false, pattern: ID_PATTERN });
  const title = v.string('title', { max: 120 });
  const description = v.string('description', { required: false, max: 500 });
  v.done();

  // Steps must be a non-empty array of short strings.
  const rawSteps = req.body?.steps;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: [{ field: 'steps', issue: 'must be a non-empty array of step titles' }],
      },
    });
    return;
  }
  const steps = rawSteps.map((s, i) => {
    if (typeof s !== 'string' || !s.trim() || s.length > 200) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: [{ field: `steps[${i}]`, issue: 'must be a non-empty string of at most 200 characters' }],
        },
      });
      return null;
    }
    return s.trim();
  });
  if (steps.includes(null)) return;

  res.status(201).json({ quest: quests.createQuest({ id, title, description, steps }) });
}));

router.get('/quests/:questId', wrap((req, res) => {
  res.json({ quest: quests.getQuest(req.params.questId) });
}));

router.get('/players/:playerId/quests', wrap((req, res) => {
  res.json({ progress: quests.getProgressForPlayer(req.params.playerId) });
}));

router.post('/players/:playerId/quests/:questId/start', wrap((req, res) => {
  res.status(201).json({ progress: quests.startQuest(req.params.playerId, req.params.questId) });
}));

router.post('/players/:playerId/quests/:questId/advance', wrap((req, res) => {
  const v = new Validator(req.body);
  const step = v.integer('step', { required: false, min: 0 });
  v.done();
  res.json({ progress: quests.advanceQuest(req.params.playerId, req.params.questId, step) });
}));

router.post('/players/:playerId/quests/:questId/complete', wrap((req, res) => {
  res.json({ progress: quests.completeQuest(req.params.playerId, req.params.questId) });
}));

// ──────────────────────────── NPC memory ────────────────────────────
router.get('/npcs', (req, res) => {
  res.json({ npcs: memories.listNpcs() });
});

router.get('/npcs/:npcId/memories', wrap((req, res) => {
  const v = new Validator(req.query);
  const playerId = v.string('player_id', { required: false, max: 64 });
  const query = v.string('query', { required: false, max: 120 });
  const era = v.string('era', { required: false, values: ERA_IDS });
  const limit = v.integer('limit', { required: false, min: 1, max: 100, default: 20 });
  v.done();
  res.json(memories.getRelevantMemories(req.params.npcId, { playerId, query, era, limit }));
}));

router.post('/npcs/:npcId/memories', wrap((req, res) => {
  const v = new Validator(req.body);
  const player_id = v.string('player_id', { max: 64 });
  const action = v.string('action', { max: 300 });
  const choice = v.string('choice', { required: false, max: 300 });
  const era = v.string('era', { required: false, values: ERA_IDS });
  const importance = v.integer('importance', { required: false, min: 1, max: 5, default: 1 });
  v.done();
  res.status(201).json({
    memory: memories.recordMemory({ npc_id: req.params.npcId, player_id, action, choice, era, importance }),
  });
}));

router.get('/players/:playerId/memories', wrap((req, res) => {
  res.json({ memories: memories.getMemoriesForPlayer(req.params.playerId) });
}));

// ─────────────────────────── Historical facts ───────────────────────
router.get('/facts', (req, res) => {
  const v = new Validator(req.query);
  const verification = v.string('verification', {
    required: false,
    values: ['verified', 'fiction', 'all'],
    default: 'verified',
  });
  const era = v.string('era', { required: false, values: ['historical_vijayanagara', 'present_hampi', 'both'] });
  v.done();
  res.json({
    verification,
    summary: facts.factSummary(),
    facts: facts.listFacts({ verification, era }),
  });
});

router.post('/facts', wrap((req, res) => {
  const v = new Validator(req.body);
  const statement = v.string('statement', { max: 500 });
  const era = v.string('era', { values: ['historical_vijayanagara', 'present_hampi', 'both'] });
  const verification = v.string('verification', { values: ['verified', 'fiction'] });
  const source_title = v.string('source_title', { required: false, max: 200 });
  const source_url = v.url('source_url', { required: false });
  v.done();
  res.status(201).json({
    fact: facts.addFact({ statement, era, verification, source_title, source_url }),
  });
}));

export default router;
