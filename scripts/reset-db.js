// Deletes the database file and recreates it with seed data.
// Usage: npm run reset
// Stop the server first — otherwise the file may be locked (Windows).
import fs from 'node:fs';
import { config } from '../src/config.js';

if (config.dbPath === ':memory:') {
  console.log('DB_PATH is :memory: — nothing to reset.');
  process.exit(0);
}

try {
  fs.rmSync(config.dbPath, { force: true });
  // WAL sidecar files, if present.
  for (const suffix of ['-wal', '-shm', '-journal']) {
    fs.rmSync(config.dbPath + suffix, { force: true });
  }
  console.log(`Deleted ${config.dbPath}`);
} catch (err) {
  console.error('Could not delete the database. Is the server still running?');
  console.error(err.message);
  process.exit(1);
}

// Re-open (creates tables) and seed reference data.
const { getDb, closeDb } = await import('../src/db/database.js');
const { seedIfEmpty } = await import('../src/db/seed.js');
getDb();
seedIfEmpty();
closeDb();
console.log('Database recreated and seeded. Start the server with: npm start');
