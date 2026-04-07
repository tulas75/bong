/**
 * @module app
 * Express application factory. Configures middleware (CORS, rate
 * limiting, JSON parsing, logging), registers public and authenticated route
 * mounts, serves static assets, and provides a health-check endpoint and global
 * error handler.
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import { requireApiKey } from './middleware/auth.js';
import { logger } from './lib/logger.js';
import { prismaUnfiltered } from './lib/prisma.js';
import badgesRouter from './routes/badges.js';
import assertionsRouter from './routes/assertions.js';
import webhooksRouter from './routes/webhooks.js';
import publicRouter from './routes/public.js';

const app = express();

// Request access logs
app.use(pinoHttp({ logger, quietReqLogger: true }));

// Rate limiters
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PUBLIC || '60', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_AUTH || '30', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : [];

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'X-Webhook-Signature'],
  }),
);

app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

// Static assets
app.use('/public', express.static(path.join(__dirname, '../public')));

// Landing page
app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BONG — Badge Object Node Gateway</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #062748;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .container {
      text-align: center;
    }
    .logo {
      width: 280px;
      height: auto;
      filter: drop-shadow(0 4px 24px rgba(0, 0, 0, 0.3));
    }
    .version {
      margin-top: 24px;
      color: rgba(255, 255, 255, 0.4);
      font-size: 0.85rem;
      letter-spacing: 0.05em;
    }
  </style>
</head>
<body>
  <div class="container">
    <img src="/public/logo.jpg" alt="BONG Logo" class="logo">
    <p class="version">v1.0.0</p>
  </div>
</body>
</html>`);
});

// Public routes (no auth, public rate limit)
app.use(publicLimiter, publicRouter);

// Protected routes (require X-API-Key, auth rate limit)
app.use('/api/v1/badges', authLimiter, requireApiKey, badgesRouter);
app.use('/api/v1/assertions', authLimiter, requireApiKey, assertionsRouter);
app.use('/api/v1/webhooks', authLimiter, requireApiKey, webhooksRouter);

// Health check with DB connectivity
app.get('/health', async (_req, res) => {
  try {
    await prismaUnfiltered.$queryRawUnsafe('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const safeErr = {
    message: err.message,
    name: err.name,
    stack: err.stack,
  };

  logger.error({ err: safeErr }, 'unhandled_error');
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
