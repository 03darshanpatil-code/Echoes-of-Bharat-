// NPC memory: recording actions and deterministic relevance retrieval.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let api;
before(async () => { api = await startServer(); });
after(async () => { await api.close(); });

async function newPlayer(id) {
  await api.req('POST', '/api/players', { name: `Hero ${id}`, id });
}

test('GET /api/npcs returns the seeded fictional NPCs', async () => {
  const { status, body } = await api.req('GET', '/api/npcs');
  assert.equal(status, 200);
  assert.ok(body.npcs.length >= 4);
  for (const npc of body.npcs) assert.equal(npc.content_type, 'fiction');
});

test('POST /api/npcs/:id/memories records an action', async () => {
  await newPlayer('m_recorder');
  const { status, body } = await api.req('POST', '/api/npcs/aruna_stonecutter/memories', {
    player_id: 'm_recorder',
    action: 'touched the stele gently',
    choice: 'asked about the inscription',
    importance: 4,
  });
  assert.equal(status, 201);
  assert.equal(body.memory.npc_id, 'aruna_stonecutter');
  assert.equal(body.memory.player_id, 'm_recorder');
  assert.equal(body.memory.era, 'historical_vijayanagara', 'era defaults to the NPC era');
});

test('memory for an unknown player or NPC returns 404', async () => {
  const noPlayer = await api.req('POST', '/api/npcs/aruna_stonecutter/memories', {
    player_id: 'ghost', action: 'appeared',
  });
  assert.equal(noPlayer.status, 404);

  const noNpc = await api.req('POST', '/api/npcs/ghost_npc/memories', {
    player_id: 'm_recorder', action: 'appeared',
  });
  assert.equal(noNpc.status, 404);
});

test('missing action returns 400 validation error', async () => {
  const { status, body } = await api.req('POST', '/api/npcs/aruna_stonecutter/memories', {
    player_id: 'm_recorder',
  });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.equal(body.error.details[0].field, 'action');
});

test('importance out of range returns 400', async () => {
  const { status, body } = await api.req('POST', '/api/npcs/aruna_stonecutter/memories', {
    player_id: 'm_recorder', action: 'looked around', importance: 99,
  });
  assert.equal(status, 400);
  assert.equal(body.error.details[0].field, 'importance');
});

test('relevance ranking: query match beats raw importance, recency breaks ties', async () => {
  await newPlayer('m_rank');
  const mem = (action, importance, choice) =>
    api.req('POST', '/api/npcs/meera_guide/memories', {
      player_id: 'm_rank', action, choice, importance,
    });

  await mem('pointed at a carved inscription on the wall', 1, null);
  await mem('chatted about the weather', 5, null);
  await mem('warned the player about loose stones', 5, 'stayed on the path');

  const { status, body } = await api.req(
    'GET', '/api/npcs/meera_guide/memories?player_id=m_rank&query=inscription+stones'
  );
  assert.equal(status, 200);
  assert.equal(body.total, 3);
  // scores: inscription(1 + 5×1 + 2 same-era) = 8, stones(5 + 5×1 + 2) = 12, weather(5 + 2) = 7
  const actions = body.memories.map((m) => m.action);
  assert.match(actions[0], /loose stones/, 'highest score first');
  assert.match(actions[1], /inscription/);
  assert.match(actions[2], /weather/, 'lowest score last');
  assert.equal(body.memories[0].score, 12);
});

test('memories can be filtered per player', async () => {
  await newPlayer('m_other');
  await api.req('POST', '/api/npcs/kabir_tea_seller/memories', {
    player_id: 'm_other', action: 'bought masala chai', importance: 3,
  });

  const mine = await api.req('GET', '/api/npcs/kabir_tea_seller/memories?player_id=m_rank');
  assert.equal(mine.body.total, 0, "other players' memories must not leak");

  const theirs = await api.req('GET', '/api/npcs/kabir_tea_seller/memories?player_id=m_other');
  assert.equal(theirs.body.total, 1);
});

test('limit caps the number of returned memories', async () => {
  const { body } = await api.req('GET', '/api/npcs/meera_guide/memories?limit=1');
  assert.equal(body.memories.length, 1);
});

test('invalid limit returns 400', async () => {
  const { status, body } = await api.req('GET', '/api/npcs/meera_guide/memories?limit=0');
  assert.equal(status, 400);
  assert.equal(body.error.details[0].field, 'limit');
});

test('GET /api/players/:id/memories returns everything about one player', async () => {
  const { status, body } = await api.req('GET', '/api/players/m_rank/memories');
  assert.equal(status, 200);
  assert.ok(body.memories.length >= 3);
  assert.ok(body.memories[0].npc_name, 'joins the NPC name for display');
});
