import { simulationService } from '../../infrastructure/external/simulation-service.js';

export function getFailureMode(req, res) {
  res.json({ data: simulationService.getMode() });
}

export function setFailureMode(req, res, next) {
  try {
    const { mode, latencyMs } = req.body;
    simulationService.setMode(mode, latencyMs);
    res.json({
      message: `Simulation mode updated to ${mode}`,
      data: simulationService.getMode()
    });
  } catch (err) {
    next(err);
  }
}

