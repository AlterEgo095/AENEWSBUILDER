/**
 * MCP Audit Log - Immutable Execution Trail
 * Features: Event Store integration, tamper-proof logs, forensic analysis
 * @module mcp/audit-log
 */

import { EventStoreV2, EventType } from '../../apps/api/src/workers/event-store-v2.js';
import { logger } from '../../apps/api/src/config/logger.js';
import crypto from 'crypto';

// ================== AUDIT EVENT TYPES ==================

export enum AuditEventType {
  TOOL_EXECUTION_STARTED = 'mcp:tool:execution:started',
  TOOL_EXECUTION_COMPLETED = 'mcp:tool:execution:completed',
  TOOL_EXECUTION_FAILED = 'mcp:tool:execution:failed',
  TOOL_REGISTERED = 'mcp:tool:registered',
  PERMISSION_DENIED = 'mcp:permission:denied',
  RATE_LIMIT_EXCEEDED = 'mcp:rate_limit:exceeded',
  COMMAND_BLOCKED = 'mcp:command:blocked',
  INJECTION_DETECTED = 'mcp:injection:detected',
}

export interface AuditEvent {
  eventId: string;
  timestamp: Date;
  type: AuditEventType;
  toolId: string;
  userId?: string;
  sessionId?: string;
  data: Record<string, any>;
  hash: string; // Tamper-proof hash of event
  previousHash?: string; // Hash of previous event (blockchain-style)
}

// ================== AUDIT LOGGER ==================

export class AuditLogger {
  private eventStore: EventStoreV2;
  private lastEventHash?: string;

  constructor() {
    this.eventStore = new EventStoreV2();
  }

  /**
   * 🔥 LOG TOOL EXECUTION START
   */
  async logToolExecutionStart(params: {
    toolId: string;
    userId?: string;
    sessionId?: string;
    command: string[];
    permissions: string[];
  }): Promise<string> {
    const eventId = crypto.randomUUID();
    
    const auditEvent: AuditEvent = {
      eventId,
      timestamp: new Date(),
      type: AuditEventType.TOOL_EXECUTION_STARTED,
      toolId: params.toolId,
      userId: params.userId,
      sessionId: params.sessionId,
      data: {
        command: params.command,
        permissions: params.permissions,
      },
      hash: '',
      previousHash: this.lastEventHash,
    };

    auditEvent.hash = this.calculateHash(auditEvent);
    this.lastEventHash = auditEvent.hash;

    await this.eventStore.record({
      type: EventType.MCP_TOOL_START,
      projectId: params.toolId,
      metadata: auditEvent,
    });

    logger.info('🔒 Audit: Tool execution started', {
      eventId,
      toolId: params.toolId,
      userId: params.userId,
    });

    return eventId;
  }

  /**
   * 🔥 LOG TOOL EXECUTION COMPLETION
   */
  async logToolExecutionComplete(params: {
    eventId: string;
    toolId: string;
    userId?: string;
    duration: number;
    exitCode: number;
    outputSize: number;
  }): Promise<void> {
    const auditEvent: AuditEvent = {
      eventId: params.eventId,
      timestamp: new Date(),
      type: AuditEventType.TOOL_EXECUTION_COMPLETED,
      toolId: params.toolId,
      userId: params.userId,
      data: {
        duration: params.duration,
        exitCode: params.exitCode,
        outputSize: params.outputSize,
      },
      hash: '',
      previousHash: this.lastEventHash,
    };

    auditEvent.hash = this.calculateHash(auditEvent);
    this.lastEventHash = auditEvent.hash;

    await this.eventStore.record({
      type: EventType.MCP_TOOL_COMPLETE,
      projectId: params.toolId,
      metadata: auditEvent,
    });

    logger.info('🔒 Audit: Tool execution completed', {
      eventId: params.eventId,
      toolId: params.toolId,
      duration: params.duration,
    });
  }

  /**
   * 🔥 LOG TOOL EXECUTION FAILURE
   */
  async logToolExecutionFailed(params: {
    eventId: string;
    toolId: string;
    userId?: string;
    error: string;
    duration: number;
  }): Promise<void> {
    const auditEvent: AuditEvent = {
      eventId: params.eventId,
      timestamp: new Date(),
      type: AuditEventType.TOOL_EXECUTION_FAILED,
      toolId: params.toolId,
      userId: params.userId,
      data: {
        error: params.error,
        duration: params.duration,
      },
      hash: '',
      previousHash: this.lastEventHash,
    };

    auditEvent.hash = this.calculateHash(auditEvent);
    this.lastEventHash = auditEvent.hash;

    await this.eventStore.record({
      type: EventType.MCP_TOOL_ERROR,
      projectId: params.toolId,
      metadata: auditEvent,
    });

    logger.error('🔒 Audit: Tool execution failed', {
      eventId: params.eventId,
      toolId: params.toolId,
      error: params.error,
    });
  }

  /**
   * 🔥 LOG SECURITY EVENT (permission denied, rate limit, etc.)
   */
  async logSecurityEvent(params: {
    type: AuditEventType;
    toolId: string;
    userId?: string;
    reason: string;
    data?: Record<string, any>;
  }): Promise<void> {
    const eventId = crypto.randomUUID();
    
    const auditEvent: AuditEvent = {
      eventId,
      timestamp: new Date(),
      type: params.type,
      toolId: params.toolId,
      userId: params.userId,
      data: {
        reason: params.reason,
        ...params.data,
      },
      hash: '',
      previousHash: this.lastEventHash,
    };

    auditEvent.hash = this.calculateHash(auditEvent);
    this.lastEventHash = auditEvent.hash;

    let eventType: EventType;
    switch (params.type) {
      case AuditEventType.PERMISSION_DENIED:
        eventType = EventType.ERROR;
        break;
      case AuditEventType.RATE_LIMIT_EXCEEDED:
        eventType = EventType.ERROR;
        break;
      case AuditEventType.COMMAND_BLOCKED:
        eventType = EventType.ERROR;
        break;
      case AuditEventType.INJECTION_DETECTED:
        eventType = EventType.ERROR;
        break;
      default:
        eventType = EventType.ERROR;
    }

    await this.eventStore.record({
      type: eventType,
      projectId: params.toolId,
      metadata: auditEvent,
    });

    logger.warn('🔒 Audit: Security event', {
      eventId,
      type: params.type,
      toolId: params.toolId,
      reason: params.reason,
    });
  }

  /**
   * 🔥 CALCULATE TAMPER-PROOF HASH
   */
  private calculateHash(event: Omit<AuditEvent, 'hash'>): string {
    const payload = {
      eventId: event.eventId,
      timestamp: event.timestamp.toISOString(),
      type: event.type,
      toolId: event.toolId,
      userId: event.userId,
      sessionId: event.sessionId,
      data: event.data,
      previousHash: event.previousHash,
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  /**
   * 🔥 VERIFY AUDIT TRAIL INTEGRITY
   */
  async verifyIntegrity(events: AuditEvent[]): Promise<{
    valid: boolean;
    brokenChain?: number;
  }> {
    if (events.length === 0) return { valid: true };

    for (let i = 1; i < events.length; i++) {
      const currentEvent = events[i];
      const previousEvent = events[i - 1];

      // Verify hash chain
      if (currentEvent.previousHash !== previousEvent.hash) {
        logger.error('🚨 Audit trail integrity violation detected', {
          eventIndex: i,
          eventId: currentEvent.eventId,
          expectedPreviousHash: previousEvent.hash,
          actualPreviousHash: currentEvent.previousHash,
        });

        return {
          valid: false,
          brokenChain: i,
        };
      }

      // Verify hash calculation
      const recalculatedHash = this.calculateHash({
        eventId: currentEvent.eventId,
        timestamp: currentEvent.timestamp,
        type: currentEvent.type,
        toolId: currentEvent.toolId,
        userId: currentEvent.userId,
        sessionId: currentEvent.sessionId,
        data: currentEvent.data,
        previousHash: currentEvent.previousHash,
      });

      if (recalculatedHash !== currentEvent.hash) {
        logger.error('🚨 Audit event hash mismatch - tampering detected', {
          eventIndex: i,
          eventId: currentEvent.eventId,
          expectedHash: currentEvent.hash,
          recalculatedHash,
        });

        return {
          valid: false,
          brokenChain: i,
        };
      }
    }

    return { valid: true };
  }

  /**
   * 🔥 FORENSIC QUERY: Get all events for a tool
   */
  async getToolAuditTrail(toolId: string, limit = 100): Promise<AuditEvent[]> {
    // Note: This would query the Event Store V2 PostgreSQL database
    // For now, we return empty array as placeholder
    logger.info('Querying audit trail', { toolId, limit });
    return [];
  }

  /**
   * 🔥 FORENSIC QUERY: Get all security events
   */
  async getSecurityEvents(
    startDate?: Date,
    endDate?: Date,
    limit = 100
  ): Promise<AuditEvent[]> {
    logger.info('Querying security events', { startDate, endDate, limit });
    return [];
  }
}

export const auditLogger = new AuditLogger();

logger.info('✅ MCP Audit Logger initialized');
