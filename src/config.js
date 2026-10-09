// Central configuration.
// Everything here can be overridden with environment variables (see .env.example).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  // Folder where the project lives (used to locate data/ and public/).
  rootDir,

  // HTTP port the API listens on.
  port: Number(process.env.PORT) || 3000,

  // Path to the SQLite database file.
  // ":memory:" keeps everything in RAM — used by the automated tests.
  dbPath: process.env.DB_PATH || path.join(rootDir, 'data', 'echoes.db'),

  // Set LOG_REQUESTS=0 to silence the request log (the test suite does this).
  logRequests: process.env.LOG_REQUESTS !== '0',
};
