// Builds the Express application. Split from server.js so the test suite can
// import createApp() and listen on an ephemeral port without side effects.
import express from 'express';
import path from 'node:path';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { config } from './config.js';
import { getDb } from './db/database.js';
import { seedIfEmpty } from './db/seed.js';

export function createApp() {
  // Open the database (creates tables on first run) and seed reference data.
  getDb();
  seedIfEmpty();

  const app = express();
  app.disable('x-powered-by');

  // Allow browser tools (and the dashboard if ever hosted elsewhere) to call
  // the API. Unity does not need CORS — it is not a browser.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use(express.json({ limit: '100kb' }));

  // One-line request log: "POST /api/players 201 3ms"
  if (config.logRequests) {
    app.use((req, res, next) => {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
      });
      next();
    });
  }

  app.use('/api', routes);
  app.use('/api', notFoundHandler); // unknown API paths → JSON 404

  // Testing dashboard + any other static files.
  app.use(express.static(path.join(config.rootDir, 'public')));

  // Last: unknown non-API paths get the JSON 404 too (no HTML error pages).
  app.use(notFoundHandler);
  app.use(errorHandler); // must be registered after every route

  return app;
}
