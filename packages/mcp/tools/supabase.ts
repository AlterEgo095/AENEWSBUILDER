/**
 * Supabase MCP Tool
 * Manage Supabase projects, query databases, and generate TypeScript types
 *
 * Based on supabase-community/supabase-mcp from the MCP ecosystem
 */

import axios from 'axios';

export interface SupabaseTool {
  name: 'supabase';
  permissions: ['network', 'read', 'write'];
  execute: (params: SupabaseParams) => Promise<SupabaseResult>;
}

export interface SupabaseParams {
  action: 'listProjects' | 'createProject' | 'queryTable' | 'getSchema' | 'generateTypes';
  projectRef?: string;
  name?: string;
  region?: string;
  sql?: string;
}

export interface SupabaseResult {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
}

class SupabaseAdapter {
  private accessToken: string;
  private baseUrl = 'https://api.supabase.com/v1';

  constructor(accessToken?: string) {
    this.accessToken = accessToken || process.env.SUPABASE_ACCESS_TOKEN || '';
  }

  /**
   * Execute a Supabase action
   */
  async execute(params: SupabaseParams): Promise<SupabaseResult> {
    try {
      switch (params.action) {
        case 'listProjects':
          return await this.listProjects();
        case 'createProject':
          return await this.createProject(params.name!, params.region!);
        case 'queryTable':
          return await this.queryTable(params.projectRef!, params.sql!);
        case 'getSchema':
          return await this.getSchema(params.projectRef!);
        case 'generateTypes':
          return await this.generateTypes(params.projectRef!);
        default:
          return { success: false, error: `Unknown action: ${params.action}` };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Unknown error',
      };
    }
  }

  /**
   * List all Supabase projects
   */
  async listProjects(): Promise<SupabaseResult> {
    const response = await axios.get(`${this.baseUrl}/projects`, {
      headers: this.getHeaders(),
    });

    const projects = (response.data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      region: p.region,
      status: p.status,
      createdAt: p.created_at,
      databaseUrl: p.database?.connection_string,
    }));

    return {
      success: true,
      data: { projects, count: projects.length },
    };
  }

  /**
   * Create a new Supabase project
   */
  async createProject(name: string, region: string = 'us-east-1'): Promise<SupabaseResult> {
    if (!name) {
      return { success: false, error: 'Project name is required' };
    }

    const response = await axios.post(
      `${this.baseUrl}/projects`,
      {
        name,
        region,
        org_id: process.env.SUPABASE_ORG_ID || '',
      },
      { headers: this.getHeaders() }
    );

    return {
      success: true,
      data: {
        id: response.data.id,
        name: response.data.name,
        region: response.data.region,
        status: response.data.status,
      },
    };
  }

  /**
   * Execute SQL query on a project
   */
  async queryTable(projectRef: string, sql: string): Promise<SupabaseResult> {
    if (!projectRef || !sql) {
      return { success: false, error: 'projectRef and sql are required' };
    }

    const response = await axios.post(
      `${this.baseUrl}/projects/${projectRef}/database/query`,
      { query: sql },
      { headers: this.getHeaders() }
    );

    return {
      success: true,
      data: { rows: response.data, rowCount: (response.data || []).length },
    };
  }

  /**
   * Get database schema for a project
   */
  async getSchema(projectRef: string): Promise<SupabaseResult> {
    if (!projectRef) {
      return { success: false, error: 'projectRef is required' };
    }

    const response = await axios.get(
      `${this.baseUrl}/projects/${projectRef}/database/schema`,
      { headers: this.getHeaders() }
    );

    const tables = (response.data || []).map((t: any) => ({
      name: t.name,
      schema: t.schema,
      columns: t.columns?.map((c: any) => ({
        name: c.name,
        type: c.data_type,
        nullable: c.is_nullable === 'YES',
        defaultValue: c.column_default,
      })),
    }));

    return {
      success: true,
      data: { tables, tableCount: tables.length },
    };
  }

  /**
   * Generate TypeScript types from database schema
   */
  async generateTypes(projectRef: string): Promise<SupabaseResult> {
    if (!projectRef) {
      return { success: false, error: 'projectRef is required' };
    }

    const schemaResult = await this.getSchema(projectRef);
    if (!schemaResult.success || !schemaResult.data) {
      return schemaResult;
    }

    const tables = schemaResult.data.tables as Array<{
      name: string;
      columns: Array<{ name: string; type: string; nullable: boolean }>;
    }>;

    let types = '// Auto-generated TypeScript types from Supabase schema\n\n';

    for (const table of tables) {
      const typeName = this.toPascalCase(table.name);
      types += `export interface ${typeName} {\n`;

      for (const col of table.columns) {
        const tsType = this.sqlTypeToTs(col.type);
        const optional = col.nullable ? '?' : '';
        types += `  ${col.name}${optional}: ${tsType};\n`;
      }

      types += '}\n\n';
    }

    return {
      success: true,
      data: { types, tableCount: tables.length },
    };
  }

  /**
   * Build request headers with auth
   */
  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Convert SQL type to TypeScript type
   */
  private sqlTypeToTs(sqlType: string): string {
    const map: Record<string, string> = {
      'uuid': 'string',
      'text': 'string',
      'varchar': 'string',
      'character varying': 'string',
      'integer': 'number',
      'bigint': 'number',
      'numeric': 'number',
      'decimal': 'number',
      'real': 'number',
      'double precision': 'number',
      'boolean': 'boolean',
      'timestamp': 'string',
      'timestamp with time zone': 'string',
      'date': 'string',
      'time': 'string',
      'json': 'Record<string, any>',
      'jsonb': 'Record<string, any>',
      'bytea': 'Buffer',
      'inet': 'string',
      'cidr': 'string',
      'macaddr': 'string',
    };

    const normalized = sqlType.toLowerCase().split('(')[0].trim();
    return map[normalized] || 'any';
  }

  /**
   * Convert snake_case to PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }
}

export default SupabaseAdapter;
