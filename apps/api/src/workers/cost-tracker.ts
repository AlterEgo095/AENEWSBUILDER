/**
 * Cost Tracker - Token Usage & Real Cost
 */

import { getRedis } from '../services/redis.service.js';
import { logger } from '../config/logger.js';

export interface CostRecord {
  projectId: string;
  operation: string;
  tokens?: number;
  cost: number;
  timestamp: string;
}

export class CostTracker {
  private redis: ReturnType<typeof getRedis>;

  constructor() {
    this.redis = getRedis();
  }

  /**
   * Record cost for operation
   */
  async record(projectId: string, operation: string, cost: number, tokens?: number): Promise<void> {
    try {
      const record: CostRecord = {
        projectId,
        operation,
        tokens,
        cost,
        timestamp: new Date().toISOString(),
      };

      // Store in Redis sorted set (by timestamp)
      const key = `cost:${projectId}`;
      const score = Date.now();
      await this.redis.zadd(key, score, JSON.stringify(record));
      await this.redis.expire(key, 2592000); // 30 days

      // Update daily total
      const today = new Date().toISOString().split('T')[0];
      const dailyKey = `cost:daily:${today}`;
      await this.redis.incrbyfloat(dailyKey, cost);
      await this.redis.expire(dailyKey, 86400 * 31); // 31 days

      logger.debug({ projectId, operation, cost }, '💰 Cost recorded');

    } catch (error) {
      logger.error({ error, projectId }, '❌ Failed to record cost');
    }
  }

  /**
   * Get total cost for project
   */
  async getProjectCost(projectId: string): Promise<number> {
    try {
      const key = `cost:${projectId}`;
      const records = await this.redis.zrange(key, 0, -1);
      
      let total = 0;
      for (const record of records) {
        const parsed: CostRecord = JSON.parse(record);
        total += parsed.cost;
      }

      return total;

    } catch (error) {
      logger.error({ error, projectId }, '❌ Failed to get project cost');
      return 0;
    }
  }

  /**
   * Get daily cost
   */
  async getDailyCost(date?: string): Promise<number> {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];
      const dailyKey = `cost:daily:${targetDate}`;
      const cost = await this.redis.get(dailyKey);
      return cost ? parseFloat(cost) : 0;

    } catch (error) {
      logger.error({ error }, '❌ Failed to get daily cost');
      return 0;
    }
  }

  /**
   * Get cost breakdown for project
   */
  async getBreakdown(projectId: string): Promise<Record<string, number>> {
    try {
      const key = `cost:${projectId}`;
      const records = await this.redis.zrange(key, 0, -1);
      
      const breakdown: Record<string, number> = {};
      for (const record of records) {
        const parsed: CostRecord = JSON.parse(record);
        if (!breakdown[parsed.operation]) {
          breakdown[parsed.operation] = 0;
        }
        breakdown[parsed.operation] += parsed.cost;
      }

      return breakdown;

    } catch (error) {
      logger.error({ error, projectId }, '❌ Failed to get breakdown');
      return {};
    }
  }

  /**
   * Check if daily threshold exceeded
   */
  async checkDailyThreshold(threshold: number): Promise<boolean> {
    const dailyCost = await this.getDailyCost();
    if (dailyCost >= threshold) {
      logger.warn({ dailyCost, threshold }, '⚠️  Daily cost threshold exceeded');
      return true;
    }
    return false;
  }
}
