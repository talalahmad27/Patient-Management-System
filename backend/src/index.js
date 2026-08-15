require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { validateConfig } = require('./config');
validateConfig();

const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pool = require('./db');

const app = express();

// Sets a batch of security-related response headers (X-Content-Type-Options,
// Strict-Transport-Security, X-Frame-Options, Referrer-Policy, etc.).
// Browsers enforce these — free protection against clickjacking, MIME sniffing,
// HTTP downgrade attacks.
app.use(helmet());

app.use(express.json());

// Rate limit only /api/* routes. Health endpoints stay unrestricted so uptime
// checks never trip the limit. 300 req / 15 min / IP is ~1 req/3s sustained —
// far above normal use, far below what a scraping bot would do.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: 'draft-7', // adds RateLimit-* headers to responses
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again shortly.' },
});
app.use('/api', apiLimiter);

// Liveness — the process is up. Used by container orchestrators to decide
// whether to restart the pod. Should NOT depend on external services.
app.get('/health/live', (req, res) => {
  res.json({ status: 'ok' });
});

// Readiness — we can serve real traffic. Checks DB + OpenFGA reachability.
// Used by orchestrators to decide whether to route requests to this instance.
app.get('/health/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    return res.status(503).json({ status: 'db_unreachable' });
  }

  try {
    const r = await fetch(`${process.env.FGA_API_URL}/healthz`);
    if (!r.ok) throw new Error(`fga status ${r.status}`);
  } catch (err) {
    return res.status(503).json({ status: 'fga_unreachable' });
  }

  res.json({ status: 'ok' });
});

// Kept for backwards compatibility with anything still hitting /health.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/staff', require('./routes/staff'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/patients', require('./routes/patients'));
app.use('/api/patients/:patientId/notes', require('./routes/notes'));
app.use('/api/appointments', require('./routes/appointments'));

app.use((err, req, res, next) => {
  const errorId = crypto.randomBytes(8).toString('hex');

  // Log only fields we know are safe. Never log the raw err object —
  // it may carry query params / request bodies containing PHI.
  console.error({
    event: 'request_error',
    errorId,
    method: req.method,
    path: req.path,
    status: err.status,
    message: err.message,
    stack: err.stack,
  });

  if (err.status === 401) {
    return res.status(401).json({ error: 'Invalid or missing token', errorId });
  }
  if (err.status === 403) {
    return res.status(403).json({ error: 'Access denied', errorId });
  }

  res.status(500).json({ error: 'Internal server error', errorId });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully...`);

  // Hard cap — if in-flight requests hang past this we force-exit anyway.
  const forceExit = setTimeout(() => {
    console.error('Shutdown timeout exceeded; forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await pool.end();
    console.log('Shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error({ event: 'shutdown_error', message: err.message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
