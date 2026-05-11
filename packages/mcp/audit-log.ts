/**
 * MCP Audit Log - Redis-based implementation
 * @module mcp/audit-log
 */

import IORedis from 'ioredis';
import { logger } from './adapter.js';

let auditRedis: IORedis | null = null;

function getAuditRedis(): IORedis {
  if (!auditRedis) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    auditRedis = new IORedis(redisUrl);
  }
  return auditRedis;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  toolId: string;
  userId?: string;
  action: string;
  input?: any;
  output?: any;
  duration?: number;
  status: 'success' | 'error' | 'denied';
  error?: string;
  metadata?: Record<string, any>;
}

export class AuditLog {
  private readonly keyPrefix = 'mcp:audit';

  async log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<string> {
    try {
      const redis = getAuditRedis();
      const id = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const auditEntry: AuditEntry = {
        ...entry,
        id,
        timestamp: new Date().toISOString(),
      };

      await redis.lpush(`${this.keyPrefix}:log`, JSON.stringify(auditEntry));
      await redis.ltrim(`${this.keyPrefix}:log`, 0, 9999); // Keep last 10000 entries

      logger.info({ id, toolId: entry.toolId, action: entry.action }, 'Audit log recorded');
      return id;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to write audit log');
      return '';
    }
  }

  async getRecent(limit = 50): Promise<AuditEntry[]> {
    try {
      const redis = getAuditRedis();
      const entries = await redis.lrange(`${this.keyPrefix}:log`, 0, limit - 1);
      return entries.map((e) => JSON.parse(e));
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to read audit log');
      return [];
    }
  }

  async getByTool(toolId: string, limit = 50): Promise<AuditEntry[]> {
    try {
      const redis = getAuditRedis();
      const allEntries = await redis.lrange(`${this.keyPrefix}:log`, 0, -1);
      return allEntries
        .map((e) => JSON.parse(e) as AuditEntry)
        .filter((e) => e.toolId === toolId)
        .slice(0, limit);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to query audit log');
      return [];
    }
  }

  async getStats(): Promise<{ total: number; byStatus: Record<string, number>; byTool: Record<string, number> }> {
    try {
      const redis = getAuditRedis();
      const allEntries = await redis.lrange(`${this.keyPrefix}:log`, 0, -1);
      const parsed = allEntries.map((e) => JSON.parse(e) as AuditEntry);

      const byStatus: Record<string, number> = {};
      const byTool: Record<string, number> = {};

      for (const entry of parsed) {
        byStatus[entry.status] = (byStatus[entry.status] || 0) + 1;
        byTool[entry.toolId] = (byTool[entry.toolId] || 0) + 1;
      }

      return { total: parsed.length, byStatus, byTool };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to get audit stats');
      return { total: 0, byStatus: {}, byTool: {} };
    }
  }
}

export const auditLog = new AuditLog();
