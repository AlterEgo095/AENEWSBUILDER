/**
 * Vercel MCP Tool
 * Deploy projects, manage deployments, and create Vercel projects
 *
 * Uses Vercel REST API — requires VERCEL_TOKEN env var
 */

import axios from 'axios';

export interface VercelTool {
  name: 'vercel';
  permissions: ['network', 'read', 'write'];
  execute: (params: VercelParams) => Promise<VercelResult>;
}

export interface VercelParams {
  action: 'deploy' | 'getDeployments' | 'getProject' | 'createProject' | 'deleteDeployment';
  projectName?: string;
  projectId?: string;
  deploymentId?: string;
  files?: Record<string, string>;
  framework?: string;
}

export interface VercelResult {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
}

class VercelAdapter {
  private token: string;
  private baseUrl = 'https://api.vercel.com';

  constructor(token?: string) {
    this.token = token || process.env.VERCEL_TOKEN || '';
  }

  /**
   * Execute a Vercel action
   */
  async execute(params: VercelParams): Promise<VercelResult> {
    try {
      switch (params.action) {
        case 'deploy':
          return await this.deploy(params.projectName!, params.files || {});
        case 'getDeployments':
          return await this.getDeployments(params.projectId!);
        case 'getProject':
          return await this.getProject(params.projectId!);
        case 'createProject':
          return await this.createProject(params.projectName!, params.framework);
        case 'deleteDeployment':
          return await this.deleteDeployment(params.deploymentId!);
        default:
          return { success: false, error: `Unknown action: ${params.action}` };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message || 'Unknown error',
      };
    }
  }

  /**
   * Deploy files to a Vercel project
   */
  async deploy(projectName: string, files: Record<string, string>): Promise<VercelResult> {
    if (!projectName) {
      return { success: false, error: 'projectName is required' };
    }

    // Convert files object to Vercel file array format
    const fileList = Object.entries(files).map(([file, content]) => ({
      file,
      data: content,
      encoding: 'utf-8',
    }));

    if (fileList.length === 0) {
      return { success: false, error: 'At least one file is required for deployment' };
    }

    const response = await axios.post(
      `${this.baseUrl}/v13/deployments`,
      {
        name: projectName,
        files: fileList,
        projectSettings: {
          framework: this.detectFramework(files),
        },
      },
      { headers: this.getHeaders() }
    );

    return {
      success: true,
      data: {
        deploymentId: response.data.id,
        url: response.data.url,
        state: response.data.readyState || response.data.state,
        inspectUrl: response.data.inspectorUrl,
        alias: response.data.alias,
      },
    };
  }

  /**
   * Get deployments for a project
   */
  async getDeployments(projectId: string): Promise<VercelResult> {
    if (!projectId) {
      return { success: false, error: 'projectId is required' };
    }

    const response = await axios.get(`${this.baseUrl}/v6/deployments`, {
      headers: this.getHeaders(),
      params: {
        projectId,
        limit: 20,
      },
    });

    const deployments = (response.data.deployments || []).map((d: any) => ({
      id: d.id,
      url: d.url,
      state: d.readyState || d.state,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      meta: d.meta,
      target: d.target,
      alias: d.alias,
    }));

    return {
      success: true,
      data: { deployments, count: deployments.length },
    };
  }

  /**
   * Get project details
   */
  async getProject(projectId: string): Promise<VercelResult> {
    if (!projectId) {
      return { success: false, error: 'projectId is required' };
    }

    const response = await axios.get(`${this.baseUrl}/v9/projects/${projectId}`, {
      headers: this.getHeaders(),
    });

    const project = response.data;

    return {
      success: true,
      data: {
        id: project.id,
        name: project.name,
        framework: project.framework,
        accountId: project.accountId,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        targets: project.targets,
        rootDirectory: project.rootDirectory,
        domains: project.aliases || [],
      },
    };
  }

  /**
   * Create a new Vercel project
   */
  async createProject(name: string, framework?: string): Promise<VercelResult> {
    if (!name) {
      return { success: false, error: 'projectName is required' };
    }

    const response = await axios.post(
      `${this.baseUrl}/v9/projects`,
      {
        name,
        framework: framework || null,
      },
      { headers: this.getHeaders() }
    );

    return {
      success: true,
      data: {
        id: response.data.id,
        name: response.data.name,
        framework: response.data.framework,
        accountId: response.data.accountId,
        createdAt: response.data.createdAt,
      },
    };
  }

  /**
   * Delete a deployment
   */
  async deleteDeployment(deploymentId: string): Promise<VercelResult> {
    if (!deploymentId) {
      return { success: false, error: 'deploymentId is required' };
    }

    await axios.delete(`${this.baseUrl}/v13/deployments/${deploymentId}`, {
      headers: this.getHeaders(),
    });

    return {
      success: true,
      data: { deploymentId, deleted: true },
    };
  }

  /**
   * Build request headers with auth
   */
  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Detect framework from file contents
   */
  private detectFramework(files: Record<string, string>): string {
    if (files['next.config.js'] || files['next.config.mjs'] || files['next.config.ts']) {
      return 'nextjs';
    }

    if (files['nuxt.config.js'] || files['nuxt.config.ts']) {
      return 'nuxtjs';
    }

    if (files['gatsby-config.js'] || files['gatsby-config.ts']) {
      return 'gatsby';
    }

    if (files['vite.config.js'] || files['vite.config.ts']) {
      return 'vite';
    }

    if (files['angular.json']) {
      return 'angular';
    }

    return 'other';
  }
}

export default VercelAdapter;
