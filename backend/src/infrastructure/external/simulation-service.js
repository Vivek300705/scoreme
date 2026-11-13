import { config } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export const SIMULATION_MODES = Object.freeze({
  NONE: 'NONE',                                 // Always succeed normally
  TIMEOUT: 'TIMEOUT',                           // Always simulate network timeout (retryable)
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',   // HTTP 503 error (retryable)
  RATE_LIMIT: 'RATE_LIMIT',                     // HTTP 429 error (retryable)
  PERMANENT_ERROR: 'PERMANENT_ERROR',           // Non-retryable 400 Bad Request
  FAIL_ONCE_THEN_SUCCEED: 'FAIL_ONCE_THEN_SUCCEED', // Fails attempt 1, succeeds attempt 2
  FAIL_TWICE_THEN_SUCCEED: 'FAIL_TWICE_THEN_SUCCEED' // Fails attempt 1 and 2, succeeds on 3
});

class SimulationService {
  constructor() {
    this.currentMode = config.simulationFailureMode || SIMULATION_MODES.NONE;
    this.latencyMs = config.simulationLatencyMs || 50;
    this.failureCounters = new Map(); // Tracks execution failure counts for transient modes
  }

  setMode(mode, latencyMs = null) {
    if (!Object.values(SIMULATION_MODES).includes(mode)) {
      throw new Error(`Invalid simulation mode: ${mode}. Valid modes: ${Object.values(SIMULATION_MODES).join(', ')}`);
    }
    this.currentMode = mode;
    if (latencyMs !== null) {
      this.latencyMs = latencyMs;
    }
    this.failureCounters.clear();
    logger.info(`Simulation failure mode updated to: ${mode}`, { mode, latencyMs: this.latencyMs });
  }

  getMode() {
    return {
      currentMode: this.currentMode,
      latencyMs: this.latencyMs,
      availableModes: Object.values(SIMULATION_MODES)
    };
  }

  async _delay(ms) {
    const time = ms !== undefined ? ms : this.latencyMs;
    return new Promise(resolve => setTimeout(resolve, time));
  }

  /**
   * Evaluates Credit Bureau external verification.
   * @param {object} payload { applicantName, creditScore, monthlyIncome }
   * @param {number} attemptNumber
   * @param {string} executionId
   */
  async verifyCreditBureau(payload, attemptNumber = 1, executionId = '') {
    const startTime = Date.now();
    await this._delay();

    // Check chaos injection mode
    this._checkChaosSimulation(executionId, attemptNumber, 'credit-bureau-service');

    const score = Number(payload.creditScore || 650);
    let riskTier = 'LOW';
    if (score < 620) riskTier = 'HIGH';
    else if (score < 700) riskTier = 'MODERATE';

    const latencyMs = Date.now() - startTime;
    return {
      status: 'SUCCESS',
      latencyMs,
      data: {
        bureauStatus: 'VERIFIED',
        bureauReference: `CB-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
        verifiedScore: score,
        riskTier,
        verifiedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Evaluates Fraud Detection AI external service.
   * @param {object} payload { claimantName, claimAmount, incidentType, priorClaimsCount }
   * @param {number} attemptNumber
   * @param {string} executionId
   */
  async evaluateFraudRisk(payload, attemptNumber = 1, executionId = '') {
    const startTime = Date.now();
    await this._delay();

    // Check chaos injection mode
    this._checkChaosSimulation(executionId, attemptNumber, 'fraud-detection-service');

    const claimAmount = Number(payload.claimAmount || 0);
    const priorClaims = Number(payload.priorClaimsCount || 0);

    // Dynamic heuristic simulation
    let fraudScore = 15;
    if (priorClaims > 2) fraudScore += 25;
    if (claimAmount > 40000) fraudScore += 25;
    if (payload.incidentType === 'THEFT' && !payload.policeReportFiled) fraudScore += 40;

    const latencyMs = Date.now() - startTime;
    return {
      status: 'SUCCESS',
      latencyMs,
      data: {
        fraudScore: Math.min(100, fraudScore),
        modelConfidence: 0.94,
        anomalyFlags: priorClaims > 3 ? ['FREQUENT_CLAIMANT'] : [],
        evaluatedAt: new Date().toISOString()
      }
    };
  }

  _checkChaosSimulation(executionId, attemptNumber, serviceName) {
    const mode = this.currentMode;

    if (mode === SIMULATION_MODES.NONE) return;

    if (mode === SIMULATION_MODES.TIMEOUT) {
      const err = new Error(`External dependency "${serviceName}" timed out after ${this.latencyMs}ms`);
      err.code = 'ETIMEDOUT';
      err.statusCode = 408;
      err.status = 'TIMEOUT';
      throw err;
    }

    if (mode === SIMULATION_MODES.SERVICE_UNAVAILABLE) {
      const err = new Error(`External dependency "${serviceName}" responded with HTTP 503 Service Unavailable`);
      err.code = 'SERVICE_UNAVAILABLE';
      err.statusCode = 503;
      err.status = 'TEMPORARY_FAILURE';
      throw err;
    }

    if (mode === SIMULATION_MODES.RATE_LIMIT) {
      const err = new Error(`External dependency "${serviceName}" rate limited request (HTTP 429)`);
      err.code = 'RATE_LIMIT';
      err.statusCode = 429;
      err.status = 'TEMPORARY_FAILURE';
      throw err;
    }

    if (mode === SIMULATION_MODES.PERMANENT_ERROR) {
      const err = new Error(`External dependency "${serviceName}" rejected request with unrecoverable 400 Bad Request`);
      err.code = 'PERMANENT_ERROR';
      err.statusCode = 400;
      err.status = 'PERMANENT_FAILURE';
      throw err;
    }

    if (mode === SIMULATION_MODES.FAIL_ONCE_THEN_SUCCEED) {
      const key = `${executionId || 'global'}_${serviceName}`;
      const count = (this.failureCounters.get(key) || 0) + 1;
      this.failureCounters.set(key, count);

      if (count <= 1) {
        const err = new Error(`Simulated transient network glitch on attempt 1 for "${serviceName}"`);
        err.code = 'NETWORK_ERROR';
        err.statusCode = 503;
        err.status = 'TEMPORARY_FAILURE';
        throw err;
      }
    }

    if (mode === SIMULATION_MODES.FAIL_TWICE_THEN_SUCCEED) {
      const key = `${executionId || 'global'}_${serviceName}`;
      const count = (this.failureCounters.get(key) || 0) + 1;
      this.failureCounters.set(key, count);

      if (count <= 2) {
        const err = new Error(`Simulated transient network timeout on attempt ${count} for "${serviceName}"`);
        err.code = 'ETIMEDOUT';
        err.statusCode = 408;
        err.status = 'TIMEOUT';
        throw err;
      }
    }
  }
}

export const simulationService = new SimulationService();

