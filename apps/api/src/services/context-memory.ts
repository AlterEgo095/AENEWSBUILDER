/**
 * Context Memory Engine
 * Provides persistent memory across project generations.
 * Stores file relationships, generation context, and learned patterns.
 *
 * - Prisma (PostgreSQL) for durable storage via Project.context JSON field
 * - Redis for hot cache (TTL 1h) via CacheService
 * - Redis sorted sets for cross-project learning indexes
 * - Keyword + classification matching for similarity search (no vector DB)
 */

import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { CacheService } from './redis.service.js';

// ============================================
// 🔹 TYPES
// ============================================

export interface ProjectContextData {
  projectId: string;
  classification: any;
  plan: any;
  files: Record<string, string>;
  decisions: any[];
  errors: string[];
  resolutions: string[];
  mcpResults: Record<string, any>;
  metadata: {
    totalFiles: number;
    totalTokens: number;
    totalCost: number;
    generationTime: number;
  };
  updatedAt: Date;
}

export interface FileRelation {
  targetPath: string;
  relationType: 'import' | 'dependency' | 'shared-state' | 'api-call' | 'css-import';
  confidence: number;
}

export interface SimilarProject {
  projectId: string;
  similarity: number;
  prompt: string;
  classification: any;
  type: string;
}

// ============================================
// 🔹 CONSTANTS
// ============================================

/** Cache TTL for project context: 1 hour */
const CONTEXT_CACHE_TTL = 3600;
/** Cache TTL for file relations: 1 hour */
const RELATIONS_CACHE_TTL = 3600;
/** Cache TTL for cross-project learnings: 30 minutes */
const LEARNINGS_CACHE_TTL = 1800;
/** Maximum number of similar projects to score */
const SIMILARITY_SEARCH_LIMIT = 100;

// Redis key prefixes
const CACHE_PREFIX = 'ctxmem';
const PROJECT_CONTEXT_KEY = (projectId: string) =>
  `${CACHE_PREFIX}:project:${projectId}`;
const FILE_RELATIONS_KEY = (projectId: string, filePath: string) =>
  `${CACHE_PREFIX}:rel:${projectId}:${filePath}`;
const PROJECT_INDEX_KEY = (type: string) =>
  `${CACHE_PREFIX}:index:type:${type}`;
const PATTERN_INDEX_KEY = `${CACHE_PREFIX}:index:patterns`;
const LEARNINGS_KEY = (type: string) =>
  `${CACHE_PREFIX}:learnings:${type}`;

// ============================================
// 🔹 CONTEXT MEMORY ENGINE
// ============================================

export class ContextMemoryEngine {
  private cache: CacheService;

  constructor() {
    this.cache = new CacheService();
  }

  // ------------------------------------------
  // Project Context
  // ------------------------------------------

  /**
   * Store the full project context (classification, plan, files, decisions, etc.)
   * Persists to Prisma Project.context and caches in Redis.
   */
  async storeProjectContext(
    projectId: string,
    context: ProjectContextData
  ): Promise<void> {
    try {
      // Persist to database
      await prisma.project.update({
        where: { id: projectId },
        data: {
          context: context as any,
        },
      });

      // Update cross-project type index in Redis sorted set
      const projectType =
        context.classification?.type || context.plan?.type || 'other';
      const complexity =
        context.classification?.complexity || 'medium';
      // Use a numeric score so we can ZRANGEBYSCORE later; encode complexity as 0/1/2
      const complexityScore =
        complexity === 'simple' ? 0 : complexity === 'complex' ? 2 : 1;
      // Combine timestamp-based score so newest entries sort first
      const score = Date.now();

      // Lazy-get Redis for sorted-set operations (CacheService doesn't expose raw Redis)
      const { getRedis } = await import('./redis.service.js');
      const redis = getRedis();
      const pipeline = redis.pipeline();
      pipeline.zadd(
        PROJECT_INDEX_KEY(projectType),
        score,
        projectId
      );
      pipeline.zadd(
        `${PROJECT_INDEX_KEY(projectType)}:complexity`,
        complexityScore,
        projectId
      );
      pipeline.expire(
        PROJECT_INDEX_KEY(projectType),
        7 * 24 * 3600 // 7 days
      );
      pipeline.expire(
        `${PROJECT_INDEX_KEY(projectType)}:complexity`,
        7 * 24 * 3600
      );
      await pipeline.exec();

      // Cache in Redis for fast reads
      await this.cache.set(
        PROJECT_CONTEXT_KEY(projectId),
        context,
        CONTEXT_CACHE_TTL
      );

      logger.info(
        { projectId, type: projectType },
        '✅ Project context stored'
      );
    } catch (error) {
      logger.error(
        { error, projectId },
        '❌ Failed to store project context'
      );
      throw error;
    }
  }

  /**
   * Retrieve project context. Checks Redis cache first, falls back to Prisma.
   */
  async getProjectContext(
    projectId: string
  ): Promise<ProjectContextData | null> {
    try {
      // Check cache first
      const cached = await this.cache.get<ProjectContextData>(
        PROJECT_CONTEXT_KEY(projectId)
      );
      if (cached) {
        logger.debug(
          { projectId },
          '✅ Project context cache hit'
        );
        return cached;
      }

      // Fall back to database
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { context: true },
      });

      if (!project || !project.context) {
        return null;
      }

      const context = project.context as unknown as ProjectContextData;

      // Populate cache
      await this.cache.set(
        PROJECT_CONTEXT_KEY(projectId),
        context,
        CONTEXT_CACHE_TTL
      );

      logger.debug(
        { projectId },
        '✅ Project context loaded from DB'
      );
      return context;
    } catch (error) {
      logger.error(
        { error, projectId },
        '❌ Failed to get project context'
      );
      return null;
    }
  }

  // ------------------------------------------
  // File Relations
  // ------------------------------------------

  /**
   * Store file relations for a specific file within a project.
   * Relations are stored both in the project context JSON (via merge) and
   * cached independently in Redis for fast lookup during generation.
   */
  async storeFileRelation(
    projectId: string,
    filePath: string,
    relations: FileRelation[]
  ): Promise<void> {
    try {
      // Load existing context
      const existing = await this.getProjectContext(projectId);

      // Build a relations map: context.fileRelations is a Record<string, FileRelation[]>
      const fileRelations = {
        ...(existing?.fileRelations || {}),
        [filePath]: relations,
      };

      // Merge into project context
      if (existing) {
        const updatedContext: ProjectContextData = {
          ...existing,
          fileRelations,
          updatedAt: new Date(),
        };
        await this.storeProjectContext(projectId, updatedContext);
      }

      // Cache independently for fast per-file lookup
      await this.cache.set(
        FILE_RELATIONS_KEY(projectId, filePath),
        relations,
        RELATIONS_CACHE_TTL
      );

      logger.debug(
        {
          projectId,
          filePath,
          relationCount: relations.length,
        },
        '✅ File relations stored'
      );
    } catch (error) {
      logger.error(
        { error, projectId, filePath },
        '❌ Failed to store file relations'
      );
      throw error;
    }
  }

  /**
   * Get file relations for a specific file within a project.
   * Checks Redis cache first, falls back to project context.
   */
  async getFileRelations(
    projectId: string,
    filePath: string
  ): Promise<FileRelation[]> {
    try {
      // Check cache
      const cached = await this.cache.get<FileRelation[]>(
        FILE_RELATIONS_KEY(projectId, filePath)
      );
      if (cached) {
        return cached;
      }

      // Fall back to project context
      const context = await this.getProjectContext(projectId);
      const relations = context?.fileRelations?.[filePath] || [];

      // Populate cache
      if (relations.length > 0) {
        await this.cache.set(
          FILE_RELATIONS_KEY(projectId, filePath),
          relations,
          RELATIONS_CACHE_TTL
        );
      }

      return relations;
    } catch (error) {
      logger.error(
        { error, projectId, filePath },
        '❌ Failed to get file relations'
      );
      return [];
    }
  }

  // ------------------------------------------
  // Generation Patterns
  // ------------------------------------------

  /**
   * Store a generation pattern (prompt + classification + plan) for future learning.
   * Uses a Redis sorted set keyed by a hash of the prompt for deduplication.
   */
  async storeGenerationPattern(
    prompt: string,
    classification: any,
    plan: any
  ): Promise<void> {
    try {
      const { getRedis } = await import('./redis.service.js');
      const redis = getRedis();

      const entry = JSON.stringify({
        prompt,
        classification,
        plan,
        timestamp: new Date().toISOString(),
      });

      const hash = this.cache.generateKey('pattern', prompt);

      // Store the full pattern data as a Redis hash
      await redis.hset(PATTERN_INDEX_KEY, hash, entry);

      // Also index by project type for cross-project learning
      const projectType = classification?.type || 'other';
      await redis.sadd(
        LEARNINGS_KEY(projectType),
        hash
      );

      // Set TTLs (7 days for patterns, 3 days for learning indexes)
      await redis.expire(PATTERN_INDEX_KEY, 7 * 24 * 3600);
      await redis.expire(
        LEARNINGS_KEY(projectType),
        3 * 24 * 3600
      );

      logger.debug(
        { type: projectType },
        '✅ Generation pattern stored'
      );
    } catch (error) {
      logger.error({ error }, '❌ Failed to store generation pattern');
      // Non-critical: don't throw
    }
  }

  // ------------------------------------------
  // Similar Projects
  // ------------------------------------------

  /**
   * Find projects similar to the given prompt.
   * Uses keyword matching + classification matching (no vector DB).
   *
   * Algorithm:
   *  1. Extract keywords from the prompt (simple tokenisation).
   *  2. Scan recent projects from the type index.
   *  3. Score each project by keyword overlap + classification match.
   *  4. Return top-N sorted by similarity score.
   */
  async findSimilarProjects(
    prompt: string,
    limit: number = 5
  ): Promise<SimilarProject[]> {
    try {
      const promptKeywords = this.extractKeywords(prompt);

      // Get recent project IDs from all type indexes (they may overlap)
      const { getRedis } = await import('./redis.service.js');
      const redis = getRedis();

      const typeKeys = await redis.keys(`${CACHE_PREFIX}:index:type:*`);
      const typeKeysFiltered = typeKeys.filter(
        (k) => !k.endsWith(':complexity')
      );

      // Collect unique project IDs from all indexes, newest first
      const projectIdSet = new Set<string>();
      for (const key of typeKeysFiltered) {
        const ids = await redis.zrevrange(key, 0, SIMILARITY_SEARCH_LIMIT - 1);
        for (const id of ids) {
          projectIdSet.add(id);
        }
      }

      const projectIds = Array.from(projectIdSet).slice(
        0,
        SIMILARITY_SEARCH_LIMIT
      );

      if (projectIds.length === 0) {
        return [];
      }

      // Batch-fetch projects from DB
      const projects = await prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, prompt: true, context: true },
      });

      // Score each project
      const scored: SimilarProject[] = [];

      for (const project of projects) {
        const ctx = project.context as Record<string, any> | null;
        const classification = ctx?.classification || {};
        const projectType = classification.type || 'other';
        const projectPrompt = project.prompt || '';

        // --- Keyword similarity (Jaccard-like) ---
        const projectKeywords = this.extractKeywords(projectPrompt);
        const intersection = promptKeywords.filter((kw) =>
          projectKeywords.includes(kw)
        );
        const union = new Set([...promptKeywords, ...projectKeywords]);
        const keywordSimilarity =
          union.size > 0 ? intersection.length / union.size : 0;

        // --- Classification bonus ---
        const classificationBonus =
          projectType === this.inferTypeFromPrompt(prompt) ? 0.2 : 0;

        // --- Feature overlap bonus ---
        const promptFeatures = new Set(promptKeywords);
        const projectFeatures = new Set(
          classification.features || []
        );
        const featureOverlap = [...promptFeatures].filter((f) =>
          projectFeatures.has(f)
        ).length;
        const featureBonus =
          projectFeatures.size > 0
            ? (featureOverlap / projectFeatures.size) * 0.15
            : 0;

        const totalSimilarity = Math.min(
          keywordSimilarity + classificationBonus + featureBonus,
          1.0
        );

        // Only include projects with some relevance
        if (totalSimilarity > 0.05) {
          scored.push({
            projectId: project.id,
            similarity: Math.round(totalSimilarity * 1000) / 1000,
            prompt: projectPrompt,
            classification,
            type: projectType,
          });
        }
      }

      // Sort by similarity descending, take top N
      scored.sort((a, b) => b.similarity - a.similarity);

      logger.info(
        { prompt: prompt.substring(0, 60), found: scored.length, limit },
        '✅ Similar projects found'
      );

      return scored.slice(0, limit);
    } catch (error) {
      logger.error({ error }, '❌ Failed to find similar projects');
      return [];
    }
  }

  // ------------------------------------------
  // Cross-Project Learnings
  // ------------------------------------------

  /**
   * Get cross-project learnings for a given type.
   * Returns stored generation patterns that match the requested type.
   */
  async getCrossProjectLearnings(type: string): Promise<any[]> {
    try {
      const cacheKey = this.cache.generateKey('learnings', type);

      // Check cache
      const cached = await this.cache.get<any[]>(cacheKey);
      if (cached) {
        return cached;
      }

      const { getRedis } = await import('./redis.service.js');
      const redis = getRedis();

      // Get pattern hashes for this type
      const hashes = await redis.smembers(LEARNINGS_KEY(type));

      if (hashes.length === 0) {
        return [];
      }

      // Batch-fetch pattern data from the patterns hash
      const patterns = await redis.hmget(
        PATTERN_INDEX_KEY,
        ...hashes
      );

      const learnings = patterns
        .filter((p) => p !== null && p !== undefined)
        .map((p) => {
          try {
            return JSON.parse(p!);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        // Sort newest first
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() -
            new Date(a.timestamp).getTime()
        );

      // Cache learnings
      await this.cache.set(cacheKey, learnings, LEARNINGS_CACHE_TTL);

      logger.info(
        { type, count: learnings.length },
        '✅ Cross-project learnings retrieved'
      );

      return learnings;
    } catch (error) {
      logger.error(
        { error, type },
        '❌ Failed to get cross-project learnings'
      );
      return [];
    }
  }

  // ------------------------------------------
  // Utility Methods
  // ------------------------------------------

  /**
   * Extract meaningful keywords from a text string.
   * Strips common stop-words and punctuation, lowercases, deduplicates.
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'and', 'or', 'but', 'not', 'no', 'so',
      'if', 'do', 'does', 'did', 'be', 'been', 'being', 'have', 'has',
      'had', 'will', 'would', 'could', 'should', 'can', 'may', 'me',
      'my', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them',
      'this', 'that', 'these', 'those', 'which', 'what', 'who', 'how',
      'when', 'where', 'why', 'make', 'build', 'create', 'want', 'need',
      'like', 'just', 'also', 'some', 'any', 'all', 'each', 'very',
      'please', 'i', 'am', 'are', 'was', 'were', 'up', 'out', 'its',
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s\-_]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 1 && !stopWords.has(word))
      .filter((word, index, arr) => arr.indexOf(word) === index); // deduplicate
  }

  /**
   * Naively infer project type from prompt keywords.
   */
  private inferTypeFromPrompt(prompt: string): string {
    const lower = prompt.toLowerCase();
    const typeKeywords: Record<string, string[]> = {
      landing: ['landing', 'page', 'homepage', 'hero', 'single page'],
      webapp: ['webapp', 'web app', 'application', 'portal', 'platform', 'tool', 'manager'],
      ecommerce: ['shop', 'store', 'ecommerce', 'e-commerce', 'cart', 'checkout', 'product', 'catalog', 'marketplace'],
      dashboard: ['dashboard', 'admin', 'analytics', 'panel', 'chart', 'report', 'monitor'],
      api: ['api', 'rest', 'graphql', 'endpoint', 'backend', 'microservice'],
    };

    for (const [type, keywords] of Object.entries(typeKeywords)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        return type;
      }
    }

    return 'other';
  }
}

// ============================================
// 🔹 SINGLETON EXPORT
// ============================================

export const contextMemory = new ContextMemoryEngine();
