/* Echoes of Bharat — dashboard logic (plain JS, no framework).
   Every button here is a thin wrapper over the same HTTP API Unity calls. */
'use strict';

// ─────────────────────────── app state ───────────────────────────
const state = {
  players: [],
  npcs: [],
  quests: [],
  eras: [],
  activePlayerId: null,
  currentQuestId: null,
  currentNpcId: null,
  log: [],
};

const $ = (id) => document.getElementById(id);

// ─────────────────────────── helpers ───────────────────────────
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

let toastTimer = null;
function toast(message, kind = 'success') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 4500);
}

function activePlayer() {
  return state.players.find((p) => p.id === state.activePlayerId) ?? null;
}

/** The single HTTP entry point — logs every call for the Request log tab. */
async function api(method, path, body) {
  const started = performance.now();
  let response, text, data;
  try {
    response = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    text = await response.text();
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    addLog(method, path, 0, 0, { error: { message: 'Network error — is the backend running?' } });
    throw new Error('Cannot reach the API. Is the backend running?');
  }
  addLog(method, path, response.status, performance.now() - started, data);

  if (!response.ok) {
    const message = data?.error?.message ?? `HTTP ${response.status}`;
    const details = data?.error?.details
      ? '\n' + data.error.details.map((d) => `• ${d.field}: ${d.issue}`).join('\n')
      : '';
    throw new Error(`${data?.error?.code ? `[${data.error.code}] ` : ''}${message}${details}`);
  }
  return data;
}

function addLog(method, path, status, ms, data) {
  state.log.unshift({ method, path, status, ms, data, at: new Date().toLocaleTimeString() });
  if (state.log.length > 100) state.log.pop();
  renderLog();
}

function renderLog() {
  const container = $('request-log');
  if (!state.log.length) {
    container.innerHTML = '<p class="hint">No requests yet.</p>';
    return;
  }
  container.innerHTML = state.log.map((entry) => {
    const cls = entry.status >= 500 ? 'status-5' : entry.status >= 400 ? 'status-4' : 'status-2';
    const json = JSON.stringify(entry.data, null, 2);
    return `<div class="log-entry">
      <span class="hint">${esc(entry.at)}</span>
      <b>${esc(entry.method)}</b> ${esc(entry.path)}
      <span class="${cls}"><b>${entry.status || 'ERR'}</b></span>
      <span class="hint">${entry.ms.toFixed(0)}ms</span>
      <pre>${esc(json.length > 2500 ? json.slice(0, 2500) + ' …' : json)}</pre>
    </div>`;
  }).join('');
}

/** Run an action, show a toast on failure — the standard button handler. */
async function run(action, successMessage) {
  try {
    const result = await action();
    if (successMessage) toast(successMessage);
    return result;
  } catch (err) {
    toast(err.message, 'error');
    return null;
  }
}

// ─────────────────────────── loading data ───────────────────────────
async function loadHealth() {
  const el = $('health');
  try {
    const data = await api('GET', '/api/health');
    el.textContent = `API ${data.status} · eras: ${data.era_config.join(', ')}`;
    el.className = 'health ok';
  } catch {
    el.textContent = 'API offline';
    el.className = 'health bad';
  }
}

async function loadEras() {
  const data = await api('GET', '/api/eras');
  state.eras = data.eras;
  // Every era <select> on the page, except fact-era (has a 'both' option).
  for (const id of ['new-player-era', 'clue-era', 'mem-era']) {
    $(id).innerHTML = state.eras
      .map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`)
      .join('');
  }
  renderEraCards();
}

async function loadPlayers(selectId) {
  const data = await api('GET', '/api/players');
  state.players = data.players;
  const select = $('player-select');
  select.innerHTML = '<option value="">— none —</option>' + state.players
    .map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.id)})</option>`)
    .join('');

  if (selectId ?? state.activePlayerId) {
    const wanted = selectId ?? state.activePlayerId;
    if (state.players.some((p) => p.id === wanted)) select.value = wanted;
  }
  state.activePlayerId = select.value || null;
  renderPlayerSummary();
}

async function loadPlayerState() {
  if (!state.activePlayerId) {
    $('player-state').textContent = 'Select a player first.';
    return;
  }
  const data = await api('GET', `/api/players/${state.activePlayerId}`);
  $('player-state').textContent = JSON.stringify(data.player, null, 2);
  renderPlayerSummary(data.player);
}

async function loadQuests() {
  const data = await api('GET', '/api/quests');
  state.quests = data.quests;
  const select = $('quest-select');
  select.innerHTML = state.quests
    .map((q) => `<option value="${esc(q.id)}">${esc(q.title)}</option>`)
    .join('');
  if (state.currentQuestId && state.quests.some((q) => q.id === state.currentQuestId)) {
    select.value = state.currentQuestId;
  }
  state.currentQuestId = select.value || null;
  await renderQuestProgress();
}

async function loadNpcs() {
  const data = await api('GET', '/api/npcs');
  state.npcs = data.npcs;
  const select = $('npc-select');
  select.innerHTML = state.npcs
    .map((n) => `<option value="${esc(n.id)}">${esc(n.name)}</option>`)
    .join('');
  if (state.currentNpcId && state.npcs.some((n) => n.id === state.currentNpcId)) {
    select.value = state.currentNpcId;
  }
  state.currentNpcId = select.value || null;
  renderNpcInfo();
}

async function loadFacts() {
  const verification = $('fact-filter').value;
  const era = $('fact-era').value;
  const params = new URLSearchParams({ verification });
  if (era) params.set('era', era);
  const data = await api('GET', `/api/facts?${params}`);
  $('fact-summary').textContent =
    `— ${data.summary.verified} verified, ${data.summary.fiction} fiction in database`;
  renderFacts(data.facts);
}

async function loadHistory() {
  if (!state.activePlayerId) {
    $('travel-history').textContent = 'Select a player first.';
    return;
  }
  const data = await api('GET', `/api/players/${state.activePlayerId}/travel-history`);
  if (!data.history.length) {
    $('travel-history').textContent = 'No travels yet.';
    return;
  }
  $('travel-history').innerHTML = `
    <table>
      <tr><th>From</th><th>To</th><th>When</th><th>Reason</th></tr>
      ${data.history.map((h) => `<tr>
        <td>${esc(h.from_era)}</td>
        <td>${esc(h.to_era)}</td>
        <td>${esc(new Date(h.switched_at).toLocaleString())}</td>
        <td>${esc(h.reason || '—')}</td>
      </tr>`).join('')}
    </table>`;
}

// ─────────────────────────── rendering ───────────────────────────
function renderPlayerSummary(full) {
  const player = full ?? activePlayer();
  const el = $('player-summary');
  if (!player) {
    el.textContent = 'No player selected — create one above.';
    return;
  }
  if (!full) {
    el.textContent = `${player.name} · era: ${player.current_era}`;
    return;
  }
  const clueCount = player.clues?.length ?? 0;
  const activeQuest = player.quests?.find((q) => q.status === 'in_progress');
  el.textContent =
    `${player.name} · era: ${player.current_era} · clues: ${clueCount}` +
    ` · memories: ${player.memory_count}` +
    (activeQuest ? ` · quest: ${activeQuest.title} step ${activeQuest.current_step}/${activeQuest.total_steps}` : '');
}

function renderNpcInfo() {
  const npc = state.npcs.find((n) => n.id === state.currentNpcId);
  $('npc-info').textContent = npc ? `${npc.role} · era: ${npc.era} · (fictional character)` : '';
}

async function renderQuestProgress() {
  const container = $('quest-progress');
  const details = $('quest-details');
  const quest = state.quests.find((q) => q.id === state.currentQuestId);

  if (!quest) {
    details.innerHTML = '';
    container.innerHTML = '';
    return;
  }

  details.innerHTML = `
    <p class="hint">${esc(quest.description)}</p>
    <ol>${quest.steps.map((s) => `<li class="todo">${esc(s)}</li>`).join('')}</ol>`;

  if (!state.activePlayerId) {
    container.innerHTML = '<p class="hint">Select a player to see quest progress.</p>';
    return;
  }
  const data = await api('GET', `/api/players/${state.activePlayerId}/quests`);
  const progress = data.progress.find((p) => p.quest_id === quest.id);

  if (!progress) {
    container.innerHTML = '<p class="status-line">Not started for this player.</p>';
    $('quest-step').value = 0;
    return;
  }

  const total = quest.steps.length;
  const done = progress.status === 'completed' ? total : progress.current_step;
  const pct = Math.round((done / total) * 100);
  container.innerHTML = `
    <p class="status-line">
      Status: <b>${esc(progress.status)}</b> — step ${done} / ${total}
      ${progress.completed_at ? `· finished ${esc(new Date(progress.completed_at).toLocaleString())}` : ''}
    </p>
    <div class="bar"><span style="width:${pct}%"></span></div>`;

  details.querySelector('ol').innerHTML = quest.steps
    .map((s, i) => `<li class="${i < done ? 'done' : 'todo'}">${esc(s)}${i < done ? ' ✓' : ''}</li>`)
    .join('');
  $('quest-step').value = done;
}

function renderEraCards() {
  const player = activePlayer();
  $('current-era').textContent = player
    ? `Current era: ${state.eras.find((e) => e.id === player.current_era)?.name ?? player.current_era}`
    : 'Select a player to travel.';
  $('era-cards').innerHTML = state.eras.map((era) => {
    const isCurrent = player?.current_era === era.id;
    return `<div class="era-card ${isCurrent ? 'current' : ''}">
      <h3>${esc(era.name)}</h3>
      <p>${esc(era.description)}</p>
      <button class="btn ${isCurrent ? '' : 'primary'}" data-travel="${esc(era.id)}" ${isCurrent ? 'disabled' : ''}>
        ${isCurrent ? 'You are here' : `Travel to ${esc(era.name)}`}
      </button>
    </div>`;
  }).join('');

  for (const btn of $('era-cards').querySelectorAll('[data-travel]')) {
    btn.addEventListener('click', () => travelTo(btn.dataset.travel));
  }
}

function renderFacts(facts) {
  if (!facts.length) {
    $('facts-table').innerHTML = '<p class="hint">No facts match this filter.</p>';
    return;
  }
  $('facts-table').innerHTML = `
    <table>
      <tr><th>#</th><th>Statement</th><th>Era</th><th>Type</th><th>Source</th></tr>
      ${facts.map((f) => `<tr>
        <td>${f.id}</td>
        <td class="fact-statement">${esc(f.statement)}</td>
        <td>${esc(f.era)}</td>
        <td><span class="badge ${esc(f.verification)}">${esc(f.verification)}</span></td>
        <td>${f.source_url
          ? `<a href="${esc(f.source_url)}" target="_blank" rel="noopener">${esc(f.source_title)}</a>`
          : '<span class="hint">none (story content)</span>'}</td>
      </tr>`).join('')}
    </table>`;
}

function renderMemoryResults(data) {
  const container = $('memory-results');
  if (!data.memories.length) {
    container.innerHTML = '<p class="hint">No memories stored yet — record one on the left.</p>';
    return;
  }
  container.innerHTML = `
    <p class="hint">${data.total} memory(ies) for <b>${esc(data.npc.name)}</b>${data.query ? `, ranked for "${esc(data.query)}"` : ''}</p>
    ${data.memories.map((m) => `
      <div class="mem-item">
        <div class="score">score ${m.score} · importance ${m.importance}</div>
        <div><b>${esc(m.action)}</b>${m.choice ? ` — chose: ${esc(m.choice)}` : ''}</div>
        <div class="meta">${esc(m.era)} · ${esc(new Date(m.created_at).toLocaleString())}</div>
      </div>`).join('')}`;
}

// ─────────────────────────── actions ───────────────────────────
async function setActivePlayer(playerId) {
  state.activePlayerId = playerId || null;
  renderPlayerSummary();
  renderEraCards();
  $('travel-history').textContent = playerId ? 'Loading…' : 'Select a player first.';
  await Promise.all([
    loadPlayerState(),
    renderQuestProgress(),
    ...(playerId ? [loadHistory()] : []),
  ]);
}

async function travelTo(eraId) {
  if (!state.activePlayerId) return toast('Create/select a player first', 'error');
  const result = await run(
    () => api('POST', `/api/players/${state.activePlayerId}/travel`, {
      to_era: eraId,
      reason: $('travel-reason').value || undefined,
    }),
    `Time travel complete → ${eraId}`
  );
  if (result) {
    await loadPlayers(state.activePlayerId);
    await setActivePlayer(state.activePlayerId);
  }
}

// ─────────────────────────── event wiring ───────────────────────────
function bindUI() {
  // Tabs
  for (const btn of document.querySelectorAll('.tab-btn')) {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      btn.classList.add('active');
      $(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  }

  // Player bar
  $('player-select').addEventListener('change', (e) => setActivePlayer(e.target.value));
  $('btn-refresh-players').addEventListener('click', () => run(() => loadPlayers()));
  $('create-player-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { name: $('new-player-name').value.trim(), era: $('new-player-era').value };
    const id = $('new-player-id').value.trim();
    if (id) body.id = id;
    const result = await run(() => api('POST', '/api/players', body));
    if (result) {
      $('new-player-name').value = '';
      $('new-player-id').value = '';
      await loadPlayers(result.player.id);
      await setActivePlayer(result.player.id);
      toast(`Player "${result.player.name}" created`);
    }
  });

  // Players tab
  $('btn-load-state').addEventListener('click', () => run(() => loadPlayerState()));
  $('add-clue-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.activePlayerId) return toast('Create/select a player first', 'error');
    const body = {
      clue_key: $('clue-key').value.trim(),
      label: $('clue-label').value.trim(),
      from_era: $('clue-era').value || undefined,
    };
    const result = await run(() => api('POST', `/api/players/${state.activePlayerId}/clues`, body));
    if (result) {
      $('clue-key').value = '';
      $('clue-label').value = '';
      await loadPlayerState();
      toast(`Clue "${result.clue.clue_key}" collected`);
    }
  });

  // Quests tab
  $('quest-select').addEventListener('change', async (e) => {
    state.currentQuestId = e.target.value;
    await renderQuestProgress();
  });
  $('btn-reload-quests').addEventListener('click', () => run(() => loadQuests()));

  const questAction = (action, successMessage) => async () => {
    if (!state.activePlayerId) return toast('Create/select a player first', 'error');
    if (!state.currentQuestId) return toast('No quest selected', 'error');
    const base = `/api/players/${state.activePlayerId}/quests/${state.currentQuestId}`;
    const result = await run(() => api('POST', base + action.path, action.body?.()), successMessage);
    if (result) await renderQuestProgress();
  };
  $('btn-quest-start').addEventListener('click',
    questAction({ path: '/start' }, 'Quest started'));
  $('btn-quest-advance').addEventListener('click',
    questAction({ path: '/advance', body: () => ({}) }, 'Advanced to next step'));
  $('btn-quest-setstep').addEventListener('click',
    questAction({ path: '/advance', body: () => ({ step: Number($('quest-step').value) }) }, 'Step updated'));
  $('btn-quest-complete').addEventListener('click',
    questAction({ path: '/complete' }, 'Quest completed!'));

  $('create-quest-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      title: $('quest-title').value.trim(),
      description: $('quest-desc').value.trim(),
      steps: $('quest-steps').value.split('\n').map((s) => s.trim()).filter(Boolean),
    };
    const id = $('quest-id').value.trim();
    if (id) body.id = id;
    const result = await run(() => api('POST', '/api/quests', body));
    if (result) {
      e.target.reset();
      state.currentQuestId = result.quest.id;
      await loadQuests();
      toast(`Quest "${result.quest.title}" created`);
    }
  });

  // Memory tab
  $('npc-select').addEventListener('change', (e) => {
    state.currentNpcId = e.target.value;
    renderNpcInfo();
  });
  $('record-memory-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.activePlayerId) return toast('Create/select a player first', 'error');
    if (!state.currentNpcId) return toast('No NPC selected', 'error');
    const body = {
      player_id: state.activePlayerId,
      action: $('mem-action').value.trim(),
      importance: Number($('mem-importance').value),
      era: $('mem-era').value || undefined,
    };
    const choice = $('mem-choice').value.trim();
    if (choice) body.choice = choice;
    const result = await run(
      () => api('POST', `/api/npcs/${state.currentNpcId}/memories`, body),
      'Memory recorded'
    );
    if (result) {
      $('mem-action').value = '';
      $('mem-choice').value = '';
      await loadPlayerState();
    }
  });
  $('retrieve-memories-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.currentNpcId) return toast('No NPC selected', 'error');
    const params = new URLSearchParams({ limit: $('mem-limit').value });
    if (state.activePlayerId) params.set('player_id', state.activePlayerId);
    const query = $('mem-query').value.trim();
    if (query) params.set('query', query);
    const data = await run(() => api('GET', `/api/npcs/${state.currentNpcId}/memories?${params}`));
    if (data) renderMemoryResults(data);
  });

  // Travel tab
  $('btn-load-facts')?.addEventListener('click', () => run(() => loadFacts()));
  $('fact-filter').addEventListener('change', () => run(() => loadFacts()));
  $('fact-era').addEventListener('change', () => run(() => loadFacts()));
  $('fact-verification').addEventListener('change', (e) => {
    $('fact-source-fields').style.display = e.target.value === 'fiction' ? 'none' : '';
  });
  $('add-fact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      statement: $('fact-statement').value.trim(),
      era: $('fact-new-era').value,
      verification: $('fact-verification').value,
    };
    if (body.verification === 'verified') {
      body.source_title = $('fact-source-title').value.trim();
      body.source_url = $('fact-source-url').value.trim();
    }
    const result = await run(() => api('POST', '/api/facts', body));
    if (result) {
      e.target.reset();
      $('fact-verification').value = 'verified';
      $('fact-source-fields').style.display = '';
      await loadFacts();
      toast('Fact saved');
    }
  });

  // Log tab
  $('btn-clear-log').addEventListener('click', () => {
    state.log = [];
    renderLog();
  });
}

// ─────────────────────────── boot ───────────────────────────
async function init() {
  bindUI();
  await loadHealth();
  try {
    await loadEras();
    await loadPlayers();
    await Promise.all([loadQuests(), loadNpcs(), loadFacts()]);
    if (state.activePlayerId) await setActivePlayer(state.activePlayerId);
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
