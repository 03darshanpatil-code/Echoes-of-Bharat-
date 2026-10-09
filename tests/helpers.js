// Shared test helper: boots the app on an ephemeral port with an in-memory
// database, and provides a tiny HTTP client for assertions.
//
// IMPORTANT: process.env must be set BEFORE the app module loads (it reads
// env vars once), which is why the app is imported dynamically below.
import http from 'node:http';

process.env.DB_PATH = ':memory:';
process.env.LOG_REQUESTS = '0';

const { createApp } = await import('../src/app.js');

/** Start a fresh server. Every test file calls this once in before(). */
export async function startServer() {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    base,
    /** Fire a JSON request; returns { status, body }. */
    async req(method, path, body) {
      const response = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let data = null;
      try {
        data = await response.json();
      } catch {
        /* non-JSON response (shouldn't happen) */
      }
      return { status: response.status, body: data };
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
