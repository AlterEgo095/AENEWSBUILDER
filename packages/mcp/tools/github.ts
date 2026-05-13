/**
 * GitHub MCP Tool
 * Manage repositories, files, issues, and code search on GitHub
 *
 * Uses GitHub REST API v3 — requires GITHUB_TOKEN env var
 */

import axios from 'axios';

export interface GitHubTool {
  name: 'github';
  permissions: ['network', 'read', 'write'];
  execute: (params: GitHubParams) => Promise<GitHubResult>;
}

export interface GitHubParams {
  action: 'createRepo' | 'getFile' | 'createIssue' | 'searchCode' | 'getReadme';
  name?: string;
  org?: string;
  private?: boolean;
  owner?: string;
  repo?: string;
  path?: string;
  title?: string;
  body?: string;
  query?: string;
  language?: string;
}

export interface GitHubResult {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
}

class GitHubAdapter {
  private token: string;
  private baseUrl = 'https://api.github.com';

  constructor(token?: string) {
    this.token = token || process.env.GITHUB_TOKEN || '';
  }

  /**
   * Execute a GitHub action
   */
  async execute(params: GitHubParams): Promise<GitHubResult> {
    try {
      switch (params.action) {
        case 'createRepo':
          return await this.createRepo(params.name!, params.org, params.private);
        case 'getFile':
          return await this.getFile(params.owner!, params.repo!, params.path!);
        case 'createIssue':
          return await this.createIssue(params.owner!, params.repo!, params.title!, params.body!);
        case 'searchCode':
          return await this.searchCode(params.query!, params.language);
        case 'getReadme':
          return await this.getReadme(params.owner!, params.repo!);
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
   * Create a new GitHub repository
   */
  async createRepo(name: string, org?: string, isPrivate: boolean = false): Promise<GitHubResult> {
    if (!name) {
      return { success: false, error: 'Repository name is required' };
    }

    const url = org
      ? `${this.baseUrl}/orgs/${org}/repos`
      : `${this.baseUrl}/user/repos`;

    const response = await axios.post(
      url,
      {
        name,
        private: isPrivate,
        auto_init: true,
      },
      { headers: this.getHeaders() }
    );

    return {
      success: true,
      data: {
        id: response.data.id,
        name: response.data.full_name,
        url: response.data.html_url,
        cloneUrl: response.data.clone_url,
        private: response.data.private,
      },
    };
  }

  /**
   * Get file content from a repository
   */
  async getFile(owner: string, repo: string, path: string): Promise<GitHubResult> {
    if (!owner || !repo || !path) {
      return { success: false, error: 'owner, repo, and path are required' };
    }

    const response = await axios.get(
      `${this.baseUrl}/repos/${owner}/${repo}/contents/${path}`,
      { headers: this.getHeaders() }
    );

    const item = response.data;

    // If directory, return listing
    if (Array.isArray(item)) {
      return {
        success: true,
        data: {
          type: 'directory',
          path,
          entries: item.map((f: any) => ({
            name: f.name,
            type: f.type,
            size: f.size,
            path: f.path,
          })),
        },
      };
    }

    // Single file — decode base64 content
    const content = item.content
      ? Buffer.from(item.content.replace(/\n/g, ''), 'base64').toString('utf-8')
      : '';

    return {
      success: true,
      data: {
        type: 'file',
        name: item.name,
        path: item.path,
        size: item.size,
        sha: item.sha,
        encoding: item.encoding,
        content,
      },
    };
  }

  /**
   * Create a new issue in a repository
   */
  async createIssue(owner: string, repo: string, title: string, body: string): Promise<GitHubResult> {
    if (!owner || !repo || !title) {
      return { success: false, error: 'owner, repo, and title are required' };
    }

    const response = await axios.post(
      `${this.baseUrl}/repos/${owner}/${repo}/issues`,
      { title, body },
      { headers: this.getHeaders() }
    );

    return {
      success: true,
      data: {
        id: response.data.id,
        number: response.data.number,
        url: response.data.html_url,
        title: response.data.title,
        state: response.data.state,
      },
    };
  }

  /**
   * Search code across GitHub
   */
  async searchCode(query: string, language?: string): Promise<GitHubResult> {
    if (!query) {
      return { success: false, error: 'query is required' };
    }

    const q = language ? `${query} language:${language}` : query;

    const response = await axios.get(`${this.baseUrl}/search/code`, {
      headers: this.getHeaders(),
      params: { q },
    });

    const items = (response.data.items || []).map((item: any) => ({
      name: item.name,
      path: item.path,
      repository: item.repository?.full_name,
      htmlUrl: item.html_url,
      score: item.score,
    }));

    return {
      success: true,
      data: {
        totalCount: response.data.total_count,
        results: items,
      },
    };
  }

  /**
   * Get README for a repository
   */
  async getReadme(owner: string, repo: string): Promise<GitHubResult> {
    if (!owner || !repo) {
      return { success: false, error: 'owner and repo are required' };
    }

    const response = await axios.get(
      `${this.baseUrl}/repos/${owner}/${repo}/readme`,
      {
        headers: {
          ...this.getHeaders(),
          Accept: 'application/vnd.github.v3.html',
        },
      }
    );

    return {
      success: true,
      data: {
        owner,
        repo,
        htmlContent: response.data,
        url: response.config.url,
      },
    };
  }

  /**
   * Build request headers with auth
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  }
}

export default GitHubAdapter;
