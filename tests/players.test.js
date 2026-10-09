// Player state: creation, retrieval, clues, validation, and error shapes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let api;
before(async () => { api = await startServer(); });
after(async () => { await api.close(); });

test('GET /api/health reports ok', async () => {
  const { status, body } = await api.req('GET', '/api/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.deepEqual(body.era_config, ['present_hampi', 'historical_vijayanagara']);
});

test('POST /api/players creates a player in the default era', async () => {
  const { status, body } = await api.req('POST', '/api/players', { name: 'Arjun', id: 'arjun' });
  assert.equal(status, 201);
  assert.equal(body.player.id, 'arjun');
  assert.equal(body.player.name, 'Arjun');
  assert.equal(body.player.current_era, 'present_hampi');
});

test('POST /api/players generates an id when none is given', async () => {
  const { status, body } = await api.req('POST', '/api/players', { name: 'Auto Hero' });
  assert.equal(status, 201);
  assert.match(body.player.id, /^p_[0-9a-f-]{12}$/);
});

test('POST /api/players rejects a missing name', async () => {
  const { status, body } = await api.req('POST', '/api/players', {});
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.deepEqual(body.error.details, [{ field: 'name', issue: 'is required' }]);
});

test('POST /api/players rejects an unknown era', async () => {
  const { status, body } = await api.req('POST', '/api/players', { name: 'Time Lord', era: 'cretaceous' });
  assert.equal(status, 400);
  assert.equal(body.error.details[0].field, 'era');
});

test('POST /api/players rejects a duplicate id with 409', async () => {
  await api.req('POST', '/api/players', { name: 'First', id: 'dup_id' });
  const { status, body } = await api.req('POST', '/api/players', { name: 'Second', id: 'dup_id' });
  assert.equal(status, 409);
  assert.equal(body.error.code, 'PLAYER_EXISTS');
});

test('GET /api/players/:id returns 404 for unknown players', async () => {
  const { status, body } = await api.req('GET', '/api/players/ghost');
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('GET /api/players/:id returns full state with clues and quests', async () => {
  await api.req('POST', '/api/players', { name: 'State Tester', id: 'state_tester' });
  const { status, body } = await api.req('GET', '/api/players/state_tester');
  assert.equal(status, 200);
  assert.equal(body.player.id, 'state_tester');
  assert.ok(Array.isArray(body.player.clues));
  assert.ok(Array.isArray(body.player.quests));
  assert.equal(body.player.memory_count, 0);
  assert.equal(body.player.last_era_switch, null);
});

test('POST /api/players/:id/clues collects a clue once', async () => {
  await api.req('POST', '/api/players', { name: 'Clue Hunter', id: 'clue_hunter' });

  const first = await api.req('POST', '/api/players/clue_hunter/clues', {
    clue_key: 'broken-stele', label: 'A fragment with three words', from_era: 'present_hampi',
  });
  assert.equal(first.status, 201);
  assert.equal(first.body.clue.clue_key, 'broken-stele');

  const second = await api.req('POST', '/api/players/clue_hunter/clues', {
    clue_key: 'broken-stele', label: 'Same clue again',
  });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'CLUE_ALREADY_FOUND');

  const { body } = await api.req('GET', '/api/players/clue_hunter');
  assert.equal(body.player.clues.length, 1);
});

test('malformed JSON body returns 400 INVALID_JSON', async () => {
  const response = await fetch(`${api.base}/api/players`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ this is not json',
  });
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.equal(data.error.code, 'INVALID_JSON');
});

test('unknown API route returns JSON 404', async () => {
  const { status, body } = await api.req('GET', '/api/nope');
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});
