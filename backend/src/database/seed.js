import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../infrastructure/database/store.js';
import { logger } from '../config/logger.js';
import { workflowOrchestrator } from '../domain/engine/workflow-orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function seedDatabase() {
  await db.init();
  logger.info('Starting FlowGuard database seeding...');

  const workflowsDir = path.resolve(__dirname, '../workflows');

  // 1. Seed Loan Approval Workflow V1
  const loanV1Raw = fs.readFileSync(path.join(workflowsDir, 'loan-approval.v1.json'), 'utf8');
  const loanV1Config = JSON.parse(loanV1Raw);

  let loanWorkflow = await db.getWorkflowByKey(loanV1Config.workflowKey);
  if (!loanWorkflow) {
    loanWorkflow = await db.createWorkflow({
      workflowKey: loanV1Config.workflowKey,
      name: loanV1Config.name,
      description: loanV1Config.description
    });
  }

  let loanV1 = await db.getWorkflowVersion(loanWorkflow.id, 1);
  if (!loanV1) {
    loanV1 = await db.createWorkflowVersion({
      workflowId: loanWorkflow.id,
      version: 1,
      status: 'ACTIVE',
      inputSchema: loanV1Config.inputSchema,
      stages: loanV1Config.stages
    });
    await db.activateWorkflowVersion(loanWorkflow.id, 1);
  }

  // 2. Seed Loan Approval Workflow V2 (Draft)
  const loanV2Raw = fs.readFileSync(path.join(workflowsDir, 'loan-approval.v2.json'), 'utf8');
  const loanV2Config = JSON.parse(loanV2Raw);

  let loanV2 = await db.getWorkflowVersion(loanWorkflow.id, 2);
  if (!loanV2) {
    loanV2 = await db.createWorkflowVersion({
      workflowId: loanWorkflow.id,
      version: 2,
      status: 'DRAFT',
      inputSchema: loanV2Config.inputSchema,
      stages: loanV2Config.stages
    });
  }

  // 3. Seed Insurance Claim Workflow V1
  const claimV1Raw = fs.readFileSync(path.join(workflowsDir, 'insurance-claim.v1.json'), 'utf8');
  const claimV1Config = JSON.parse(claimV1Raw);

  let claimWorkflow = await db.getWorkflowByKey(claimV1Config.workflowKey);
  if (!claimWorkflow) {
    claimWorkflow = await db.createWorkflow({
      workflowKey: claimV1Config.workflowKey,
      name: claimV1Config.name,
      description: claimV1Config.description
    });
  }

  let claimV1 = await db.getWorkflowVersion(claimWorkflow.id, 1);
  if (!claimV1) {
    claimV1 = await db.createWorkflowVersion({
      workflowId: claimWorkflow.id,
      version: 1,
      status: 'ACTIVE',
      inputSchema: claimV1Config.inputSchema,
      stages: claimV1Config.stages
    });
    await db.activateWorkflowVersion(claimWorkflow.id, 1);
  }

  logger.info('Workflows and versions seeded successfully.');

  // 4. Seed initial realistic executions if none exist
  const existingExecutions = await db.listExecutions({ limit: 5 });
  if (existingExecutions.length === 0) {
    logger.info('Generating sample realistic executions for initial analytics...');

    // 1. Successful loan approval
    await workflowOrchestrator.execute('loan-approval', {
      applicantName: 'Eleanor Vance',
      age: 34,
      monthlyIncome: 65000,
      requestedAmount: 250000,
      creditScore: 780,
      employmentStatus: 'EMPLOYED',
      existingMonthlyDebt: 8000
    }, { idempotencyKey: 'SEED-LOAN-HAPPY-01' });

    // 2. Business rejection (Credit score too low)
    await workflowOrchestrator.execute('loan-approval', {
      applicantName: 'Arthur Pendelton',
      age: 29,
      monthlyIncome: 45000,
      requestedAmount: 180000,
      creditScore: 540,
      employmentStatus: 'EMPLOYED',
      existingMonthlyDebt: 12000
    }, { idempotencyKey: 'SEED-LOAN-REJECT-01' });

    // 3. Manual review loan
    await workflowOrchestrator.execute('loan-approval', {
      applicantName: 'Samantha Ray',
      age: 41,
      monthlyIncome: 52000,
      requestedAmount: 300000,
      creditScore: 660,
      employmentStatus: 'SELF_EMPLOYED',
      existingMonthlyDebt: 9500
    }, { idempotencyKey: 'SEED-LOAN-REVIEW-01' });

    // 4. Successful insurance claim
    await workflowOrchestrator.execute('insurance-claim', {
      policyNumber: 'POL-99281-X',
      claimantName: 'Marcus Aurelius',
      claimAmount: 4200,
      incidentType: 'WEATHER',
      incidentDate: '2026-10-12',
      policeReportFiled: false,
      priorClaimsCount: 1,
      policyAgeMonths: 24
    }, { idempotencyKey: 'SEED-CLAIM-HAPPY-01' });

    logger.info('Sample executions seeded successfully.');
  }

  logger.info('Database seeding completed.');
}

// Run standalone if invoked directly
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDatabase().then(() => {
    logger.info('Seeding script finished.');
    process.exit(0);
  }).catch(err => {
    logger.error('Seeding script failed:', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

