/**
 * @module index
 * Application entry point. Loads environment variables and starts
 * the Express server on the configured {@link PORT}.
 */

import 'dotenv/config';
import app from './app.js';
import { logger } from './lib/logger.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'server_started');
});
