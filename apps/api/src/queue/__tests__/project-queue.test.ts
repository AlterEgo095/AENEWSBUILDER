/**
 * Unit tests for Project Generation Queue (project-queue.ts)
 *
 * Validates that:
 * - Constructor creates queue and worker
 * - addJob() enqueues with correct data, projectId as jobId, and priority
 * - getJobStatus() returns job state, progress, returnvalue, and failed reason
 * - cancelJob() removes job or throws when not found
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Define all mocks via vi.hoisted so they're available at import time ──────
// This is critical because project-queue.ts creates a singleton at module load.

const {
  mockCreateQueue,
  mockCreateWorker,
  mockQueueAdd,
  mockQueueGetJob,
} = vi.hoisted(() => {
  const mockQueueAdd = vi.fn().mockResolvedValue({ id: 'job-123' });
  const mockQueueGetJob = vi.fn().mockResolvedValue({
    id: 'job-123',
    data: { projectId: 'prj-1' },
    getState: vi.fn().mockResolvedValue('completed'),
    progress: 100,
    returnvalue: { success: true },
    failedReason: undefined,
    attemptsMade: 1,
  });

  const mockQueueObj = {
    add: mockQueueAdd,
    getJob: mockQueueGetJob,
  };

  const mockCreateQueue = vi.fn().mockReturnValue(mockQueueObj);
  const mockCreateWorker = vi.fn().mockReturnValue({});

  return { mockCreateQueue, mockCreateWorker, mockQueueAdd, mockQueueGetJob };
});

// ─── Mock bullmq ────────────────────────────────────────────────────────────

vi.mock('bullmq', () => ({
  Queue: vi.fn(),
  Worker: vi.fn(),
  Job: class MockJob {},
}));

// ─── Mock bull-config ────────────────────────────────────────────────────────

vi.mock('../bull-config.js', () => ({
  createQueue: (...args: any[]) => mockCreateQueue(...args),
  createWorker: (...args: any[]) => mockCreateWorker(...args),
}));

// ─── Mock logger ─────────────────────────────────────────────────────────────

vi.mock('../../config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import { projectQueue } from '../project-queue.js';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ProjectGenerationQueue', () => {
  // Capture constructor calls immediately (before beforeEach clears them)
  const constructorCalls = {
    createQueue: [...mockCreateQueue.mock.calls],
    createWorker: [...mockCreateWorker.mock.calls],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Re-set default behaviors after clearAllMocks
    mockQueueAdd.mockResolvedValue({ id: 'job-123' });
    mockQueueGetJob.mockResolvedValue({
      id: 'job-123',
      data: { projectId: 'prj-1' },
      getState: vi.fn().mockResolvedValue('completed'),
      progress: 100,
      returnvalue: { success: true },
      failedReason: undefined,
      attemptsMade: 1,
    });

    // Re-set createQueue to return object with add/getJob
    mockCreateQueue.mockReturnValue({
      add: mockQueueAdd,
      getJob: mockQueueGetJob,
    });
    mockCreateWorker.mockReturnValue({});
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Constructor
  // ═══════════════════════════════════════════════════════════════════════════

  describe('constructor', () => {
    it('should create queue with correct name', () => {
      expect(constructorCalls.createQueue).toHaveLength(1);
      expect(constructorCalls.createQueue[0]).toEqual(['project:generate']);
    });

    it('should create worker with correct queue name and processor', () => {
      expect(constructorCalls.createWorker).toHaveLength(1);
      expect(constructorCalls.createWorker[0][0]).toBe('project:generate');
      expect(constructorCalls.createWorker[0][1]).toEqual(expect.any(Function));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // addJob()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('addJob()', () => {
    const jobData = {
      projectId: 'prj-abc',
      userId: 'user-1',
      prompt: 'Build me a todo app',
      options: { framework: 'react' },
    };

    it('should add a job with correct data', async () => {
      await projectQueue.addJob(jobData);

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'generate',
        jobData,
        expect.objectContaining({
          jobId: 'prj-abc',
        })
      );
    });

    it('should use projectId as jobId', async () => {
      await projectQueue.addJob(jobData);

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'generate',
        jobData,
        expect.objectContaining({
          jobId: 'prj-abc',
        })
      );
    });

    it('should support priority option', async () => {
      const dataWithPriority = { ...jobData, priority: 10 };
      await projectQueue.addJob(dataWithPriority);

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'generate',
        dataWithPriority,
        expect.objectContaining({
          priority: 10,
        })
      );
    });

    it('should default priority to 5 when not specified', async () => {
      await projectQueue.addJob(jobData);

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'generate',
        jobData,
        expect.objectContaining({
          priority: 5,
        })
      );
    });

    it('should return the job id', async () => {
      mockQueueAdd.mockResolvedValue({ id: 'job-999' });

      const result = await projectQueue.addJob(jobData);

      expect(result).toBe('job-999');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getJobStatus()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getJobStatus()', () => {
    it('should return job state', async () => {
      const status = await projectQueue.getJobStatus('job-123');

      expect(status).toBeDefined();
      expect(status.state).toBe('completed');
    });

    it('should include progress', async () => {
      const status = await projectQueue.getJobStatus('job-123');

      expect(status).toHaveProperty('progress', 100);
    });

    it('should include returnvalue', async () => {
      const status = await projectQueue.getJobStatus('job-123');

      expect(status).toHaveProperty('returnvalue', { success: true });
    });

    it('should include job data', async () => {
      const status = await projectQueue.getJobStatus('job-123');

      expect(status).toHaveProperty('data', { projectId: 'prj-1' });
    });

    it('should include failedReason for failed jobs', async () => {
      mockQueueGetJob.mockResolvedValue({
        id: 'job-fail',
        data: { projectId: 'prj-2' },
        getState: vi.fn().mockResolvedValue('failed'),
        progress: 0,
        returnvalue: undefined,
        failedReason: 'Out of memory',
        attemptsMade: 3,
      });

      const status = await projectQueue.getJobStatus('job-fail');

      expect(status.state).toBe('failed');
      expect(status.failedReason).toBe('Out of memory');
      expect(status.attemptsMade).toBe(3);
    });

    it('should return null when job does not exist', async () => {
      mockQueueGetJob.mockResolvedValue(null);

      const status = await projectQueue.getJobStatus('nonexistent');

      expect(status).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // cancelJob()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('cancelJob()', () => {
    it('should remove the job', async () => {
      const mockRemove = vi.fn().mockResolvedValue(undefined);
      mockQueueGetJob.mockResolvedValue({
        id: 'job-123',
        remove: mockRemove,
      });

      await projectQueue.cancelJob('job-123');

      expect(mockRemove).toHaveBeenCalled();
    });

    it('should throw when job does not exist', async () => {
      mockQueueGetJob.mockResolvedValue(null);

      await expect(projectQueue.cancelJob('nonexistent')).rejects.toThrow(
        'Job nonexistent not found'
      );
    });
  });
});
