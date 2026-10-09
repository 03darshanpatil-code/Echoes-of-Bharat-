// Entry point: `npm start` runs this file.
import { createApp } from './app.js';
import { config } from './config.js';
import { closeDb } from './db/database.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log('');
  console.log('  Echoes of Bharat — backend is running');
  console.log(`  API:     http://localhost:${config.port}/api/health`);
  console.log(`  Dashboard: http://localhost:${config.port}/`);
  console.log(`  Database:  ${config.dbPath}`);
  console.log('');
});

// Close the database cleanly on Ctrl+C so WAL files are flushed.
function shutdown() {
  console.log('\nShutting down…');
  server.close(() => {
    closeDb();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
