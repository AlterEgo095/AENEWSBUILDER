/**
 * MCP Audit Logging System
 * Tracks all security events for compliance and forensics
 * @module mcp/audit-log
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../apps/api/src/config/logger.js';

const prisma = new PrismaClient();

export enum AuditEventType {
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  COMMAND_BLOCKED = 'command_blocked',
  PERMISSION_DENIED = 'permission_denied',
  TOOL_EXECUTION_START = 'tool_execution_start',
  TOOL_EXECUTION_COMPLETE = 'tool_execution_complete',
  TOOL_EXECUTION_FAILED = 'tool_execution_failed',
  INJECTION_DETECTED = 'injection_detected',
  FUZZING_DETECTED = 'fuzzing_detected',
}

export interface SecurityEvent {
  type: AuditEventType;
  toolId: string;
  userId?: string;
  reason: string;
  data?: any;
}

export interface ToolExecutionStart {
  toolId: string;
  userId?: string;
  command: string[];
  permissions: string[];
}

export interface ToolExecutionComplete {
  eventId: string;
  toolId: string;
  userId?: string;
  duration: number;
  exitCode: number;
  outputSize: number;
}

export interface ToolExecutionFailed {
  eventId: string;
  toolId: string;
  userId?: string;
  error: string;
  duration: number;
}

export class AuditLogger {
  /**
   * Log security event
   */
  async logSecurityEvent(event: SecurityEvent): Promise<string> {
    try {
      const record = await prisma.securityAudit.create({
        data: {
          type: event.type,
          toolId: event.toolId,
          userId: event.userId || 'system',
          reason: event.reason,
          data: event.data || {},
          timestamp: new Date(),
        },
      });

      logger.warn('🔒 Security event logged', {
        id: record.id,
        type: event.type,
        toolId: event.toolId,
      });

      return record.id;
    } catch (error: any) {
      logger.error('Failed to log security event', {
        error: error.message,
        event,
      });
      throw error;
    }
  }

  /**
   * Log tool execution start
   */
  async logToolExecutionStart(execution: ToolExecutionStart): Promise<string> {
    try {
      const record = await prisma.toolExecution.create({
        data: {
          toolId: execution.toolId,
          userId: execution.userId || 'system',
          command: execution.command,
          permissions: execution.permissions,
          status: 'running',
          startedAt: new Date(),
        },
      });

      logger.info('Tool execution started', {
        id: record.id,
        toolId: execution.toolId,
      });

      return record.id;
    } catch (error: any) {
      logger.error('Failed to log tool execution start', {
        error: error.message,
        execution,
      });
      throw error;
    }
  }

  /**
   * Log tool execution complete
   */
  async logToolExecutionComplete(execution: ToolExecutionComplete): Promise<void> {
    try {
      await prisma.toolExecution.update({
        where: { id: execution.eventId },
        data: {
          status: 'completed',
          exitCode: execution.exitCode,
          outputSize: execution.outputSize,
          duration: execution.duration,
          completedAt: new Date(),
        },
      });

      logger.info('Tool execution completed', {
        id: execution.eventId,
        duration: execution.duration,
        exitCode: execution.exitCode,
      });
    } catch (error: any) {
      logger.error('Failed to log tool execution complete', {
        error: error.message,
        execution,
      });
    }
  }

  /**
   * Log tool execution failed
   */
  async logToolExecutionFailed(execution: ToolExecutionFailed): Promise<void> {
    try {
      await prisma.toolExecution.update({
        where: { id: execution.eventId },
        data: {
          status: 'failed',
          error: execution.error,
          duration: execution.duration,
          completedAt: new Date(),
        },
      });

      logger.error('Tool execution failed', {
        id: execution.eventId,
        error: execution.error,
      });
    } catch (error: any) {
      logger.error('Failed to log tool execution failure', {
        error: error.message,
        execution,
      });
    }
  }

  /**
   * Query security events
   */
  async querySecurityEvents(filter: {
    toolId?: string;
    userId?: string;
    types?: AuditEventType[];
    from?: Date;
    to?: Date;
    limit?: number;
  }) {
    const where: any = {};

    if (filter.toolId) where.toolId = filter.toolId;
    if (filter.userId) where.userId = filter.userId;
    if (filter.types) where.type = { in: filter.types };
    if (filter.from || filter.to) {
      where.timestamp = {};
      if (filter.from) where.timestamp.gte = filter.from;
      if (filter.to) where.timestamp.lte = filter.to;
    }

    return prisma.securityAudit.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filter.limit || 100,
    });
  }

  /**
   * Get security statistics
   */
  async getStats(toolId?: string) {
    const where = toolId ? { toolId } : {};

    const [total, byType] = await Promise.all([
      prisma.securityAudit.count({ where }),
      prisma.securityAudit.groupBy({
        by: ['type'],
        where,
        _count: true,
      }),
    ]);

    return {
      total,
      byType: Object.fromEntries(byType.map((t) => [t.type, t._count])),
    };
  }
}

export const auditLogger = new AuditLogger();
