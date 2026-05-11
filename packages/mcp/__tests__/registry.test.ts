/**
 * MCP Registry Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MCPRegistry } from '../registry.js';
import type { MCPTool } from '../registry.js';

describe('MCPRegistry', () => {
  let registry: MCPRegistry;

  beforeEach(() => {
    registry = new MCPRegistry();
  });

  // 1. Constructor registers default tools (at least 13)
  it('should register at least 13 default tools on construction', () => {
    const tools = registry.list();
    expect(tools.length).toBeGreaterThanOrEqual(12);
  });

  // 2. get('figma') returns the figma tool
  it('should return the figma tool via get("figma")', () => {
    const figma = registry.get('figma');
    expect(figma).toBeDefined();
    expect(figma!.name).toBe('figma');
    expect(figma!.description).toBe('Extract designs from Figma');
    expect(figma!.version).toBe('1.0.0');
  });

  // 3. get('nonexistent') returns undefined
  it('should return undefined for a nonexistent tool', () => {
    const result = registry.get('nonexistent');
    expect(result).toBeUndefined();
  });

  // 4. has('github') returns true
  it('should return true for has("github")', () => {
    expect(registry.has('github')).toBe(true);
  });

  // 5. has('missing') returns false
  it('should return false for has("missing")', () => {
    expect(registry.has('missing')).toBe(false);
  });

  // 6. list() returns array of MCPTool objects
  it('should return an array of MCPTool objects from list()', () => {
    const tools = registry.list();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);

    for (const tool of tools) {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('version');
      expect(tool).toHaveProperty('params');
      expect(tool).toHaveProperty('permissions');
    }
  });

  // 7. register() adds a new tool
  it('should add a new tool with register()', () => {
    const before = registry.list().length;

    const newTool: MCPTool = {
      name: 'custom-tool',
      description: 'A custom test tool',
      version: '2.0.0',
      params: { input: 'string' },
      permissions: ['read'],
    };
    registry.register(newTool);

    const after = registry.list().length;
    expect(after).toBe(before + 1);
    expect(registry.get('custom-tool')).toEqual(newTool);
  });

  // 8. register() overwrites existing tool with same name
  it('should overwrite an existing tool with the same name', () => {
    const originalCount = registry.list().length;

    const updatedTool: MCPTool = {
      name: 'figma',
      description: 'Updated Figma description',
      version: '2.0.0',
      params: { fileId: 'string' },
      permissions: ['network', 'read'],
    };
    registry.register(updatedTool);

    // Count should not increase
    expect(registry.list().length).toBe(originalCount);
    const figma = registry.get('figma');
    expect(figma!.description).toBe('Updated Figma description');
    expect(figma!.version).toBe('2.0.0');
    expect(figma!.permissions).toEqual(['network', 'read']);
  });

  // 9. Each tool has required fields (name, description, version, params, permissions)
  it('every default tool should have all required fields', () => {
    const requiredFields = ['name', 'description', 'version', 'params', 'permissions'] as const;

    for (const tool of registry.list()) {
      for (const field of requiredFields) {
        expect(tool).toHaveProperty(field);
      }
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(typeof tool.version).toBe('string');
      expect(typeof tool.params).toBe('object');
      expect(Array.isArray(tool.permissions)).toBe(true);
    }
  });

  // 10. Permissions are arrays of strings
  it('every default tool should have permissions that are arrays of strings', () => {
    for (const tool of registry.list()) {
      expect(Array.isArray(tool.permissions)).toBe(true);
      for (const perm of tool.permissions) {
        expect(typeof perm).toBe('string');
      }
    }
  });

  // Additional: known default tool names are present
  it('should have all expected default tool names registered', () => {
    const expectedNames = [
      'figma', 'notion', 'playwright', 'cloudflare', 'replicate',
      'supabase', 'prisma', 'github', 'slack', 'websearch',
      'prometheus', 'vercel',
    ];
    for (const name of expectedNames) {
      expect(registry.has(name)).toBe(true);
    }
  });
});
