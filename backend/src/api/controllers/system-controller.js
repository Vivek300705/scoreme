import { db } from '../../infrastructure/database/store.js';

export async function getHealth(req, res) {
  res.json({
    status: 'HEALTHY',
    service: 'flowguard-decision-engine',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: db.isPostgresConnected ? 'PostgreSQL (Connected)' : 'Transactional Memory Store (Active)'
  });
}

export async function getMetrics(req, res, next) {
  try {
    const metrics = await db.getMetrics();
    res.json({ data: metrics });
  } catch (err) {
    next(err);
  }
}

