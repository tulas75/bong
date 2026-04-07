/**
 * @module logger
 * Structured logging via Pino. Exports a root {@link logger} and
 * an {@link audit} child logger for security-relevant events.
 */

import pino from 'pino';

/** Root Pino logger. Log level is controlled by the `LOG_LEVEL` env var (default `info`). */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: { target: 'pino/file', options: { destination: 1 } },
    formatters: {
      level: (label: string) => ({ level: label }),
    },
  }),
});

/** Audit child logger — automatically adds `{ component: 'audit' }` to every entry. */
export const audit = logger.child({ component: 'audit' });
