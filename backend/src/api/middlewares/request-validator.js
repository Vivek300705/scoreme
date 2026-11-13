import { z } from 'zod';
import { db } from '../../infrastructure/database/store.js';
import { logger } from '../../config/logger.js';

/**
 * Builds a dynamic Zod schema from a JSON schema object stored in workflow configuration.
 * @param {object} jsonSchema
 * @returns {z.ZodObject}
 */
export function buildZodSchema(jsonSchema) {
  if (!jsonSchema || !jsonSchema.properties) {
    return z.object({}).passthrough();
  }

  const shape = {};
  const required = jsonSchema.required || [];

  for (const [key, prop] of Object.entries(jsonSchema.properties)) {
    let fieldSchema;

    switch (prop.type) {
      case 'string':
        fieldSchema = z.string();
        if (prop.minLength !== undefined) {
          fieldSchema = fieldSchema.min(prop.minLength, `${key} must be at least ${prop.minLength} characters`);
        }
        if (prop.enum) {
          fieldSchema = z.enum(prop.enum);
        }
        break;

      case 'number':
        fieldSchema = z.number();
        if (prop.minimum !== undefined) {
          fieldSchema = fieldSchema.min(prop.minimum, `${key} must be at least ${prop.minimum}`);
        }
        if (prop.maximum !== undefined) {
          fieldSchema = fieldSchema.max(prop.maximum, `${key} must not exceed ${prop.maximum}`);
        }
        break;

      case 'integer':
        fieldSchema = z.number().int();
        if (prop.minimum !== undefined) {
          fieldSchema = fieldSchema.min(prop.minimum, `${key} must be at least ${prop.minimum}`);
        }
        if (prop.maximum !== undefined) {
          fieldSchema = fieldSchema.max(prop.maximum, `${key} must not exceed ${prop.maximum}`);
        }
        break;

      case 'boolean':
        fieldSchema = z.boolean();
        break;

      case 'array':
        fieldSchema = z.array(z.any());
        break;

      default:
        fieldSchema = z.any();
    }

    if (!required.includes(key)) {
      fieldSchema = fieldSchema.optional();
    }

    shape[key] = fieldSchema;
  }

  return z.object(shape);
}

/**
 * Express middleware to validate execution requests against workflow schema.
 */
export async function validateWorkflowInput(req, res, next) {
  const workflowKey = req.params.id || req.body.workflowKey;
  if (!workflowKey) {
    return res.status(400).json({
      error: 'Missing workflow key in request path or body.'
    });
  }

  const workflow = await db.getWorkflowByKey(workflowKey);
  if (!workflow) {
    return res.status(404).json({
      error: `Workflow "${workflowKey}" not found.`
    });
  }

  const versions = await db.getWorkflowVersions(workflow.id);
  const activeVersion = versions.find(v => v.status === 'ACTIVE') || versions[0];
  if (!activeVersion || !activeVersion.inputSchema) {
    return next();
  }

  try {
    const zodSchema = buildZodSchema(activeVersion.inputSchema);
    const parsed = zodSchema.parse(req.body);
    req.body = parsed; // sanitized data
    next();
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues.map(i => ({
        field: i.path.join('.'),
        message: i.message,
        code: i.code
      }));

      logger.warn(`Request intake validation failed for workflow "${workflowKey}"`, { issues });

      return res.status(400).json({
        error: 'Input validation failed',
        workflowKey,
        version: activeVersion.version,
        details: issues
      });
    }
    next(err);
  }
}

