import { app } from './app.js';
import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { db } from './infrastructure/database/store.js';
import { seedDatabase } from './database/seed.js';

async function startServer() {
  try {
    logger.info('Initializing FlowGuard Engine...');
    await db.init();
    await seedDatabase();

    const server = app.listen(config.port, () => {
      logger.info(`FlowGuard server listening on port ${config.port}`, {
        port: config.port,
        env: config.nodeEnv,
        apiPrefix: config.apiPrefix,
        docs: `http://localhost:${config.port}/api/docs`
      });
    });

    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        logger.info('HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error('Failed to start FlowGuard server:', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

startServer();

