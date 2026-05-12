import {
  mockMCPTools,
  mockDashboardStats,
  mockProjects,
  mockJobs,
  mockUsers,
  mockHealthData,
  mockResourceMetrics,
  mockLogEvents,
  mockCostSummary,
  mockDailyCosts,
  mockCostByCategory,
  mockCostByModel,
  mockCostByUser,
  mockQueueStats,
  mockSettings,
} from '../mock-data';

describe('Mock Data', () => {
  describe('mockMCPTools', () => {
    it('should be a non-empty array', () => {
      expect(Array.isArray(mockMCPTools)).toBe(true);
      expect(mockMCPTools.length).toBeGreaterThan(0);
    });

    it('each tool should have required fields', () => {
      for (const tool of mockMCPTools) {
        expect(tool).toHaveProperty('id');
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('category');
        expect(tool).toHaveProperty('status');
        expect(tool).toHaveProperty('enabled');
        expect(typeof tool.enabled).toBe('boolean');
      }
    });

    it('should have unique IDs', () => {
      const ids = mockMCPTools.map(t => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('mockDashboardStats', () => {
    it('should have all required fields', () => {
      expect(mockDashboardStats).toHaveProperty('totalProjects');
      expect(mockDashboardStats).toHaveProperty('activeJobs');
      expect(mockDashboardStats).toHaveProperty('totalUsers');
      expect(mockDashboardStats).toHaveProperty('mcpToolsAvailable');
      expect(mockDashboardStats).toHaveProperty('successRate');
      expect(mockDashboardStats).toHaveProperty('avgBuildTime');
      expect(mockDashboardStats).toHaveProperty('projectsToday');
      expect(mockDashboardStats).toHaveProperty('costsToday');
    });

    it('should have numeric values', () => {
      expect(typeof mockDashboardStats.totalProjects).toBe('number');
      expect(typeof mockDashboardStats.successRate).toBe('number');
      expect(typeof mockDashboardStats.costsToday).toBe('number');
    });
  });

  describe('mockProjects', () => {
    it('should be an array', () => {
      expect(Array.isArray(mockProjects)).toBe(true);
      expect(mockProjects.length).toBe(15);
    });

    it('each project should have required fields', () => {
      for (const project of mockProjects) {
        expect(project).toHaveProperty('id');
        expect(project).toHaveProperty('name');
        expect(project).toHaveProperty('status');
        expect(project).toHaveProperty('cost');
        expect(project).toHaveProperty('aiModel');
        expect(project).toHaveProperty('createdAt');
      }
    });

    it('should have valid statuses', () => {
      const validStatuses = ['active', 'building', 'deployed', 'failed', 'archived'];
      for (const project of mockProjects) {
        expect(validStatuses).toContain(project.status);
      }
    });

    it('should be sorted by cost descending', () => {
      for (let i = 1; i < mockProjects.length; i++) {
        expect(mockProjects[i - 1].cost).toBeGreaterThanOrEqual(mockProjects[i].cost);
      }
    });
  });

  describe('mockJobs', () => {
    it('should be an array with 20 entries', () => {
      expect(Array.isArray(mockJobs)).toBe(true);
      expect(mockJobs.length).toBe(20);
    });

    it('each job should have required fields', () => {
      for (const job of mockJobs) {
        expect(job).toHaveProperty('id');
        expect(job).toHaveProperty('projectId');
        expect(job).toHaveProperty('state');
        expect(job).toHaveProperty('progress');
        expect(job).toHaveProperty('type');
      }
    });
  });

  describe('mockUsers', () => {
    it('should be an array', () => {
      expect(Array.isArray(mockUsers)).toBe(true);
      expect(mockUsers.length).toBeGreaterThan(0);
    });

    it('each user should have valid email', () => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (const user of mockUsers) {
        expect(user.email).toMatch(emailRegex);
      }
    });

    it('each user should have valid role', () => {
      const validRoles = ['admin', 'user', 'viewer'];
      for (const user of mockUsers) {
        expect(validRoles).toContain(user.role);
      }
    });
  });

  describe('mockHealthData', () => {
    it('should have correct structure', () => {
      expect(mockHealthData).toHaveProperty('api');
      expect(mockHealthData).toHaveProperty('postgresql');
      expect(mockHealthData).toHaveProperty('redis');
      expect(mockHealthData).toHaveProperty('bullmq');
      expect(mockHealthData.api).toHaveProperty('status');
    });
  });

  describe('mockResourceMetrics', () => {
    it('should have memory, cpu, queueThroughput, responseTime', () => {
      expect(mockResourceMetrics).toHaveProperty('memory');
      expect(mockResourceMetrics).toHaveProperty('cpu');
      expect(mockResourceMetrics).toHaveProperty('queueThroughput');
      expect(mockResourceMetrics).toHaveProperty('responseTime');
    });

    it('memory should be an array of points', () => {
      expect(Array.isArray(mockResourceMetrics.memory)).toBe(true);
      expect(mockResourceMetrics.memory.length).toBe(30);
      expect(mockResourceMetrics.memory[0]).toHaveProperty('time');
      expect(mockResourceMetrics.memory[0]).toHaveProperty('value');
    });
  });

  describe('mockCostSummary', () => {
    it('should have correct fields', () => {
      expect(mockCostSummary).toHaveProperty('totalThisMonth');
      expect(mockCostSummary).toHaveProperty('avgPerProject');
      expect(mockCostSummary).toHaveProperty('dailyBudget');
      expect(mockCostSummary).toHaveProperty('monthlyBudget');
    });

    it('budget objects should have used and limit', () => {
      expect(mockCostSummary.dailyBudget).toHaveProperty('used');
      expect(mockCostSummary.dailyBudget).toHaveProperty('limit');
      expect(mockCostSummary.monthlyBudget).toHaveProperty('used');
      expect(mockCostSummary.monthlyBudget).toHaveProperty('limit');
    });
  });

  describe('mockDailyCosts', () => {
    it('should have 30 entries', () => {
      expect(mockDailyCosts.length).toBe(30);
    });

    it('each entry should have date and cost', () => {
      for (const entry of mockDailyCosts) {
        expect(entry).toHaveProperty('date');
        expect(entry).toHaveProperty('cost');
      }
    });
  });

  describe('mockCostByCategory', () => {
    it('should be a non-empty array', () => {
      expect(Array.isArray(mockCostByCategory)).toBe(true);
      expect(mockCostByCategory.length).toBeGreaterThan(0);
    });

    it('each entry should have category, cost, color', () => {
      for (const entry of mockCostByCategory) {
        expect(entry).toHaveProperty('category');
        expect(entry).toHaveProperty('cost');
        expect(entry).toHaveProperty('color');
      }
    });
  });

  describe('mockCostByModel', () => {
    it('should be a non-empty array', () => {
      expect(Array.isArray(mockCostByModel)).toBe(true);
    });

    it('percentages should sum to approximately 100%', () => {
      const total = mockCostByModel.reduce((sum, m) => sum + m.percentage, 0);
      expect(total).toBeCloseTo(100, 1);
    });
  });

  describe('mockQueueStats', () => {
    it('should have correct fields', () => {
      expect(mockQueueStats).toHaveProperty('active');
      expect(mockQueueStats).toHaveProperty('waiting');
      expect(mockQueueStats).toHaveProperty('completed');
      expect(mockQueueStats).toHaveProperty('failed');
      expect(mockQueueStats).toHaveProperty('totalProcessed');
      expect(mockQueueStats).toHaveProperty('throughputPerMinute');
    });
  });

  describe('mockSettings', () => {
    it('should have general, ai, security sections', () => {
      expect(mockSettings).toHaveProperty('general');
      expect(mockSettings).toHaveProperty('ai');
      expect(mockSettings).toHaveProperty('security');
      expect(mockSettings).toHaveProperty('mcp');
      expect(mockSettings).toHaveProperty('queue');
    });

    it('general settings should have platformName', () => {
      expect(mockSettings.general).toHaveProperty('platformName');
      expect(typeof mockSettings.general.platformName).toBe('string');
    });

    it('ai settings should have defaultModel', () => {
      expect(mockSettings.ai).toHaveProperty('defaultModel');
      expect(mockSettings.ai).toHaveProperty('maxTokens');
      expect(mockSettings.ai).toHaveProperty('dailyBudgetLimit');
    });
  });

  describe('mockLogEvents', () => {
    it('should be an array of 50 events', () => {
      expect(Array.isArray(mockLogEvents)).toBe(true);
      expect(mockLogEvents.length).toBe(50);
    });

    it('each event should have valid level', () => {
      const validLevels = ['info', 'warn', 'error'];
      for (const event of mockLogEvents) {
        expect(validLevels).toContain(event.level);
      }
    });
  });
});
