// Seeds reference data into an empty database: NPCs, the default quest, and
// historical facts. Runs automatically on server start and is idempotent
// (INSERT OR IGNORE), so running it twice never duplicates rows.
//
// ── Historical facts policy ──────────────────────────────────────────────
// Every row with verification='verified' was transcribed from a page fetched
// from an authoritative source (UNESCO or the Archaeological Survey of India)
// whose URL is stored next to the statement. Do NOT add "facts" from memory —
// fetch the source page first and keep the wording close to the original.
// Everything else is verification='fiction' (story content) and carries no
// source. The API keeps the two categories strictly separated.
import { getDb, now } from './database.js';

const UNESCO = {
  source_title: 'Group of Monuments at Hampi — UNESCO World Heritage Centre',
  source_url: 'https://whc.unesco.org/en/list/241/',
};

const ASI = {
  source_title: 'Hampi (1986), Karnataka — Archaeological Survey of India',
  source_url: 'https://asi.nic.in/pages/WorldHeritageHampi',
};

/** Verified facts. Wording stays close to the fetched source pages. */
const VERIFIED_FACTS = [
  {
    statement: 'Hampi was the last capital of the last great Hindu Kingdom of Vijayanagar.',
    era: 'historical_vijayanagara',
    ...UNESCO,
  },
  {
    statement:
      'The city was conquered by the Deccan Muslim confederacy in 1565, pillaged over a period of six months, and then abandoned.',
    era: 'historical_vijayanagara',
    ...UNESCO,
  },
  {
    statement:
      'The site holds more than 1600 surviving remains, including forts, temples, shrines, pillared halls, gateways and water structures.',
    era: 'both',
    ...UNESCO,
  },
  {
    statement: 'The property encompasses an area of 4,187.24 hectares in the Tungabhadra basin in Central Karnataka.',
    era: 'both',
    ...UNESCO,
  },
  {
    statement:
      'The monuments of Vijayanagara city were built between AD 1336 and 1570, from the time of Harihara I to Sadasiva Raya.',
    era: 'historical_vijayanagara',
    ...ASI,
  },
  {
    statement:
      'A large number of royal buildings were raised by Krishnadeva Raya (AD 1509–30), the greatest ruler of the dynasty according to the ASI.',
    era: 'historical_vijayanagara',
    ...ASI,
  },
  {
    statement: 'Hampi is situated on the southern bank of the river Tungabhadra.',
    era: 'both',
    ...ASI,
  },
  {
    statement:
      'The ancient city covers an area of nearly 26 square kilometres and is stated to be enclosed by seven lines of fortifications.',
    era: 'historical_vijayanagara',
    ...ASI,
  },
];

/** Fictional story content. No sources — it is invented for the game. */
const FICTION = [
  {
    statement: 'The Memory of Stone is a stele that keeps the memory of anyone who touches it.',
    era: 'historical_vijayanagara',
  },
  {
    statement: 'Old Kabir claims the stones hum at dusk. He has believed this for forty years.',
    era: 'present_hampi',
  },
];

/** Fictional NPCs. Their memories are written by the game, never by historians. */
const NPCS = [
  {
    id: 'aruna_stonecutter',
    name: 'Aruna the Stonecutter',
    era: 'historical_vijayanagara',
    role: 'Royal-quarter stonecutter who carves inscriptions',
  },
  {
    id: 'leela_ferrywoman',
    name: 'Leela the Ferrywoman',
    era: 'historical_vijayanagara',
    role: 'Ferries travellers across the Tungabhadra',
  },
  {
    id: 'meera_guide',
    name: 'Meera the Site Guide',
    era: 'present_hampi',
    role: 'Guides visitors through the ruins',
  },
  {
    id: 'kabir_tea_seller',
    name: 'Old Kabir the Tea Seller',
    era: 'present_hampi',
    role: 'Sells tea among the boulder fields',
  },
];

/** The main quest. Steps are plain strings — the game decides what they mean. */
const QUEST = {
  id: 'memory_of_stone',
  title: 'The Memory of Stone',
  description:
    'A broken inscription in present-day Hampi remembers a story nobody wrote down. Follow it back to the living city and return with the full memory.',
  steps: [
    'Examine the weathered inscription among the ruins',
    'Ask Meera about the broken stone marker',
    'Travel to Historical Vijayanagara',
    'Speak with Aruna the Stonecutter',
    'Return to Present-Day Hampi with the memory',
  ],
};

/** Insert all seed data. Safe to call on every boot. */
export function seedIfEmpty() {
  const db = getDb();
  const ts = now();

  for (const npc of NPCS) {
    db.prepare(
      `INSERT OR IGNORE INTO npcs (id, name, era, role, content_type)
       VALUES (?, ?, ?, ?, 'fiction')`
    ).run(npc.id, npc.name, npc.era, npc.role);
  }

  db.prepare(
    `INSERT OR IGNORE INTO quests (id, title, description, content_type, steps_json, created_at)
     VALUES (?, ?, ?, 'fiction', ?, ?)`
  ).run(QUEST.id, QUEST.title, QUEST.description, JSON.stringify(QUEST.steps), ts);

  const insertFact = db.prepare(
    `INSERT INTO facts (statement, era, verification, source_title, source_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const fact of [...VERIFIED_FACTS, ...FICTION]) {
    // Dedupe by statement so re-seeding never duplicates facts.
    const exists = db
      .prepare('SELECT 1 FROM facts WHERE statement = ?')
      .get(fact.statement);
    if (exists) continue;
    insertFact.run(
      fact.statement,
      fact.era,
      fact.source_url ? 'verified' : 'fiction',
      fact.source_url ? fact.source_title : null,
      fact.source_url ? fact.source_url : null,
      ts
    );
  }
}
