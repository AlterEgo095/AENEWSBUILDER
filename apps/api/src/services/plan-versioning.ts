/**
 * Plan Versioning Engine
 * Tracks plan versions, enables comparison, and supports rollback.
 *
 * Redis key layout:
 *   plan:{projectId}:v{version}  → PlanVersion JSON
 *   plan:{projectId}:counter     → version counter (integer)
 *   plan:{projectId}:latest      → latest version number (string)
 *   plan:{projectId}:versions    → JSON array of all version numbers
 */

import { CacheService } from './redis.service.js';
import { getRedis } from './redis.service.js';
import { logger } from '../config/logger.js';
import type { ProjectPlan } from './orchestrator.service.js';

// ============================================
// 🔹 TYPES
// ============================================

export type PlanTrigger =
  | 'initial'
  | 'auto_heal'
  | 'user_edit'
  | 'test_failure'
  | 'cost_optimization';

export interface PlanDiff {
  versionFrom: number;
  versionTo: number;
  addedFiles: string[];
  removedFiles: string[];
  modifiedFiles: string[];
  changedDependencies: string[];
  summary: string;
}

export interface PlanVersion {
  projectId: string;
  version: number;
  plan: ProjectPlan;
  trigger: PlanTrigger;
  timestamp: string;
  diffFromPrevious: PlanDiff | null;
  metadata: {
    totalFiles: number;
    estimatedCost: number;
    mcpTools: string[];
  };
}

// ============================================
// 🔹 CONSTANTS
// ============================================

/** TTL for plan version data stored in Redis (30 days in seconds). */
const PLAN_TTL = 30 * 24 * 60 * 60;

// ============================================
// 🔹 HELPERS
// ============================================

function versionKey(projectId: string, version: number): string {
  return `plan:${projectId}:v${version}`;
}

function counterKey(projectId: string): string {
  return `plan:${projectId}:counter`;
}

function latestKey(projectId: string): string {
  return `plan:${projectId}:latest`;
}

function versionsListKey(projectId: string): string {
  return `plan:${projectId}:versions`;
}

/**
 * Simple deterministic hash of a string. Used to detect modifications
 * when two versions contain a file at the same path.
 */
function contentHash(obj: unknown): string {
  const json = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    const char = json.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit int
  }
  return Math.abs(hash).toString(36);
}

/**
 * Build a map of file path → content hash from a ProjectPlan.
 */
function buildFileMap(plan: ProjectPlan): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of plan.files) {
    map.set(file.path, contentHash(file));
  }
  return map;
}

// ============================================
// 🔹 PLAN VERSIONING ENGINE
// ============================================

export class PlanVersioningEngine {
  private cache: CacheService;

  constructor() {
    this.cache = new CacheService();
  }

  // ------------------------------------------
  // Save
  // ------------------------------------------

  /**
   * Save a new plan version. Automatically increments the version counter,
   * computes a diff from the previous version, and updates the latest pointer.
   */
  async savePlanVersion(
    projectId: string,
    plan: ProjectPlan,
    trigger: string,
  ): Promise<PlanVersion> {
    // Validate trigger value
    const validTriggers: PlanTrigger[] = [
      'initial',
      'auto_heal',
      'user_edit',
      'test_failure',
      'cost_optimization',
    ];
    if (!validTriggers.includes(trigger as PlanTrigger)) {
      throw new Error(
        `Invalid trigger "${trigger}". Must be one of: ${validTriggers.join(', ')}`,
      );
    }

    const redis = getRedis();

    // Atomically increment the version counter
    const version = await redis.incr(counterKey(projectId));

    // Compute diff from previous version (if one exists)
    let diffFromPrevious: PlanDiff | null = null;
    if (version > 1) {
      const previousVersion = await this.getPlanVersion(projectId, version - 1);
      if (previousVersion) {
        diffFromPrevious = this.computeDiff(
          version - 1,
          version,
          previousVersion.plan,
          plan,
        );
      }
    }

    // Build the PlanVersion record
    const planVersion: PlanVersion = {
      projectId,
      version,
      plan,
      trigger: trigger as PlanTrigger,
      timestamp: new Date().toISOString(),
      diffFromPrevious,
      metadata: {
        totalFiles: plan.files.length,
        estimatedCost: plan.estimatedCost,
        mcpTools: plan.mcpTools,
      },
    };

    // Persist: version data, latest pointer, versions list
    const vKey = versionKey(projectId, version);
    await this.cache.set(vKey, planVersion, PLAN_TTL);
    await this.cache.set(latestKey(projectId), version, PLAN_TTL);

    // Append version number to the versions list
    const versionsList = await this.fetchVersionsList(projectId);
    versionsList.push(version);
    await this.cache.set(versionsListKey(projectId), versionsList, PLAN_TTL);

    logger.info(
      { projectId, version, trigger, totalFiles: plan.files.length },
      '📦 Plan version saved',
    );

    return planVersion;
  }

  // ------------------------------------------
  // Read
  // ------------------------------------------

  /**
   * Retrieve a specific plan version by version number.
   */
  async getPlanVersion(
    projectId: string,
    version: number,
  ): Promise<PlanVersion | null> {
    return this.cache.get<PlanVersion>(versionKey(projectId, version));
  }

  /**
   * Retrieve the latest plan version for a project.
   */
  async getLatestPlan(projectId: string): Promise<PlanVersion | null> {
    const latestVersion = await this.cache.get<number>(latestKey(projectId));
    if (latestVersion === null || latestVersion === undefined) {
      return null;
    }
    return this.getPlanVersion(projectId, latestVersion);
  }

  /**
   * Retrieve the full version history for a project, sorted ascending by version.
   */
  async getPlanHistory(projectId: string): Promise<PlanVersion[]> {
    const versionsList = await this.fetchVersionsList(projectId);
    if (versionsList.length === 0) {
      return [];
    }

    // Fetch all versions in parallel
    const results = await Promise.all(
      versionsList.map((v) => this.getPlanVersion(projectId, v)),
    );

    // Filter out nulls (shouldn't happen, but defensive)
    return results.filter((v): v is PlanVersion => v !== null);
  }

  // ------------------------------------------
  // Compare
  // ------------------------------------------

  /**
   * Compare two plan versions and return a structured diff.
   * Either versionA or versionB must belong to the same project
   * identified through the plan version lookup.
   *
   * Because `PlanDiff` is keyed by version numbers alone, the caller
   * is responsible for comparing versions within the same project.
   */
  async comparePlans(
    projectId: string,
    versionA: number,
    versionB: number,
  ): Promise<PlanDiff> {
    return this.compareProjectPlans(projectId, versionA, versionB);
  }

  /**
   * Compare two plan versions within a project and return a structured diff.
   */
  async compareProjectPlans(
    projectId: string,
    versionA: number,
    versionB: number,
  ): Promise<PlanDiff> {
    const planA = await this.getPlanVersion(projectId, versionA);
    const planB = await this.getPlanVersion(projectId, versionB);

    if (!planA) {
      throw new Error(`Version ${versionA} not found for project ${projectId}`);
    }
    if (!planB) {
      throw new Error(`Version ${versionB} not found for project ${projectId}`);
    }

    return this.computeDiff(versionA, versionB, planA.plan, planB.plan);
  }

  // ------------------------------------------
  // Rollback
  // ------------------------------------------

  /**
   * Roll back to a specific version. Returns the plan from that version
   * but does **not** create a new version — the caller is responsible for
   * saving a new version if they want to record the rollback event.
   */
  async rollbackToVersion(
    projectId: string,
    version: number,
  ): Promise<ProjectPlan | null> {
    const planVersion = await this.getPlanVersion(projectId, version);
    if (!planVersion) {
      logger.warn(
        { projectId, version },
        '⚠️ Cannot rollback — version not found',
      );
      return null;
    }

    logger.info(
      { projectId, version, totalFiles: planVersion.plan.files.length },
      '⏪ Rolling back to plan version',
    );

    return planVersion.plan;
  }

  // ------------------------------------------
  // Count
  // ------------------------------------------

  /**
   * Return the total number of stored versions for a project.
   */
  async getVersionCount(projectId: string): Promise<number> {
    const versionsList = await this.fetchVersionsList(projectId);
    return versionsList.length;
  }

  // ------------------------------------------
  // Private helpers
  // ------------------------------------------

  /**
   * Fetch (or initialise) the list of version numbers for a project.
   */
  private async fetchVersionsList(projectId: string): Promise<number[]> {
    const raw = await this.cache.get<number[] | null>(
      versionsListKey(projectId),
    );
    return Array.isArray(raw) ? raw : [];
  }

  /**
   * Compute a structured diff between two ProjectPlan objects.
   */
  private computeDiff(
    versionFrom: number,
    versionTo: number,
    planA: ProjectPlan,
    planB: ProjectPlan,
  ): PlanDiff {
    const mapA = buildFileMap(planA);
    const mapB = buildFileMap(planB);

    const pathsA = new Set(mapA.keys());
    const pathsB = new Set(mapB.keys());

    // Files added in B that weren't in A
    const addedFiles: string[] = [];
    for (const path of pathsB) {
      if (!pathsA.has(path)) {
        addedFiles.push(path);
      }
    }

    // Files removed from A that aren't in B
    const removedFiles: string[] = [];
    for (const path of pathsA) {
      if (!pathsB.has(path)) {
        removedFiles.push(path);
      }
    }

    // Files present in both but with different content hashes
    const modifiedFiles: string[] = [];
    for (const path of pathsA) {
      if (pathsB.has(path) && mapA.get(path) !== mapB.get(path)) {
        modifiedFiles.push(path);
      }
    }

    // Dependencies that changed between versions
    const changedDependencies: string[] = [];
    const allDepKeys = new Set([
      ...Object.keys(planA.dependencies),
      ...Object.keys(planB.dependencies),
    ]);
    for (const dep of allDepKeys) {
      const vA = planA.dependencies[dep];
      const vB = planB.dependencies[dep];
      if (vA !== vB) {
        changedDependencies.push(dep);
      }
    }

    // Build human-readable summary
    const parts: string[] = [];
    if (addedFiles.length > 0) parts.push(`+${addedFiles.length} file(s)`);
    if (removedFiles.length > 0) parts.push(`-${removedFiles.length} file(s)`);
    if (modifiedFiles.length > 0) parts.push(`~${modifiedFiles.length} file(s) modified`);
    if (changedDependencies.length > 0)
      parts.push(`*${changedDependencies.length} dep(s) changed`);

    const summary =
      parts.length > 0
        ? parts.join(', ')
        : 'No changes detected between versions';

    return {
      versionFrom,
      versionTo,
      addedFiles,
      removedFiles,
      modifiedFiles,
      changedDependencies,
      summary,
    };
  }
}

// ============================================
// 🔹 SINGLETON EXPORT
// ============================================

export const planVersioning = new PlanVersioningEngine();
