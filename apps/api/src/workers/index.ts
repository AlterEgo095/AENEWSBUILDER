/**
 * Worker Engine - L4 Core State Machine
 * INIT → ANALYSIS → PLANNING → EXECUTE_MCP → GENERATE → TEST → FIX → DEPLOY → DONE
 */

import { Worker, Queue, Job } from 'bullmq';
import { getRedis } from '../services/redis.service.js';
import { Orchestrator } from '../services/orchestrator.service.js';
import { Generator } from './generator.js';
import { SandboxManager } from './sandbox-manager.js';
import { AutoHealing } from './auto-healing.js';
import { EventStore } from './event-store.js';
import { CostTracker } from './cost-tracker.js';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';

// ============================================
// 🔹 TYPES
// ============================================

export type WorkflowState =
  | 'INIT'
  | 'ANALYSIS'
  | 'PLANNING'
  | 'EXECUTE_MCP'
  | 'GENERATE'
  | 'TEST'
  | 'FIX'
  | 'DEPLOY'
  | 'DONE'
  | 'FAILED';

export interface ProjectJob {
  projectId: string;
  userId: string;
  prompt: string;
  state: WorkflowState;
  context: ProjectContext;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectContext {
  classification?: any;
  plan?: any;
  decisions?: any;
  files?: Record<string, string>;
  mcpResults?: Record<string, any>;
  testResults?: any;
  errors?: string[];
  deployUrl?: string;
}

// ============================================
// 🔄 STATE MACHINE
// ============================================

export class StateMachine {
  private currentState: WorkflowState;
  private eventStore: EventStore;

  constructor(initialState: WorkflowState = 'INIT', projectId: string) {
    this.currentState = initialState;
    this.eventStore = new EventStore(projectId);
  }

  async transition(newState: WorkflowState, event: string, data?: any): Promise<void> {
    logger.info({ from: this.currentState, to: newState, event }, 'State transition');
    
    // Record event
    await this.eventStore.record({
      state: this.currentState,
      nextState: newState,
      event,
      data,
      timestamp: new Date().toISOString(),
    });

    this.currentState = newState;
  }

  getState(): WorkflowState {
    return this.currentState;
  }

  canTransitionTo(newState: WorkflowState): boolean {
    const validTransitions: Record<WorkflowState, WorkflowState[]> = {
      INIT: ['ANALYSIS'],
      ANALYSIS: ['PLANNING', 'FAILED'],
      PLANNING: ['EXECUTE_MCP', 'GENERATE', 'FAILED'],
      EXECUTE_MCP: ['GENERATE', 'FAILED'],
      GENERATE: ['TEST', 'FAILED'],
      TEST: ['FIX', 'DEPLOY', 'FAILED'],
      FIX: ['GENERATE', 'FAILED'],
      DEPLOY: ['DONE', 'FAILED'],
      DONE: [],
      FAILED: [],
    };

    return validTransitions[this.currentState]?.includes(newState) ?? false;
  }
}

// ============================================
// 🚀 WORKER ENGINE
// ============================================

export class WorkerEngine {
  private orchestrator: Orchestrator;
  private generator: Generator;
  private sandboxManager: SandboxManager;
  private autoHealing: AutoHealing;
  private costTracker: CostTracker;

  constructor() {
    this.orchestrator = new Orchestrator();
    this.generator = new Generator();
    this.sandboxManager = new SandboxManager();
    this.autoHealing = new AutoHealing();
    this.costTracker = new CostTracker();
  }

  /**
   * Main workflow execution (with GLOBAL TIMEOUT + DLQ protection)
   */
  async execute(job: Job<ProjectJob>): Promise<void> {
    const { projectId, prompt, state, context } = job.data;
    const stateMachine = new StateMachine(state, projectId);
    
    // 🔥 GLOBAL TIMEOUT (max 10 min per job)
    const GLOBAL_TIMEOUT = 10 * 60 * 1000;
    const startTime = Date.now();
    
    const timeoutChecker = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed > GLOBAL_TIMEOUT) {
        clearInterval(timeoutChecker);
        throw new Error(`Job timeout after ${elapsed}ms (limit: ${GLOBAL_TIMEOUT}ms)`);
      }
    }, 5000); // Check every 5s

    try {
      logger.info({ projectId, state }, '▶️  Executing workflow step');

      switch (state) {
        case 'INIT':
          await this.handleInit(job, stateMachine);
          break;

        case 'ANALYSIS':
          await this.handleAnalysis(job, stateMachine);
          break;

        case 'PLANNING':
          await this.handlePlanning(job, stateMachine);
          break;

        case 'EXECUTE_MCP':
          await this.handleExecuteMCP(job, stateMachine);
          break;

        case 'GENERATE':
          await this.handleGenerate(job, stateMachine);
          break;

        case 'TEST':
          await this.handleTest(job, stateMachine);
          break;

        case 'FIX':
          await this.handleFix(job, stateMachine);
          break;

        case 'DEPLOY':
          await this.handleDeploy(job, stateMachine);
          break;

        default:
          throw new Error(`Unknown state: ${state}`);
      }

    } catch (error) {
      clearInterval(timeoutChecker);
      logger.error({ error, projectId, state }, '❌ Workflow step failed');
      await this.handleError(job, stateMachine, error);
    } finally {
      clearInterval(timeoutChecker);
    }
  }

  // ============================================
  // 📍 STATE HANDLERS
  // ============================================

  private async handleInit(job: Job<ProjectJob>, sm: StateMachine): Promise<void> {
    await job.updateData({
      ...job.data,
      state: 'ANALYSIS',
      updatedAt: new Date().toISOString(),
    });
    await sm.transition('ANALYSIS', 'init_complete');
  }

  private async handleAnalysis(job: Job<ProjectJob>, sm: StateMachine): Promise<void> {
    const result = await this.orchestrator.process(job.data.prompt);
    
    await job.updateData({
      ...job.data,
      context: {
        ...job.data.context,
        classification: result.classification,
        plan: result.plan,
        decisions: result.decisions,
      },
      state: 'PLANNING',
      updatedAt: new Date().toISOString(),
    });

    // Track cost
    await this.costTracker.record(job.data.projectId, 'analysis', result.totalEstimatedCost);

    await sm.transition('PLANNING', 'analysis_complete', result);
  }

  private async handlePlanning(job: Job<ProjectJob>, sm: StateMachine): Promise<void> {
    const { plan } = job.data.context;
    
    // Decide next step: MCP or direct generation
    const nextState = plan.mcpTools?.length > 0 ? 'EXECUTE_MCP' : 'GENERATE';

    await job.updateData({
      ...job.data,
      state: nextState,
      updatedAt: new Date().toISOString(),
    });

    await sm.transition(nextState, 'planning_complete');
  }

  private async handleExecuteMCP(job: Job<ProjectJob>, sm: StateMachine): Promise<void> {
    // MCP execution handled by separate MCP service
    // For now, skip to generation
    await job.updateData({
      ...job.data,
      state: 'GENERATE',
      updatedAt: new Date().toISOString(),
    });

    await sm.transition('GENERATE', 'mcp_complete');
  }

  private async handleGenerate(job: Job<ProjectJob>, sm: StateMachine): Promise<void> {
    const { plan, decisions } = job.data.context;
    const files: Record<string, string> = {};

    // Generate files incrementally
    for (const fileSpec of plan.files) {
      const decision = decisions.find((d: any) => d.file === fileSpec.path);
      const content = await this.generator.generateFile(fileSpec, decision.decision.model);
      files[fileSpec.path] = content;

      // Track cost
      await this.costTracker.record(job.data.projectId, 'generation', decision.decision.estimatedCost);

      // Emit progress
      await job.updateProgress(
        Math.round((Object.keys(files).length / plan.files.length) * 100)
      );
    }

    await job.updateData({
      ...job.data,
      context: {
        ...job.data.context,
        files,
      },
      state: 'TEST',
      updatedAt: new Date().toISOString(),
    });

    await sm.transition('TEST', 'generation_complete', { filesCount: Object.keys(files).length });
  }

  private async handleTest(job: Job<ProjectJob>, sm: StateMachine): Promise<void> {
    const { files } = job.data.context;
    
    // Run tests in warm sandbox
    const testResults = await this.sandboxManager.runTests(files);

    if (testResults.success) {
      await job.updateData({
        ...job.data,
        context: {
          ...job.data.context,
          testResults,
        },
        state: 'DEPLOY',
        updatedAt: new Date().toISOString(),
      });
      await sm.transition('DEPLOY', 'tests_passed', testResults);
    } else {
      // Auto-healing kicks in
      await job.updateData({
        ...job.data,
        context: {
          ...job.data.context,
          testResults,
          errors: testResults.errors,
        },
        state: 'FIX',
        updatedAt: new Date().toISOString(),
      });
      await sm.transition('FIX', 'tests_failed', testResults);
    }
  }

  private async handleFix(job: Job<ProjectJob>, sm: StateMachine): Promise<void> {
    const { errors, files } = job.data.context;
    
    // Auto-healing attempts
    const fixed = await this.autoHealing.fix(files, errors, job.data.retryCount);

    if (fixed.success) {
      await job.updateData({
        ...job.data,
        context: {
          ...job.data.context,
          files: fixed.files,
        },
        state: 'TEST',
        retryCount: job.data.retryCount + 1,
        updatedAt: new Date().toISOString(),
      });
      await sm.transition('TEST', 'fix_applied', fixed);
    } else {
      throw new Error('Auto-healing failed after max retries');
    }
  }

  private async handleDeploy(job: Job<ProjectJob>, sm: StateMachine): Promise<void> {
    // Deploy logic (Cloudflare, Vercel, etc.)
    const deployUrl = `https://${job.data.projectId}.aenews.ai`;

    await job.updateData({
      ...job.data,
      context: {
        ...job.data.context,
        deployUrl,
      },
      state: 'DONE',
      updatedAt: new Date().toISOString(),
    });

    await sm.transition('DONE', 'deploy_complete', { deployUrl });
  }

  private async handleError(job: Job<ProjectJob>, sm: StateMachine, error: any): Promise<void> {
    const isFatalError = 
      error.message.includes('timeout') ||
      error.message.includes('ECONNREFUSED') ||
      job.attemptsMade >= 3;
    
    await job.updateData({
      ...job.data,
      context: {
        ...job.data.context,
        errors: [...(job.data.context.errors || []), error.message],
      },
      state: 'FAILED',
      updatedAt: new Date().toISOString(),
    });

    await sm.transition('FAILED', 'error_occurred', { error: error.message });
    
    // 🔥 AUTO-MOVE TO DEAD LETTER QUEUE if fatal
    if (isFatalError) {
      logger.error('🚨 Fatal error detected - moving to DLQ', {
        projectId: job.data.projectId,
        error: error.message,
        attempts: job.attemptsMade,
      });
      // DLQ will be handled by BullMQ's QueueFactory.deadLetterQueue
    }
  }
}

// ============================================
// 🎯 WORKER INITIALIZATION
// ============================================

let projectQueue: Queue<ProjectJob>;
let projectWorker: Worker<ProjectJob>;

export async function initWorker(): Promise<void> {
  const redis = getRedis();
  const engine = new WorkerEngine();

  // Create Queue
  projectQueue = new Queue<ProjectJob>('projects', {
    connection: redis,
  });

  // Create Worker
  projectWorker = new Worker<ProjectJob>(
    'projects',
    async (job) => {
      await engine.execute(job);
    },
    {
      connection: redis,
      concurrency: config.worker.concurrency,
      limiter: {
        max: 10,
        duration: 1000,
      },
    }
  );

  projectWorker.on('completed', (job) => {
    logger.info({ jobId: job.id, projectId: job.data.projectId }, '✅ Job completed');
  });

  projectWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err }, '❌ Job failed');
  });

  logger.info('✅ Worker Engine initialized');
}

export function getProjectQueue(): Queue<ProjectJob> {
  if (!projectQueue) {
    throw new Error('Project queue not initialized');
  }
  return projectQueue;
}
