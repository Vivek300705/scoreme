import { db } from '../../infrastructure/database/store.js';

export async function listWorkflows(req, res, next) {
  try {
    const workflows = await db.listWorkflows();
    res.json({ data: workflows });
  } catch (err) {
    next(err);
  }
}

export async function getWorkflow(req, res, next) {
  try {
    const { id } = req.params;
    const workflow = (await db.getWorkflowByKey(id)) || (await db.getWorkflowById(id));
    if (!workflow) {
      return res.status(404).json({ error: `Workflow "${id}" not found` });
    }
    res.json({ data: workflow });
  } catch (err) {
    next(err);
  }
}

export async function createWorkflow(req, res, next) {
  try {
    const { workflowKey, name, description, stages, inputSchema, version = 1 } = req.body;
    if (!workflowKey || !name) {
      return res.status(400).json({ error: 'workflowKey and name are required' });
    }

    let existing = await db.getWorkflowByKey(workflowKey);
    let workflow;
    if (!existing) {
      workflow = await db.createWorkflow({ workflowKey, name, description });
    } else {
      workflow = existing;
    }

    const newVersion = await db.createWorkflowVersion({
      workflowId: workflow.id,
      version,
      status: 'ACTIVE',
      inputSchema: inputSchema || {},
      stages: stages || []
    });

    await db.activateWorkflowVersion(workflow.id, version);

    const complete = await db.getWorkflowById(workflow.id);
    res.status(201).json({ data: complete });
  } catch (err) {
    next(err);
  }
}

export async function getWorkflowVersions(req, res, next) {
  try {
    const { id } = req.params;
    const workflow = (await db.getWorkflowByKey(id)) || (await db.getWorkflowById(id));
    if (!workflow) {
      return res.status(404).json({ error: `Workflow "${id}" not found` });
    }

    const versions = await db.getWorkflowVersions(workflow.id);
    res.json({ data: versions });
  } catch (err) {
    next(err);
  }
}

export async function activateWorkflowVersion(req, res, next) {
  try {
    const { id } = req.params;
    const { version } = req.body;
    if (!version) {
      return res.status(400).json({ error: 'version number is required' });
    }

    const workflow = (await db.getWorkflowByKey(id)) || (await db.getWorkflowById(id));
    if (!workflow) {
      return res.status(404).json({ error: `Workflow "${id}" not found` });
    }

    const activated = await db.activateWorkflowVersion(workflow.id, Number(version));
    res.json({
      message: `Workflow "${workflow.workflowKey}" version ${version} successfully activated`,
      data: activated
    });
  } catch (err) {
    next(err);
  }
}

