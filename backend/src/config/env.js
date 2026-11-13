import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiPrefix: process.env.API_PREFIX || '/api',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/flowguard?schema=public',
  dbDialect: process.env.DB_DIALECT || 'postgres',
  idempotencyExpirySeconds: parseInt(process.env.IDEMPOTENCY_EXPIRY_SECONDS || '86400', 10),
  defaultMaxRetries: parseInt(process.env.DEFAULT_MAX_RETRIES || '3', 10),
  defaultInitialBackoffMs: parseInt(process.env.DEFAULT_INITIAL_BACKOFF_MS || '300', 10),
  defaultBackoffMultiplier: parseInt(process.env.DEFAULT_BACKOFF_MULTIPLIER || '2', 10),
  simulationLatencyMs: parseInt(process.env.SIMULATION_LATENCY_MS || '50', 10),
  simulationFailureMode: process.env.SIMULATION_FAILURE_MODE || 'NONE',
};

