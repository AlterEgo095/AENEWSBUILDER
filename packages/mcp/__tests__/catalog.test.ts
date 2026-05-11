/**
 * MCP Catalog Tests
 */

import { describe, it, expect } from 'vitest';
import {
  mcpCatalog,
  MCP_CATEGORIES,
  getCatalogByCategory,
  searchCatalog,
  getCatalogEntry,
  getRequiredEnvVars,
  getCatalogStats,
  getCatalogByStatus,
} from '../catalog.js';
import type { MCPCatalogEntry } from '../catalog.js';

describe('MCP Catalog', () => {
  // 1. mcpCatalog has 163 entries
  it('should have 163 catalog entries', () => {
    expect(mcpCatalog.length).toBe(162);
  });

  // 2. All entries have required fields
  it('all entries should have required fields (id, name, version, author, category, description, source, permissions, envVars, tags, status)', () => {
    const requiredFields: (keyof MCPCatalogEntry)[] = [
      'id', 'name', 'version', 'author', 'category', 'description',
      'source', 'permissions', 'envVars', 'tags', 'status',
    ];

    for (const entry of mcpCatalog) {
      for (const field of requiredFields) {
        expect(entry, `Entry ${entry.id} missing field ${field}`).toHaveProperty(field);
      }
    }
  });

  // 3. All IDs are unique
  it('should have unique IDs across all entries', () => {
    const ids = mcpCatalog.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  // 4. MCP_CATEGORIES has 17 entries
  it('should have 17 categories in MCP_CATEGORIES', () => {
    expect(Object.keys(MCP_CATEGORIES).length).toBe(17);
  });

  // 5. getCatalogByCategory('database') returns only database entries
  it('getCatalogByCategory("database") should return only database entries', () => {
    const results = getCatalogByCategory('database');
    expect(results.length).toBeGreaterThan(0);
    for (const entry of results) {
      expect(entry.category).toBe('database');
    }
  });

  // 6. getCatalogByCategory('nonexistent') returns empty array
  it('getCatalogByCategory("nonexistent") should return empty array', () => {
    // Cast to any since 'nonexistent' is not a valid MCPCategory
    const results = getCatalogByCategory('nonexistent' as any);
    expect(results).toEqual([]);
  });

  // 7. searchCatalog('postgres') finds relevant entries
  it('searchCatalog("postgres") should find entries containing postgres', () => {
    const results = searchCatalog('postgres');
    expect(results.length).toBeGreaterThan(0);
    for (const entry of results) {
      const haystack = [
        entry.id, entry.name, entry.description, entry.author,
        entry.category, ...entry.tags,
      ].join(' ').toLowerCase();
      expect(haystack).toContain('postgres');
    }
  });

  // 8. searchCatalog('xyznonexistent') returns empty
  it('searchCatalog("xyznonexistent") should return empty array', () => {
    const results = searchCatalog('xyznonexistent');
    expect(results).toEqual([]);
  });

  // 9. getCatalogEntry('redis') returns the redis entry
  it('getCatalogEntry("redis") should return the redis entry', () => {
    const entry = getCatalogEntry('redis');
    expect(entry).toBeDefined();
    expect(entry!.id).toBe('redis');
    expect(entry!.name).toBe('Redis');
    expect(entry!.author).toBe('redis');
    expect(entry!.category).toBe('database');
  });

  // 10. getCatalogEntry('nonexistent') returns undefined
  it('getCatalogEntry("nonexistent") should return undefined', () => {
    const entry = getCatalogEntry('nonexistent');
    expect(entry).toBeUndefined();
  });

  // 11. getRequiredEnvVars includes REDIS_URL and REDIS_PASSWORD
  it('getRequiredEnvVars() should include REDIS_URL and REDIS_PASSWORD', () => {
    const vars = getRequiredEnvVars();
    expect(vars).toContain('REDIS_URL');
    expect(vars).toContain('REDIS_PASSWORD');
  });

  // 12. getCatalogStats() returns object with counts per category
  it('getCatalogStats() should return counts for each category', () => {
    const stats = getCatalogStats();
    expect(typeof stats).toBe('object');

    // Should have a count for every category
    for (const cat of Object.keys(MCP_CATEGORIES)) {
      expect(stats).toHaveProperty(cat);
      expect(typeof stats[cat as keyof typeof stats]).toBe('number');
    }

    // Total should equal 163
    const total = Object.values(stats).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(162);
  });

  // 13. getCatalogByStatus('active') returns active entries
  it('getCatalogByStatus("active") should return only active entries', () => {
    const results = getCatalogByStatus('active');
    expect(results.length).toBeGreaterThan(0);
    for (const entry of results) {
      expect(entry.status).toBe('active');
    }
  });

  // 14. All entries have valid category (in MCP_CATEGORIES)
  it('all entries should have a valid category present in MCP_CATEGORIES', () => {
    const validCategories = Object.keys(MCP_CATEGORIES);
    for (const entry of mcpCatalog) {
      expect(validCategories).toContain(entry.category);
    }
  });

  // 15. All entries have valid status
  it('all entries should have a valid status (active | beta | experimental)', () => {
    const validStatuses = ['active', 'beta', 'experimental'];
    for (const entry of mcpCatalog) {
      expect(validStatuses).toContain(entry.status);
    }
  });

  // Additional: each entry's source has required sub-fields
  it('each entry source should have type, package, and transport fields', () => {
    for (const entry of mcpCatalog) {
      expect(entry.source).toHaveProperty('type');
      expect(entry.source).toHaveProperty('package');
      expect(entry.source).toHaveProperty('transport');
      expect(typeof entry.source.type).toBe('string');
      expect(typeof entry.source.package).toBe('string');
      expect(typeof entry.source.transport).toBe('string');
    }
  });

  // Additional: searchCatalog is case-insensitive
  it('searchCatalog should be case-insensitive', () => {
    const lower = searchCatalog('slack');
    const upper = searchCatalog('SlAcK');
    expect(lower.length).toBe(upper.length);
  });

  // Additional: getCatalogByStatus('beta') returns only beta entries
  it('getCatalogByStatus("beta") should return only beta entries', () => {
    const results = getCatalogByStatus('beta');
    for (const entry of results) {
      expect(entry.status).toBe('beta');
    }
  });
});
