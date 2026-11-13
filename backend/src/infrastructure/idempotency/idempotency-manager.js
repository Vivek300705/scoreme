import crypto from 'crypto';
import { db } from '../database/store.js';
import { logger } from '../../config/logger.js';

export class IdempotencyConflictError extends Error {
  constructor(key, message = 'Idempotency key reuse with differing request payload detected') {
    super(message);
    this.name = 'IdempotencyConflictError';
    this.statusCode = 409;
    this.idempotencyKey = key;
  }
}

function sortObject(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortObject(obj[key]);
  }
  return sorted;
}

/**
 * Computes a deterministic SHA-256 hash of the normalized request payload.
 * @param {string} workflowKey
 * @param {object} payload
 * @returns {string} SHA-256 Hex string
 */
export function computeRequestHash(workflowKey, payload) {
  const normalized = {
    workflowKey,
    payload: sortObject(payload || {})
  };

  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

/**
 * Handles incoming idempotency key checking and locking.
 * @param {string} idempotencyKey
 * @param {string} workflowKey
 * @param {object} payload
 * @returns {Promise<{ isExisting: boolean, execution: object|null, record: object }>}
 */
export async function acquireIdempotencyLock(idempotencyKey, workflowKey, payload) {
  if (!idempotencyKey) {
    return { isExisting: false, execution: null, record: null };
  }

  const requestHash = computeRequestHash(workflowKey, payload);

  // Check if idempotency record already exists
  const existingRecord = await db.findIdempotencyRecord(idempotencyKey);

  if (existingRecord) {
    // If request payload hash differs -> 409 CONFLICT!
    if (existingRecord.requestHash !== requestHash) {
      logger.warn('Idempotency key conflict: identical key provided with different request payload', {
        idempotencyKey,
        existingHash: existingRecord.requestHash,
        incomingHash: requestHash
      });
      throw new IdempotencyConflictError(idempotencyKey);
    }

    // Identical key and payload -> Return the existing execution
    logger.info('Idempotent replay detected: returning existing execution record', {
      idempotencyKey,
      executionId: existingRecord.executionId
    });

    const execution = existingRecord.executionId
      ? await db.getExecutionById(existingRecord.executionId)
      : null;

    return {
      isExisting: true,
      execution,
      record: existingRecord
    };
  }

  // Atomically create new PENDING idempotency lock
  try {
    const newRecord = await db.createIdempotencyRecord({
      idempotencyKey,
      requestHash,
      workflowKey,
      status: 'PENDING'
    });

    return {
      isExisting: false,
      execution: null,
      record: newRecord
    };
  } catch (err) {
    // If concurrent request won the race condition to create this unique key
    const raceRecord = await db.findIdempotencyRecord(idempotencyKey);
    if (raceRecord) {
      if (raceRecord.requestHash !== requestHash) {
        throw new IdempotencyConflictError(idempotencyKey);
      }
      const execution = raceRecord.executionId
        ? await db.getExecutionById(raceRecord.executionId)
        : null;
      return {
        isExisting: true,
        execution,
        record: raceRecord
      };
    }
    throw err;
  }
}

/**
 * Finalizes idempotency record after execution finishes.
 * @param {string} idempotencyKey
 * @param {string} executionId
 * @param {number} responseCode
 * @param {object} responseBody
 */
export async function finalizeIdempotencyRecord(idempotencyKey, executionId, responseCode, responseBody) {
  if (!idempotencyKey) return;

  await db.updateIdempotencyRecord(idempotencyKey, {
    executionId,
    status: 'COMPLETED',
    responseCode,
    responseBody
  });
}
