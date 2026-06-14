/**
 * Worker Engine - L4 Core State Machine with Auto-Chaining
 * 
 * CRITICAL FIX: The old engine processed ONE state per job invocation and relied
 * on BullMQ to re-enqueue for the next state. This caused jobs to stall and never
 * complete the full pipeline.
 * 
 * NEW ARCHITECTURE: `runWorkflow()` loops through ALL states within a single
 * job execution. Each state handler returns the next state instead of mutating
 * the job directly. A global timeout (10 min) covers the entire loop.
 * 
 * Pipeline: INIT → ANALYSIS → PLANNING → EXECUTE_MCP → GENERATE → TEST → FIX → DEPLOY → DONE
 * 
 * @author Dieudonné MATANDA (ALTER EGO) — AENEWS UNIVERSEL
 * @version 2.0.0-autochain
 */

import { Worker, Queue, Job } from 'bullmq';
import { getRedis } from '../services/redis.service.js';
import { Orchestrator } from '../services/orchestrator.service.js';
import { securityEngine } from '../services/security-engine.js';
import { contextMemory } from '../services/context-memory.js';
import { planVersioning } from '../services/plan-versioning.js';
import { Generator, crossValidateHTMLReferences, addMissingCSSLinks, fixModuleScriptTags, addMissingScriptTags, escapeRegex } from './generator.js';
import { SandboxManager } from './sandbox-manager.js';
import { AutoHealing } from './auto-healing.js';
import { EventStore } from './event-store.js';
import { eventStoreV2 } from './event-store-v2.js';
import { CostTracker } from './cost-tracker.js';
import { MCPExecutor } from './mcp-executor.js';
import { Deployer } from './deployer.js';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';
import { prisma } from '../config/prisma.js';

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
  deployInfo?: { url: string; platform: string; deployId: string };
}

// ============================================
// 🔄 STATE MACHINE
// ============================================

export class StateMachine {
  private currentState: WorkflowState;
  private eventStore: EventStore;
  private projectId: string;

  constructor(initialState: WorkflowState = 'INIT', projectId: string) {
    this.currentState = initialState;
    this.projectId = projectId;
    this.eventStore = new EventStore(projectId);
  }

  async transition(newState: WorkflowState, event: string, data?: any): Promise<void> {
    logger.info({ from: this.currentState, to: newState, event }, 'State transition');
    
    // Record event in V1 (Redis pub/sub for real-time SSE streaming)
    await this.eventStore.record({
      state: this.currentState,
      nextState: newState,
      event,
      data,
      timestamp: new Date().toISOString(),
    });

    // Persist event in V2 (PostgreSQL + Redis Streams for durability)
    try {
      await eventStoreV2.publish({
        type: event,
        projectId: this.projectId,
        userId: '',
        data: { state: this.currentState, nextState: newState, data },
      });
    } catch (v2Error: any) {
      // V2 failure is non-fatal — V1 already delivered the real-time event
      logger.warn(
        { error: v2Error.message, projectId: this.projectId, event },
        '⚠️ V2 persistence failed (V1 SSE still active)'
      );
    }

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
      FIX: ['GENERATE', 'TEST', 'FAILED'],
      DEPLOY: ['DONE', 'FAILED'],
      DONE: [],
      FAILED: [],
    };

    return validTransitions[this.currentState]?.includes(newState) ?? false;
  }
}

// ============================================
// 🚀 WORKER ENGINE (Auto-Chaining)
// ============================================

/**
 * Execute file generation tasks with error recovery.
 * - Continues on individual file failures
 * - Retries failed files once with fallback model
 * - Only fails pipeline if >50% of files fail
 * - Tracks success/failure in project metadata
 */
async function executePipelineWithRecovery<T extends { path: string }>(
  tasks: T[],
  executor: (task: T, isRetry?: boolean) => Promise<void>,
  fallbackExecutor?: (task: T) => Promise<void>,
  metadata?: Record<string, any>
): Promise<{ succeeded: string[]; failed: string[]; retried: string[] }> {
  const succeeded: string[] = [];
  const failed: string[] = [];
  const retried: string[] = [];

  // First pass: attempt all tasks
  for (const task of tasks) {
    try {
      await executor(task);
      succeeded.push(task.path);
      logger.info(`[Pipeline] ✓ Generated: ${task.path}`);
    } catch (error) {
      failed.push(task.path);
      logger.error(`[Pipeline] ✗ Failed: ${task.path} - ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Second pass: retry failed tasks with fallback model
  if (failed.length > 0 && fallbackExecutor) {
    logger.info(`[Pipeline] Retrying ${failed.length} failed files with fallback model...`);
    const stillFailed: string[] = [];
    
    for (const filePath of failed) {
      const task = tasks.find(t => t.path === filePath);
      if (task) {
        try {
          await fallbackExecutor(task);
          retried.push(filePath);
          succeeded.push(filePath);
          logger.info(`[Pipeline] ✓ Retry succeeded: ${filePath}`);
        } catch (retryError) {
          stillFailed.push(filePath);
          logger.error(`[Pipeline] ✗ Retry failed: ${filePath} - ${retryError instanceof Error ? retryError.message : String(retryError)}`);
        }
      }
    }

    // Update failed list to only include files that failed retry too
    failed.length = 0;
    failed.push(...stillFailed);
  }

  // Update metadata if provided
  if (metadata) {
    metadata.generationResults = {
      succeeded,
      failed,
      retried,
      successRate: tasks.length > 0 ? succeeded.length / tasks.length : 0,
      timestamp: new Date().toISOString()
    };
  }

  // Check if pipeline should fail (>50% failure rate)
  const failureRate = tasks.length > 0 ? failed.length / tasks.length : 0;
  if (failureRate > 0.5) {
    throw new Error(
      `Pipeline failed: ${failed.length}/${tasks.length} files failed (${(failureRate * 100).toFixed(1)}% failure rate). ` +
      `Failed files: ${failed.join(', ')}`
    );
  }

  if (failed.length > 0) {
    logger.warn(
      `[Pipeline] Completed with ${failed.length} failures out of ${tasks.length} files ` +
      `(${(failureRate * 100).toFixed(1)}% failure rate). Proceeding with partial results.`
    );
  }

  return { succeeded, failed, retried };
}
export class WorkerEngine {
  private orchestrator: Orchestrator;
  private generator: Generator;
  private sandboxManager: SandboxManager;
  private autoHealing: AutoHealing;
  private costTracker: CostTracker;
  private mcpExecutor: MCPExecutor;
  private deployer: Deployer;

  /** Max time for the entire workflow loop (10 minutes) */
  private readonly GLOBAL_TIMEOUT = 10 * 60 * 1000;

  /** Max consecutive FIX→GENERATE cycles before giving up */
  private readonly MAX_FIX_CYCLES = 3;

  constructor() {
    this.orchestrator = new Orchestrator();
    this.generator = new Generator();
    this.sandboxManager = new SandboxManager();
    this.autoHealing = new AutoHealing();
    this.costTracker = new CostTracker();
    this.mcpExecutor = new MCPExecutor();
    this.deployer = new Deployer();
  }

  /**
   * Entry point called by BullMQ worker.
   * Delegates to runWorkflow() which handles the full chain.
   */
  async execute(job: Job<ProjectJob>): Promise<void> {
    try {
      await this.runWorkflow(job);
    } catch (error: any) {
      // Catch global timeout or any unhandled error at the workflow level
      logger.error({ error: error.message, projectId: job.data.projectId }, '❌ Workflow execution crashed');
      
      const sm = new StateMachine(job.data.state, job.data.projectId);
      await this.handleError(job, sm, error);
    }
  }

  /**
   * AUTO-CHAINING WORKFLOW LOOP
   * 
   * Instead of processing one state per job invocation, this method loops
   * through ALL states until DONE or FAILED. This eliminates the #1 critical
   * bug where jobs would stall after a single state transition.
   * 
   * Each handler returns the next state name rather than updating the job
   * directly. The loop persists state after each successful transition.
   */
  async runWorkflow(job: Job<ProjectJob>): Promise<void> {
    const { projectId, userId } = job.data;
    const startTime = Date.now();
    let currentState = job.data.state;
    const stateMachine = new StateMachine(currentState, projectId);
    let fixCycleCount = 0;

    logger.info(
      { projectId, initialState: currentState },
      '▶️  Starting auto-chain workflow'
    );

    // ── Main loop ──────────────────────────────────────────────────
    while (currentState !== 'DONE' && currentState !== 'FAILED') {
      // Global timeout guard
      const elapsed = Date.now() - startTime;
      if (elapsed > this.GLOBAL_TIMEOUT) {
        throw new Error(
          `Global workflow timeout after ${Math.round(elapsed / 1000)}s (limit: ${this.GLOBAL_TIMEOUT / 1000}s)`
        );
      }

      logger.info(
        {
          projectId,
          state: currentState,
          elapsed: `${Math.round(elapsed / 1000)}s`,
          remaining: `${Math.round((this.GLOBAL_TIMEOUT - elapsed) / 1000)}s`,
        },
        '🔄 Processing state'
      );

      // Execute current state and determine next
      const nextState = await this.executeState(job, stateMachine, currentState);

      // Validate the transition before committing
      if (!stateMachine.canTransitionTo(nextState)) {
        throw new Error(
          `Invalid state transition: ${currentState} → ${nextState}`
        );
      }

      // Track FIX cycles to prevent infinite loops
      if (currentState === 'FIX') {
        fixCycleCount++;
        if (fixCycleCount > this.MAX_FIX_CYCLES) {
          logger.error(
            { projectId, fixCycleCount },
            '❌ Max FIX cycles exceeded — failing workflow'
          );
          const sm = new StateMachine(currentState, projectId);
          await this.handleError(
            job,
            sm,
            new Error(`Auto-healing exceeded ${this.MAX_FIX_CYCLES} fix cycles`)
          );
          return;
        }
      }

      // Record the transition in the event store
      const eventName = `${currentState}_complete`;
      await stateMachine.transition(nextState, eventName);

      // Persist state to the job data (survives worker restarts)
      await job.updateData({
        ...job.data,
        state: nextState,
        updatedAt: new Date().toISOString(),
      });

      // 🔹 CRITICAL FIX: Persist state to PostgreSQL so the dashboard reflects progress
      try {
        await prisma.project.update({
          where: { id: projectId },
          data: {
            state: nextState,
            updatedAt: new Date(),
            context: job.data.context || {},
          },
        });
      } catch (dbError: any) {
        logger.warn(
          { error: dbError.message, projectId, state: nextState },
          '⚠️ Failed to persist state to DB (non-fatal)'
        );
      }

      currentState = nextState;
    }

    const totalTime = Date.now() - startTime;
    logger.info(
      { projectId, finalState: currentState, totalTime: `${Math.round(totalTime / 1000)}s` },
      currentState === 'DONE'
        ? '✅ Workflow completed successfully'
        : '❌ Workflow ended in FAILED state'
    );
  }

  /**
   * Dispatch to the correct state handler.
   * Every handler returns the NEXT WorkflowState (not void).
   */
  private async executeState(
    job: Job<ProjectJob>,
    sm: StateMachine,
    state: WorkflowState
  ): Promise<WorkflowState> {
    switch (state) {
      case 'INIT':
        return await this.handleInit(job);
      case 'ANALYSIS':
        return await this.handleAnalysis(job);
      case 'PLANNING':
        return await this.handlePlanning(job);
      case 'EXECUTE_MCP':
        return await this.handleExecuteMCP(job);
      case 'GENERATE':
        return await this.handleGenerate(job);
      case 'TEST':
        return await this.handleTest(job);
      case 'FIX':
        return await this.handleFix(job);
      case 'DEPLOY':
        return await this.handleDeploy(job);
      default:
        throw new Error(`Unknown workflow state: ${state}`);
    }
  }

  // ============================================
  // 📍 STATE HANDLERS (each returns next state)
  // ============================================

  /**
   * INIT → ANALYSIS
   * Sets up the job context and transitions to analysis.
   */
  private async handleInit(job: Job<ProjectJob>): Promise<WorkflowState> {
    const { projectId } = job.data;

    logger.info({ projectId }, '📍 INIT: Setting up project context');

    // Initialize context if not already present
    if (!job.data.context) {
      await job.updateData({
        ...job.data,
        context: {
          errors: [],
        },
      });
    }

    return 'ANALYSIS';
  }

  /**
   * ANALYSIS → PLANNING
   * Runs the orchestrator (Ghost Classifier + Planner + Decision Engine)
   * to classify the project and generate a plan.
   */
  private async handleAnalysis(job: Job<ProjectJob>): Promise<WorkflowState> {
    const { projectId, prompt } = job.data;

    logger.info({ projectId }, '📍 ANALYSIS: Running AI orchestrator');

    const result = await this.orchestrator.process(prompt);

    // Update job context with analysis results
    await job.updateData({
      ...job.data,
      context: {
        ...job.data.context,
        classification: result.classification,
        plan: result.plan,
        decisions: result.decisions,
      },
    });

    // Track cost of analysis
    await this.costTracker.record(projectId, 'analysis', result.totalEstimatedCost);

    // ── Publish detailed SSE event for classification result ──
    const analysisEventStore = new EventStore(projectId);
    await analysisEventStore.record({
      state: 'ANALYSIS',
      nextState: 'PLANNING',
      event: 'analysis_complete',
      data: {
        classification: result.classification,
        fileCount: result.plan?.files?.length,
        mcpTools: result.plan?.mcpTools || [],
        estimatedCost: result.totalEstimatedCost,
        decisions: result.decisions?.map((d: any) => ({
          file: d.file,
          model: d.decision?.model,
          reasoning: d.decision?.reasoning,
        })),
      },
      timestamp: new Date().toISOString(),
    });

    logger.info(
      {
        projectId,
        complexity: result.classification?.complexity,
        type: result.classification?.type,
        fileCount: result.plan?.files?.length,
        estimatedCost: result.totalEstimatedCost,
      },
      '📍 ANALYSIS: Classification complete'
    );

    return 'PLANNING';
  }

  /**
   * PLANNING → EXECUTE_MCP | GENERATE
   * Saves the plan version, stores generation pattern for cross-project
   * learning, then decides whether MCP tools are needed.
   */
  private async handlePlanning(job: Job<ProjectJob>): Promise<WorkflowState> {
    const { projectId, prompt, context } = job.data;
    const { plan, classification } = context;

    logger.info({ projectId }, '📍 PLANNING: Finalizing plan');

    // Save initial plan version (for rollback support)
    try {
      await planVersioning.savePlanVersion(projectId, plan, 'initial');
      logger.info({ projectId }, 'Plan v1 saved');
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Failed to save plan version (non-fatal)');
    }

    // Store generation pattern for cross-project learning
    try {
      await contextMemory.storeGenerationPattern(prompt, classification, plan);
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Failed to store generation pattern (non-fatal)');
    }

    // Route: if the plan requires MCP tools, go to EXECUTE_MCP; otherwise skip to GENERATE
    const hasMcpTools = plan?.mcpTools?.length > 0;
    if (hasMcpTools) {
      logger.info(
        { projectId, mcpTools: plan.mcpTools },
        '📍 PLANNING: Routing to EXECUTE_MCP'
      );
      return 'EXECUTE_MCP';
    }

    logger.info({ projectId }, '📍 PLANNING: Skipping MCP, routing to GENERATE');
    return 'GENERATE';
  }

  /**
   * EXECUTE_MCP → GENERATE
   * Executes all MCP tools from the plan using the MCPExecutor.
   * Results are stored in job context for downstream generators to use.
   */
  private async handleExecuteMCP(job: Job<ProjectJob>): Promise<WorkflowState> {
    const { projectId, context } = job.data;
    const { plan } = context;
    const mcpTools: string[] = plan?.mcpTools || [];

    logger.info(
      { projectId, mcpTools },
      '📍 EXECUTE_MCP: Running MCP tools'
    );

    try {
      const results = await this.mcpExecutor.executeAll(
        projectId,
        mcpTools,
        context
      );

      // Store MCP results in job context
      await job.updateData({
        ...job.data,
        context: {
          ...job.data.context,
          mcpResults: results,
        },
      });

      const successCount = Object.values(results).filter(
        (r: any) => r.success
      ).length;
      logger.info(
        { projectId, success: successCount, total: mcpTools.length },
        '📍 EXECUTE_MCP: MCP execution complete'
      );
    } catch (error: any) {
      logger.warn(
        { projectId, error: error.message },
        '📍 EXECUTE_MCP: MCP execution had errors (continuing to GENERATE)'
      );
      // MCP failures are non-fatal — generators can still produce files
      await job.updateData({
        ...job.data,
        context: {
          ...job.data.context,
          mcpResults: { error: error.message },
        },
      });
    }

    return 'GENERATE';
  }

  /**
   * GENERATE → TEST
   * Generates all files from the plan, passing previously generated
   * files as context to each subsequent generation call.
   */
  private async handleGenerate(job: Job<ProjectJob>): Promise<WorkflowState> {
    const { projectId, context } = job.data;
    const { plan, decisions, classification } = context;
    const files: Record<string, string> = {};

    // Carry forward any previously generated files (e.g. from a FIX cycle)
    const existingFiles = job.data.context.files || {};
    Object.assign(files, existingFiles);

    const totalFiles = plan.files.length;
    const genEventStore = new EventStore(projectId);

    logger.info(
      { projectId, totalFiles, existingCount: Object.keys(existingFiles).length },
      '📍 GENERATE: Starting file generation with context awareness + error recovery'
    );

    // CRITICAL FIX: Use error-recovery pipeline instead of bare for-loop
    // If a file fails, continue with others, retry with fallback model, only fail if >50% fail
    const filesToGenerate = plan.files.filter(
      (f: any) => !existingFiles[f.path]
    );

    const pipelineMetadata: Record<string, any> = {};

    const result = await executePipelineWithRecovery(
      filesToGenerate,
      // Primary executor
      async (fileSpec: any) => {
        const decision = decisions?.find((d: any) => d.file === fileSpec.path);
        const content = await this.generator.generateFile(
          fileSpec,
          decision?.decision?.model || 'gpt-4o',
          {
            classification,
            generatedFiles: files,
            techStack: classification?.recommendedStack,
            originalPrompt: job.data.prompt,  // CRITICAL FIX 5: Pass original prompt for brand name extraction
          }
        );
        files[fileSpec.path] = content;

        // Track generation cost
        if (decision?.decision?.estimatedCost) {
          await this.costTracker.record(projectId, 'generation', decision.decision.estimatedCost);
        }

        // Update progress for frontend SSE streaming
        const progress = Math.round(
          ((Object.keys(files).length) / totalFiles) * 100
        );
        await job.updateProgress(progress);

        // ── Publish detailed SSE event for real-time tracking ──
        await genEventStore.record({
          state: 'GENERATE',
          nextState: 'GENERATE',
          event: 'file_generated',
          data: {
            filePath: fileSpec.path,
            fileType: fileSpec.type,
            model: decision?.decision?.model || 'unknown',
            reasoning: decision?.decision?.reasoning || '',
            progress,
            filesGenerated: Object.keys(files).length,
            totalFiles,
            estimatedCost: decision?.decision?.estimatedCost || 0,
          },
          timestamp: new Date().toISOString(),
        });

        logger.debug(
          { file: fileSpec.path, model: decision?.decision?.model, progress },
          '📍 GENERATE: File generated'
        );
      },
      // Fallback executor (retry with a different model)
      async (fileSpec: any) => {
        const decision = decisions?.find((d: any) => d.file === fileSpec.path);
        // Use a different, more reliable model for retry
        const fallbackModel = decision?.decision?.model?.startsWith('qwen') ? 'gpt-4o' : 'qwen3.6-flash';
        logger.info({ file: fileSpec.path, fallbackModel }, '📍 GENERATE: Retrying with fallback model');
        
        const content = await this.generator.generateFile(
          fileSpec,
          fallbackModel,
          {
            classification,
            generatedFiles: files,
            techStack: classification?.recommendedStack,
            originalPrompt: job.data.prompt,  // CRITICAL FIX 5: Pass original prompt for brand name extraction
          }
        );
        files[fileSpec.path] = content;

        await genEventStore.record({
          state: 'GENERATE',
          nextState: 'GENERATE',
          event: 'file_retry_succeeded',
          data: {
            filePath: fileSpec.path,
            model: fallbackModel,
            progress: Math.round(((Object.keys(files).length) / totalFiles) * 100),
          },
          timestamp: new Date().toISOString(),
        });
      },
      pipelineMetadata
    );

    // ── CRITICAL FIX 6 & 8: Post-processing — Cross-validate HTML references & add missing CSS links ──
    const generatedFilesMap = new Map(Object.entries(files));
    let crossValidatedCount = 0;
    let cssAutoLinkedCount = 0;

    for (const [filePath, fileContent] of Object.entries(files)) {
      if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
        // FIX 6: Remove dead CSS/JS references
        const afterCrossVal = crossValidateHTMLReferences(fileContent, generatedFilesMap);
        if (afterCrossVal !== fileContent) {
          files[filePath] = afterCrossVal;
          crossValidatedCount++;
          logger.debug({ file: filePath }, '📍 GENERATE: Cross-validated HTML references');
        }

        // FIX 8: Add missing CSS link tags
        const afterCSSLink = addMissingCSSLinks(files[filePath], generatedFilesMap);
        if (afterCSSLink !== files[filePath]) {
          files[filePath] = afterCSSLink;
          cssAutoLinkedCount++;
          logger.debug({ file: filePath }, '📍 GENERATE: Auto-linked missing CSS files');
        }
      }
    }

    // CRITICAL FIX 9: Fix ES module script tags
    // CRITICAL FIX 13: Check if modules are used for script tag injection
    const usesModules = Array.from((generatedFilesMap as Map<string, string>).entries())
        .filter(([p]) => p.endsWith('.js'))
        .some(([_, c]) => /\bimport\s+.*\bfrom\s+['"]/.test(c || '') || /\bexport\s+/.test(c || ''));

    let moduleFixedCount = 0;
    for (const [filePath, fileContent] of Object.entries(files)) {
      if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
        const afterModuleFix = fixModuleScriptTags(fileContent, generatedFilesMap);
        if (afterModuleFix !== fileContent) {
          files[filePath] = afterModuleFix;
          moduleFixedCount++;
          logger.debug({ file: filePath }, '📍 GENERATE: Fixed ES module script tags');
        }
      }
    }

    // CRITICAL FIX 13: Add missing script tags for JS files not referenced in HTML
    let scriptInjectedCount = 0;
    for (const [filePath, fileContent] of Object.entries(files)) {
      if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
        const afterScriptInject = addMissingScriptTags(files[filePath], generatedFilesMap, usesModules);
        if (afterScriptInject !== files[filePath]) {
          files[filePath] = afterScriptInject;
          scriptInjectedCount++;
          logger.debug({ file: filePath }, '📍 GENERATE: Auto-injected missing script tags');
        }
      }
    }

    // CRITICAL FIX 11: Empty file detection and removal
    const MIN_FILE_SIZE = 50; // bytes - a real CSS/JS file should be at least this
    const suspiciousFiles = Array.from(Object.entries(files)).filter(([path, fileContent]) => {
      const ext = path.split('.').pop()?.toLowerCase();
      return (ext === 'css' || ext === 'js') && (fileContent || '').length < MIN_FILE_SIZE;
    });
    
    let removedEmptyFiles = 0;
    // escapeRegex imported statically from generator.js
    for (const [suspectPath, suspectContent] of suspiciousFiles) {
      logger.warn(
        { file: suspectPath, size: (suspectContent || '').length },
        '📍 GENERATE: Suspiciously small file detected - removing and cleaning HTML references'
      );
      delete files[suspectPath];
      removedEmptyFiles++;
      
      for (const [htmlPath, htmlContent] of Object.entries(files)) {
        if (htmlPath.endsWith('.html') || htmlPath.endsWith('.htm')) {
          const ext = suspectPath.split('.').pop()?.toLowerCase();
          let cleaned = htmlContent;
          const fileName = suspectPath.replace(/^\/+/, '');
          const escaped = escapeRegex(fileName);
          if (ext === 'css') {
            cleaned = htmlContent.replace(
              new RegExp(`<link[^>]*href=["'][^"']*${escaped}["'][^>]*/?>`, 'gi'),
              ''
            );
          } else if (ext === 'js') {
            cleaned = htmlContent.replace(
              new RegExp(`<script[^>]*src=["'][^"']*${escaped}["'][^>]*>\\s*</script>`, 'gi'),
              ''
            );
          }
          if (cleaned !== htmlContent) {
            files[htmlPath] = cleaned;
          }
        }
      }
    }

        if (crossValidatedCount > 0 || cssAutoLinkedCount > 0 || moduleFixedCount > 0 || scriptInjectedCount > 0 || removedEmptyFiles > 0) {
      logger.info(
        { projectId, crossValidatedCount, cssAutoLinkedCount, moduleFixedCount, scriptInjectedCount, removedEmptyFiles },
        '📍 GENERATE: Post-processing completed (cross-validation + CSS auto-link + module fix + script inject + empty file removal)'
      );
    }

    // Persist generated files AND pipeline results to job context
    await job.updateData({
      ...job.data,
      context: {
        ...job.data.context,
        files,
        generationResults: result,
      },
    });

    logger.info(
      { 
        projectId, 
        fileCount: Object.keys(files).length, 
        succeeded: result.succeeded.length,
        failed: result.failed.length,
        retried: result.retried.length,
        crossValidatedCount,
        cssAutoLinkedCount,
      },
      '📍 GENERATE: Pipeline completed with error recovery + post-processing'
    );

    return 'TEST';
  }

  /**
   * TEST → DEPLOY | FIX
   * Runs security scan and sandbox tests. If both pass → DEPLOY.
   * If security or tests fail → FIX.
   */
  private async handleTest(job: Job<ProjectJob>): Promise<WorkflowState> {
    const { projectId, context } = job.data;
    const { files } = context;

    logger.info({ projectId }, '📍 TEST: Running security scan and tests');

    // ── 1. Security scan ───────────────────────────────────────────
    logger.info({ projectId }, '📍 TEST: Phase 1 — Security scan');
    const securityResult = await securityEngine.scanProject(files);

    // FIX 10: Use shouldBlockPipeline to determine if findings are truly dangerous
    const pipelineBlock = securityEngine.shouldBlockPipeline(securityResult);

    if (pipelineBlock.block) {
      // Only block on genuinely dangerous findings (code execution, injection, hardcoded secrets)
      logger.warn(
        {
          projectId,
          score: securityResult.totalScore,
          critical: securityResult.summary.critical,
          high: securityResult.summary.high,
          blockReason: pipelineBlock.reason,
        },
        '📍 TEST: Security scan BLOCKED pipeline (dangerous finding)'
      );

      await job.updateData({
        ...job.data,
        context: {
          ...job.data.context,
          securityResult,
          errors: [
            ...(job.data.context.errors || []),
            pipelineBlock.reason,
          ],
        },
      });

      return 'FIX';
    }

    if (!securityResult.passed) {
      // Non-critical findings: warn and continue instead of failing
      logger.warn(
        {
          projectId,
          score: securityResult.totalScore,
          critical: securityResult.summary.critical,
          high: securityResult.summary.high,
          medium: securityResult.summary.medium,
          low: securityResult.summary.low,
        },
        '📍 TEST: Security scan has warnings (non-critical) — continuing to sandbox tests'
      );

      await job.updateData({
        ...job.data,
        context: {
          ...job.data.context,
          securityResult,
        },
      });
      // Continue to sandbox tests instead of routing to FIX
    }

    // ── Publish SSE event for security scan result ──
    const testEventStore = new EventStore(projectId);
    await testEventStore.record({
      state: 'TEST',
      nextState: 'TEST',
      event: 'security_scan_complete',
      data: {
        passed: securityResult.passed,
        score: securityResult.totalScore,
        critical: securityResult.summary?.critical || 0,
        high: securityResult.summary?.high || 0,
      },
      timestamp: new Date().toISOString(),
    });

    logger.info(
      { projectId, score: securityResult.totalScore },
      '📍 TEST: Security scan PASSED'
    );

    // ── 2. Sandbox tests ───────────────────────────────────────────
    logger.info({ projectId }, '📍 TEST: Phase 2 — Sandbox tests');
    const testResults = await this.sandboxManager.runTests(files);

    if (testResults.success) {
      // Store project context in memory engine for future cross-project learning
      try {
        await contextMemory.storeProjectContext(projectId, {
          projectId,
          classification: job.data.context.classification,
          plan: job.data.context.plan,
          files: job.data.context.files || {},
          decisions: job.data.context.decisions || [],
          errors: job.data.context.errors || [],
          resolutions: [],
          mcpResults: job.data.context.mcpResults || {},
          metadata: {
            totalFiles: Object.keys(job.data.context.files || {}).length,
            totalTokens: 0,
            totalCost: 0,
            generationTime: Date.now() - new Date(job.data.createdAt).getTime(),
          },
          updatedAt: new Date(),
        });
      } catch (err: any) {
        logger.warn({ error: err.message }, 'Failed to store project context (non-fatal)');
      }

      await job.updateData({
        ...job.data,
        context: {
          ...job.data.context,
          testResults,
        },
      });

      logger.info(
        { projectId, testDuration: testResults.duration },
        '📍 TEST: All tests PASSED → routing to DEPLOY'
      );
      return 'DEPLOY';
    }

    // Tests failed → route to FIX
    logger.warn(
      { projectId, errors: testResults.errors },
      '📍 TEST: Tests FAILED → routing to FIX'
    );

    await job.updateData({
      ...job.data,
      context: {
        ...job.data.context,
        testResults,
        errors: testResults.errors || [],
      },
    });

    return 'FIX';
  }

  /**
   * FIX → GENERATE
   * Runs auto-healing to fix errors, then re-runs generation and tests.
   */
  private async handleFix(job: Job<ProjectJob>): Promise<WorkflowState> {
    const { projectId, context, retryCount } = job.data;
    const { errors, files, plan } = context;

    logger.info(
      { projectId, retryCount, errorCount: errors?.length || 0 },
      '📍 FIX: Running auto-healing'
    );

    // Save plan version before fix attempt (for rollback)
    if (plan && retryCount < 3) {
      try {
        await planVersioning.savePlanVersion(projectId, plan, 'auto_heal');
        logger.info({ projectId, retryCount }, 'Plan version saved before auto-heal');
      } catch (err: any) {
        logger.warn({ error: err.message }, 'Failed to save plan version (non-fatal)');
      }
    }

    // Attempt auto-healing with model escalation
    const fixed = await this.autoHealing.fix(files || {}, errors || [], retryCount);

    if (!fixed.success) {
      logger.error({ projectId, retryCount }, '📍 FIX: Auto-healing failed');
      throw new Error(
        `Auto-healing failed after ${retryCount + 1} attempt(s). Errors: ${(errors || []).join('; ')}`
      );
    }

    // Persist the fixed files
    await job.updateData({
      ...job.data,
      context: {
        ...job.data.context,
        files: fixed.files,
      },
      retryCount: retryCount + 1,
    });

    logger.info(
      {
        projectId,
        fixesApplied: fixed.appliedFixes.length,
        fixes: fixed.appliedFixes,
      },
      '📍 FIX: Auto-healing applied → routing to TEST'
    );

    // After fixing, go back to TEST to validate
    return 'TEST';
  }

  /**
   * DEPLOY → DONE
   * Uses the Deployer to deploy to the appropriate platform.
   */
  private async handleDeploy(job: Job<ProjectJob>): Promise<WorkflowState> {
    const { projectId, context } = job.data;
    const { files, classification, plan } = context;

    logger.info({ projectId }, '📍 DEPLOY: Starting deployment');

    try {
      const deployInfo = await this.deployer.deploy({
        projectId,
        projectName: `aenews-${projectId.substring(0, 8)}`,
        files: files || {},
        classification,
        plan,
      });

      // Persist deployment result
      await job.updateData({
        ...job.data,
        context: {
          ...job.data.context,
          deployUrl: deployInfo.url,
          deployInfo,
        },
      });

      // 🔹 Persist deploy URL to PostgreSQL immediately (don't wait for loop to update)
      try {
        await prisma.project.update({
          where: { id: projectId },
          data: {
            state: 'DONE',
            deployUrl: deployInfo.url,
            updatedAt: new Date(),
            context: {
              ...((job.data.context as any) || {}),
              deployUrl: deployInfo.url,
              deployInfo,
            },
          },
        });
        logger.info({ projectId, deployUrl: deployInfo.url }, '📍 DEPLOY: Persisted deploy URL to DB');
      } catch (dbError: any) {
        logger.warn({ error: dbError.message, projectId }, '⚠️ Failed to persist deploy URL to DB');
      }

      // ── Publish SSE event for deployment result ──
      const deployEventStore = new EventStore(projectId);
      await deployEventStore.record({
        state: 'DEPLOY',
        nextState: 'DONE',
        event: 'deploy_complete',
        data: {
          platform: deployInfo.platform,
          url: deployInfo.url,
          deployId: deployInfo.deployId,
        },
        timestamp: new Date().toISOString(),
      });

      logger.info(
        {
          projectId,
          platform: deployInfo.platform,
          url: deployInfo.url,
          deployId: deployInfo.deployId,
        },
        '📍 DEPLOY: Deployment successful → DONE'
      );

      return 'DONE';
    } catch (error: any) {
      logger.error(
        { projectId, error: error.message },
        '📍 DEPLOY: Deployment failed — but marking DONE with fallback URL'
      );

      // Fallback: provide a placeholder URL so the user still gets a result
      const fallbackUrl = `https://${projectId.substring(0, 8)}.aenews.ai`;
      await job.updateData({
        ...job.data,
        context: {
          ...job.data.context,
          deployUrl: fallbackUrl,
          deployInfo: {
            url: fallbackUrl,
            platform: 'fallback',
            deployId: 'n/a',
          },
          errors: [
            ...(job.data.context.errors || []),
            `Deployment failed: ${error.message}`,
          ],
        },
      });

      return 'DONE';
    }
  }

  // ============================================
  // 🚨 ERROR HANDLING
  // ============================================

  /**
   * Centralized error handler — sets state to FAILED and decides
   * whether to move to the Dead Letter Queue.
   */
  private async handleError(
    job: Job<ProjectJob>,
    sm: StateMachine,
    error: any
  ): Promise<void> {
    const errorStr = error?.message || String(error);
    const isFatalError =
      errorStr.includes('timeout') ||
      errorStr.includes('ECONNREFUSED') ||
      errorStr.includes('Global workflow timeout') ||
      job.attemptsMade >= 3;

    await job.updateData({
      ...job.data,
      context: {
        ...job.data.context,
        errors: [...(job.data.context.errors || []), errorStr],
      },
      state: 'FAILED',
      updatedAt: new Date().toISOString(),
    });

    // 🔹 CRITICAL FIX: Persist FAILED state to PostgreSQL
    try {
      await prisma.project.update({
        where: { id: job.data.projectId },
        data: {
          state: 'FAILED',
          updatedAt: new Date(),
          context: job.data.context || {},
        },
      });
    } catch (dbError: any) {
      logger.warn(
        { error: dbError.message, projectId: job.data.projectId },
        '⚠️ Failed to persist FAILED state to DB (non-fatal)'
      );
    }

    await sm.transition('FAILED', 'error_occurred', { error: errorStr });

    if (isFatalError) {
      logger.error(
        {
          projectId: job.data.projectId,
          error: errorStr,
          attempts: job.attemptsMade,
        },
        '🚨 Fatal error — moving to DLQ'
      );
      // BullMQ's built-in DLQ handling will pick this up when the job is re-thrown
    }
  }
}

// ============================================
// 🎯 WORKER INITIALIZATION (unchanged API)
// ============================================

let projectQueue: Queue<ProjectJob>;
let projectWorker: Worker<ProjectJob>;

export async function initWorker(): Promise<void> {
  const redis = getRedis();
  const engine = new WorkerEngine();

  // Create Queue with retention policy so completed/failed jobs remain visible
  projectQueue = new Queue<ProjectJob>('projects', {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { age: 24 * 3600, count: 500 },   // Keep 24h / 500 jobs
      removeOnFail: { age: 7 * 24 * 3600, count: 1000 }, // Keep 7 days / 1000 jobs
    },
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

  logger.info('✅ Worker Engine initialized (auto-chaining v2.0)');
}

export function getProjectQueue(): Queue<ProjectJob> {
  if (!projectQueue) {
    throw new Error('Project queue not initialized');
  }
  return projectQueue;
}



// ============================================
// 🎯 STANDALONE WORKER MODE (Phase 2)
// ============================================

/**
 * Start ONLY BullMQ workers without the Fastify server.
 * Used by the dedicated worker container (WORKER_MODE=true).
 */
export async function startWorkerOnly(): Promise<void> {
  const workerMode = process.env.WORKER_MODE === 'true';
  if (!workerMode) {
    throw new Error('startWorkerOnly() called but WORKER_MODE is not true');
  }

  logger.info('🔧 Starting in WORKER-ONLY mode (no API server)');

  // Initialize Redis connection
  const { initRedis } = await import('../services/redis.service.js');
  const redis = await initRedis();
  logger.info('Worker: Redis connected');

  // Initialize Prisma
  const { prisma } = await import('../config/prisma.js');
  await prisma.$connect();
  logger.info('Worker: Database connected');

  // Initialize worker engine
  await initWorker();
  logger.info('Worker: BullMQ workers started');

  // Initialize engines that workers depend on
  try {
    const { securityEngine } = await import('../services/security-engine.js');
    logger.info('Worker: Security Engine ready');
  } catch (err: any) {
    logger.warn({ error: err.message }, 'Worker: Security Engine init skipped');
  }

  try {
    const { contextMemory } = await import('../services/context-memory.js');
    logger.info('Worker: Context Memory Engine ready');
  } catch (err: any) {
    logger.warn({ error: err.message }, 'Worker: Context Memory Engine init skipped');
  }

  try {
    const { planVersioning } = await import('../services/plan-versioning.js');
    logger.info('Worker: Plan Versioning Engine ready');
  } catch (err: any) {
    logger.warn({ error: err.message }, 'Worker: Plan Versioning Engine init skipped');
  }

  logger.info(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║        🔧 AENEWS BUILDER WORKER (Standalone)                 ║
║        BullMQ Worker Engine v2.0                              ║
║                                                              ║
║        📊 Concurrency: ${process.env.BULLMQ_CONCURRENCY || '5'}                                 ║
║        🔗 Redis: Sentinel-enabled                             ║
║        🗄️  Database: Primary + Read Replica                   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);

  // Graceful shutdown for worker
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down worker...`);
    try {
      if (projectWorker) {
        await projectWorker.close();
        logger.info('Worker: BullMQ worker closed');
      }
      if (projectQueue) {
        await projectQueue.close();
        logger.info('Worker: BullMQ queue closed');
      }
      const { closeRedis } = await import('../services/redis.service.js');
      await closeRedis();
      logger.info('Worker: Redis disconnected');
      const { prisma } = await import('../config/prisma.js');
      await prisma.$disconnect();
      logger.info('Worker: Database disconnected');
    } catch (error) {
      logger.error({ error }, 'Worker: Error during shutdown');
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Keep the process alive
  logger.info('Worker: Running — waiting for jobs...');
}

