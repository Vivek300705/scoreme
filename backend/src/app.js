import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import routes from './api/routes/index.js';
import { swaggerDocument } from './api/docs/swagger.js';
import { errorHandler } from './api/middlewares/error-handler.js';
import { logger } from './config/logger.js';

export function createApp() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Structured HTTP request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.debug('HTTP Request Handled', {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - start
      });
    });
    next();
  });

  // Swagger Documentation
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  // REST API Routes
  app.use('/api', routes);

  // Root welcome / health redirect
  app.get('/', (req, res) => {
    res.json({
      name: 'FlowGuard – Configurable Workflow Decision & Resilience Engine',
      version: '1.0.0',
      docs: '/api/docs',
      health: '/api/health',
      metrics: '/api/metrics'
    });
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();

