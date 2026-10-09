// Quest lifecycle: start → advance → complete, plus guard rails.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let api;
before(async () => { api = await startServer(); });
after(async () => { await api.close(); });

const questUrl = (pid, qid, action) =>
  `/api/players/${pid}/quests/${qid}${action ? `/${action}` : ''}`;

async function newPlayer(id) {
  const { status } = await api.req('POST', '/api/players', { name: `Hero ${id}`, id });
  assert.equal(status, 201);
}

test('seeded quest "The Memory of Stone" exists with 5 steps', async () => {
  const { status, body } = await api.req('GET', '/api/quests');
  assert.equal(status, 200);
  const quest = body.quests.find((q) => q.id === 'memory_of_stone');
  assert.ok(quest, 'quest should be seeded');
  assert.equal(quest.title, 'The Memory of Stone');
  assert.equal(quest.content_type, 'fiction');
  assert.equal(quest.steps.length, 5);
});

test('full quest lifecycle: start → advance → complete', async () => {
  await newPlayer('q_lifecycle');

  const start = await api.req('POST', questUrl('q_lifecycle', 'memory_of_stone', 'start'));
  assert.equal(start.status, 201);
  assert.equal(start.body.progress.status, 'in_progress');
  assert.equal(start.body.progress.current_step, 0);

  // Advance through all five steps.
  for (let i = 1; i <= 5; i++) {
    const { status, body } = await api.req('POST', questUrl('q_lifecycle', 'memory_of_stone', 'advance'), {});
    assert.equal(status, 200);
    assert.equal(body.progress.current_step, i, `step should be ${i}`);
  }

  // Advancing past the end is capped (no crash, no overflow).
  const capped = await api.req('POST', questUrl('q_lifecycle', 'memory_of_stone', 'advance'), {});
  assert.equal(capped.body.progress.current_step, 5);

  const complete = await api.req('POST', questUrl('q_lifecycle', 'memory_of_stone', 'complete'));
  assert.equal(complete.status, 200);
  assert.equal(complete.body.progress.status, 'completed');
  assert.ok(complete.body.progress.completed_at);
});

test('starting an already-started quest returns 409', async () => {
  await newPlayer('q_double');
  await api.req('POST', questUrl('q_double', 'memory_of_stone', 'start'));
  const { status, body } = await api.req('POST', questUrl('q_double', 'memory_of_stone', 'start'));
  assert.equal(status, 409);
  assert.equal(body.error.code, 'QUEST_ALREADY_STARTED');
});

test('completing before all steps are done returns 409 with details', async () => {
  await newPlayer('q_early');
  await api.req('POST', questUrl('q_early', 'memory_of_stone', 'start'));
  await api.req('POST', questUrl('q_early', 'memory_of_stone', 'advance'), {});

  const { status, body } = await api.req('POST', questUrl('q_early', 'memory_of_stone', 'complete'));
  assert.equal(status, 409);
  assert.equal(body.error.code, 'QUEST_STEPS_REMAINING');
  assert.equal(body.error.details[0].field, 'current_step');
});

test('advancing a quest that was never started returns 409', async () => {
  await newPlayer('q_notstarted');
  const { status, body } = await api.req('POST', questUrl('q_notstarted', 'memory_of_stone', 'advance'), {});
  assert.equal(status, 409);
  assert.equal(body.error.code, 'QUEST_NOT_STARTED');
});

test('progress on a finished quest is locked (409 on advance/complete)', async () => {
  await newPlayer('q_locked');
  await api.req('POST', questUrl('q_locked', 'memory_of_stone', 'start'));
  await api.req('POST', questUrl('q_locked', 'memory_of_stone', 'advance'), { step: 5 });
  await api.req('POST', questUrl('q_locked', 'memory_of_stone', 'complete'));

  const advance = await api.req('POST', questUrl('q_locked', 'memory_of_stone', 'advance'), {});
  assert.equal(advance.status, 409);
  assert.equal(advance.body.error.code, 'QUEST_ALREADY_COMPLETED');

  const complete = await api.req('POST', questUrl('q_locked', 'memory_of_stone', 'complete'));
  assert.equal(complete.status, 409);
  assert.equal(complete.body.error.code, 'QUEST_ALREADY_COMPLETED');
});

test('POST /api/quests creates a quest with steps', async () => {
  const { status, body } = await api.req('POST', '/api/quests', {
    id: 'river_echo',
    title: "The River's Echo",
    description: 'A short side quest.',
    steps: ['Find the ferry', 'Cross at dusk'],
  });
  assert.equal(status, 201);
  assert.equal(body.quest.id, 'river_echo');
  assert.deepEqual(body.quest.steps, ['Find the ferry', 'Cross at dusk']);
  assert.equal(body.quest.content_type, 'fiction');
});

test('POST /api/quests rejects empty steps', async () => {
  const { status, body } = await api.req('POST', '/api/quests', { title: 'Empty', steps: [] });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.equal(body.error.details[0].field, 'steps');
});

test('starting a quest for an unknown player returns 404', async () => {
  const { status, body } = await api.req('POST', questUrl('ghost_player', 'memory_of_stone', 'start'));
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('GET /api/players/:id/quests lists progress for the player', async () => {
  await newPlayer('q_list');
  await api.req('POST', questUrl('q_list', 'memory_of_stone', 'start'));
  const { status, body } = await api.req('GET', `/api/players/q_list/quests`);
  assert.equal(status, 200);
  assert.equal(body.progress.length, 1);
  assert.equal(body.progress[0].quest_id, 'memory_of_stone');
  assert.equal(body.progress[0].steps.length, 5);
});
