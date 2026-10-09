// Era switching (time travel) and the verified/fiction fact separation.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let api;
before(async () => { api = await startServer(); });
after(async () => { await api.close(); });

async function newPlayer(id) {
  await api.req('POST', '/api/players', { name: `Hero ${id}`, id });
}

// ─────────────────────────── time travel ───────────────────────────
test('GET /api/eras lists both game eras', async () => {
  const { status, body } = await api.req('GET', '/api/eras');
  assert.equal(status, 200);
  assert.deepEqual(body.eras.map((e) => e.id), ['present_hampi', 'historical_vijayanagara']);
});

test('travel switches era, updates the player, and logs history', async () => {
  await newPlayer('t_basic');
  const { status, body } = await api.req('POST', '/api/players/t_basic/travel', {
    to_era: 'historical_vijayanagara', reason: 'quest start',
  });
  assert.equal(status, 200);
  assert.equal(body.player.current_era, 'historical_vijayanagara');

  const history = await api.req('GET', '/api/players/t_basic/travel-history');
  assert.equal(history.body.history.length, 1);
  assert.equal(history.body.history[0].from_era, 'present_hampi');
  assert.equal(history.body.history[0].to_era, 'historical_vijayanagara');
  assert.equal(history.body.history[0].reason, 'quest start');
});

test('traveling to the current era returns 409', async () => {
  await newPlayer('t_same');
  const { status, body } = await api.req('POST', '/api/players/t_same/travel', {
    to_era: 'present_hampi',
  });
  assert.equal(status, 409);
  assert.equal(body.error.code, 'ALREADY_IN_ERA');
});

test('unknown target era returns 400', async () => {
  await newPlayer('t_bad');
  const { status, body } = await api.req('POST', '/api/players/t_bad/travel', {
    to_era: 'ice_age',
  });
  assert.equal(status, 400);
  assert.equal(body.error.details[0].field, 'to_era');
});

test('travel for an unknown player returns 404', async () => {
  const { status, body } = await api.req('POST', '/api/players/ghost/travel', {
    to_era: 'historical_vijayanagara',
  });
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('round trip: there and back records two switches', async () => {
  await newPlayer('t_round');
  await api.req('POST', '/api/players/t_round/travel', { to_era: 'historical_vijayanagara' });
  await api.req('POST', '/api/players/t_round/travel', { to_era: 'present_hampi' });
  const { body } = await api.req('GET', '/api/players/t_round/travel-history');
  assert.equal(body.history.length, 2);
  assert.equal(body.history[0].to_era, 'present_hampi', 'newest first');
});

// ────────────────────── facts: verification split ──────────────────────
test('GET /api/facts returns verified facts only by default', async () => {
  const { status, body } = await api.req('GET', '/api/facts');
  assert.equal(status, 200);
  assert.equal(body.verification, 'verified');
  assert.ok(body.facts.length >= 8, 'seeded verified facts expected');
  for (const fact of body.facts) {
    assert.equal(fact.verification, 'verified');
    assert.ok(fact.source_title, 'verified facts need a source title');
    assert.ok(fact.source_url, 'verified facts need a source URL');
    assert.match(fact.source_url, /^https:\/\//);
  }
});

test('fiction is hidden unless explicitly requested, and carries no sources', async () => {
  const { body } = await api.req('GET', '/api/facts?verification=fiction');
  assert.ok(body.facts.length >= 1);
  for (const fact of body.facts) {
    assert.equal(fact.verification, 'fiction');
    assert.equal(fact.source_title, null, 'fiction must not carry a source title');
    assert.equal(fact.source_url, null, 'fiction must not carry a source URL');
  }

  const all = await api.req('GET', '/api/facts?verification=all');
  const kinds = new Set(all.body.facts.map((f) => f.verification));
  assert.deepEqual([...kinds].sort(), ['fiction', 'verified']);
});

test('facts can be filtered by era', async () => {
  const { body } = await api.req('GET', '/api/facts?era=historical_vijayanagara');
  for (const fact of body.facts) assert.equal(fact.era, 'historical_vijayanagara');
});

test('adding a verified fact without sources returns 400', async () => {
  const { status, body } = await api.req('POST', '/api/facts', {
    statement: 'A claim with no evidence.',
    era: 'both',
    verification: 'verified',
  });
  assert.equal(status, 400);
  const fields = body.error.details.map((d) => d.field).sort();
  assert.deepEqual(fields, ['source_title', 'source_url']);
});

test('adding a verified fact with sources succeeds', async () => {
  const { status, body } = await api.req('POST', '/api/facts', {
    statement: 'Test statement from a real page.',
    era: 'present_hampi',
    verification: 'verified',
    source_title: 'Test Source',
    source_url: 'https://example.com/page',
  });
  assert.equal(status, 201);
  assert.equal(body.fact.verification, 'verified');
  assert.equal(body.fact.source_url, 'https://example.com/page');
});

test('adding a story as fiction strips any supplied sources', async () => {
  const { status, body } = await api.req('POST', '/api/facts', {
    statement: 'The stones whisper names at midnight.',
    era: 'present_hampi',
    verification: 'fiction',
    source_title: 'Made Up Almanac',
    source_url: 'https://example.com/not-a-source',
  });
  assert.equal(status, 201);
  assert.equal(body.fact.verification, 'fiction');
  assert.equal(body.fact.source_title, null, 'sources must be stripped from fiction');
  assert.equal(body.fact.source_url, null);
});

test('invalid source URL returns 400', async () => {
  const { status, body } = await api.req('POST', '/api/facts', {
    statement: 'Bad URL test.',
    era: 'both',
    verification: 'verified',
    source_title: 'Somewhere',
    source_url: 'not-a-url',
  });
  assert.equal(status, 400);
  assert.equal(body.error.details[0].field, 'source_url');
});

test('invalid verification value returns 400', async () => {
  const { status, body } = await api.req('POST', '/api/facts', {
    statement: 'Unverified.',
    era: 'both',
    verification: 'maybe',
  });
  assert.equal(status, 400);
  assert.equal(body.error.details[0].field, 'verification');
});
