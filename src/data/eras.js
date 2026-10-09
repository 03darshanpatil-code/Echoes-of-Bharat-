// The two eras the game can switch between.
// This is game configuration (not history), so it lives in code, not the database.
export const ERAS = [
  {
    id: 'present_hampi',
    name: 'Present-Day Hampi',
    description:
      'The ruins as they stand today: boulder fields, broken temples, and tourists. Starting era for new players.',
  },
  {
    id: 'historical_vijayanagara',
    name: 'Historical Vijayanagara',
    description:
      'The Vijayanagara capital as a living city — the era the player travels back to. All characters here are fictional.',
  },
];

/** Era every brand-new player starts in. */
export const DEFAULT_ERA = 'present_hampi';

/** Allowed value for facts that apply to both eras (e.g. geography). */
export const BOTH_ERAS = 'both';

/** All valid era values for the `facts.era` column. */
export const FACT_ERAS = [ERAS[0].id, ERAS[1].id, BOTH_ERAS];

const ERA_IDS = new Set(ERAS.map((era) => era.id));

/** True when the id matches one of the two game eras. */
export function isKnownEra(eraId) {
  return ERA_IDS.has(eraId);
}

/** Display name for an era id (falls back to the raw id). */
export function eraName(eraId) {
  return ERAS.find((era) => era.id === eraId)?.name ?? eraId;
}

/** List eras for API responses (GET /api/eras). */
export function listEras() {
  return ERAS;
}
