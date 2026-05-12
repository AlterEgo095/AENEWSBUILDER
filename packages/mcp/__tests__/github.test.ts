/**
 * GitHub Adapter Tests
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ─── Mock axios BEFORE importing the module ─────────────────────────────

const mockAxiosGet = vi.fn();
const mockAxiosPost = vi.fn();

vi.mock('axios', () => ({
  default: {
    get: (...args: any[]) => mockAxiosGet(...args),
    post: (...args: any[]) => mockAxiosPost(...args),
  },
}));

// ─── Import module (mocks are active) ────────────────────────────────────

import GitHubAdapter from '../tools/github.js';

describe('GitHubAdapter', () => {
  let adapter: GitHubAdapter;
  let authedAdapter: GitHubAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GitHubAdapter(); // No token
    authedAdapter = new GitHubAdapter('ghp_testtoken123'); // With token
  });

  // ═══════════════════════════════════════════════════════════════════════
  // createRepo()
  // ═══════════════════════════════════════════════════════════════════════
  describe('createRepo', () => {
    it('should return error for empty name', async () => {
      const result = await adapter.createRepo('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Repository name is required');
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('should create user repo when no org is provided', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          id: 123,
          full_name: 'myuser/my-repo',
          html_url: 'https://github.com/myuser/my-repo',
          clone_url: 'https://github.com/myuser/my-repo.git',
          private: false,
        },
      });

      const result = await authedAdapter.createRepo('my-repo');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.github.com/user/repos',
        expect.objectContaining({ name: 'my-repo', private: false, auto_init: true }),
        expect.any(Object),
      );
      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('myuser/my-repo');
      expect(result.data!.url).toBe('https://github.com/myuser/my-repo');
      expect(result.data!.cloneUrl).toBe('https://github.com/myuser/my-repo.git');
    });

    it('should create org repo when org is provided', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          id: 456,
          full_name: 'myorg/team-repo',
          html_url: 'https://github.com/myorg/team-repo',
          clone_url: 'https://github.com/myorg/team-repo.git',
          private: true,
        },
      });

      const result = await authedAdapter.createRepo('team-repo', 'myorg', true);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.github.com/orgs/myorg/repos',
        expect.objectContaining({ name: 'team-repo', private: true }),
        expect.any(Object),
      );
      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('myorg/team-repo');
      expect(result.data!.private).toBe(true);
    });

    it('should pass private flag correctly', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          id: 789,
          full_name: 'user/private-repo',
          html_url: 'https://github.com/user/private-repo',
          clone_url: 'https://github.com/user/private-repo.git',
          private: true,
        },
      });

      const result = await authedAdapter.createRepo('private-repo', undefined, true);

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.github.com/user/repos',
        expect.objectContaining({ private: true }),
        expect.any(Object),
      );
      expect(result.success).toBe(true);
      expect(result.data!.private).toBe(true);
    });

    it('should return repo data on success', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          id: 1,
          full_name: 'octocat/hello-world',
          html_url: 'https://github.com/octocat/hello-world',
          clone_url: 'https://github.com/octocat/hello-world.git',
          private: false,
        },
      });

      const result = await authedAdapter.createRepo('hello-world');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: 1,
        name: 'octocat/hello-world',
        url: 'https://github.com/octocat/hello-world',
        cloneUrl: 'https://github.com/octocat/hello-world.git',
        private: false,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // getFile()
  // ═══════════════════════════════════════════════════════════════════════
  describe('getFile', () => {
    it('should return error for missing params', async () => {
      const r1 = await adapter.getFile('', 'repo', 'path');
      expect(r1.success).toBe(false);
      expect(r1.error).toBe('owner, repo, and path are required');

      const r2 = await adapter.getFile('owner', '', 'path');
      expect(r2.success).toBe(false);
      expect(r2.error).toBe('owner, repo, and path are required');

      const r3 = await adapter.getFile('owner', 'repo', '');
      expect(r3.success).toBe(false);
      expect(r3.error).toBe('owner, repo, and path are required');
    });

    it('should return directory entries when response is an array', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: [
          { name: 'src', type: 'dir', size: 0, path: 'src' },
          { name: 'README.md', type: 'file', size: 1024, path: 'README.md' },
          { name: 'package.json', type: 'file', size: 512, path: 'package.json' },
        ],
      });

      const result = await adapter.getFile('owner', 'repo', 'src');

      expect(result.success).toBe(true);
      expect(result.data!.type).toBe('directory');
      expect(result.data!.entries).toHaveLength(3);
      expect(result.data!.entries[0]).toEqual({ name: 'src', type: 'dir', size: 0, path: 'src' });
    });

    it('should decode base64 content for single file', async () => {
      const content = Buffer.from('console.log("hello");').toString('base64');
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          name: 'index.js',
          path: 'src/index.js',
          size: 22,
          sha: 'abc123',
          encoding: 'base64',
          content: content,
        },
      });

      const result = await adapter.getFile('owner', 'repo', 'src/index.js');

      expect(result.success).toBe(true);
      expect(result.data!.type).toBe('file');
      expect(result.data!.name).toBe('index.js');
      expect(result.data!.content).toBe('console.log("hello");');
      expect(result.data!.sha).toBe('abc123');
      expect(result.data!.encoding).toBe('base64');
    });

    it('should handle file with no content', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          name: 'empty.txt',
          path: 'empty.txt',
          size: 0,
          sha: 'def456',
          encoding: 'base64',
          content: '',
        },
      });

      const result = await adapter.getFile('owner', 'repo', 'empty.txt');

      expect(result.success).toBe(true);
      expect(result.data!.content).toBe('');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // createIssue()
  // ═══════════════════════════════════════════════════════════════════════
  describe('createIssue', () => {
    it('should return error for missing params', async () => {
      const r1 = await adapter.createIssue('', 'repo', 'Title', 'Body');
      expect(r1.success).toBe(false);
      expect(r1.error).toBe('owner, repo, and title are required');

      const r2 = await adapter.createIssue('owner', '', 'Title', 'Body');
      expect(r2.success).toBe(false);
      expect(r2.error).toBe('owner, repo, and title are required');

      const r3 = await adapter.createIssue('owner', 'repo', '', 'Body');
      expect(r3.success).toBe(false);
      expect(r3.error).toBe('owner, repo, and title are required');
    });

    it('should create issue with title and body', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          id: 42,
          number: 7,
          html_url: 'https://github.com/owner/repo/issues/7',
          title: 'Bug fix needed',
          body: 'Something is broken',
          state: 'open',
        },
      });

      const result = await authedAdapter.createIssue('owner', 'repo', 'Bug fix needed', 'Something is broken');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/issues',
        { title: 'Bug fix needed', body: 'Something is broken' },
        expect.any(Object),
      );
      expect(result.success).toBe(true);
      expect(result.data!.id).toBe(42);
      expect(result.data!.number).toBe(7);
      expect(result.data!.url).toBe('https://github.com/owner/repo/issues/7');
      expect(result.data!.title).toBe('Bug fix needed');
      expect(result.data!.state).toBe('open');
    });

    it('should return issue data', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          id: 99,
          number: 12,
          html_url: 'https://github.com/o/r/issues/12',
          title: 'Feature request',
          body: 'Please add X',
          state: 'open',
        },
      });

      const result = await authedAdapter.createIssue('o', 'r', 'Feature request', 'Please add X');

      expect(result.data).toEqual({
        id: 99,
        number: 12,
        url: 'https://github.com/o/r/issues/12',
        title: 'Feature request',
        state: 'open',
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // searchCode()
  // ═══════════════════════════════════════════════════════════════════════
  describe('searchCode', () => {
    it('should return error for empty query', async () => {
      const result = await adapter.searchCode('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('query is required');
      expect(mockAxiosGet).not.toHaveBeenCalled();
    });

    it('should append language filter when language is provided', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { total_count: 5, items: [] },
      });

      await adapter.searchCode('useState', 'typescript');

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://api.github.com/search/code',
        expect.objectContaining({
          params: { q: 'useState language:typescript' },
        }),
      );
    });

    it('should not append language filter when language is not provided', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { total_count: 3, items: [] },
      });

      await adapter.searchCode('some query');

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://api.github.com/search/code',
        expect.objectContaining({
          params: { q: 'some query' },
        }),
      );
    });

    it('should return search results mapped correctly', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          total_count: 2,
          items: [
            {
              name: 'index.ts',
              path: 'src/index.ts',
              repository: { full_name: 'user/repo-a' },
              html_url: 'https://github.com/user/repo-a/blob/main/src/index.ts',
              score: 1.5,
            },
            {
              name: 'utils.ts',
              path: 'src/utils.ts',
              repository: { full_name: 'user/repo-b' },
              html_url: 'https://github.com/user/repo-b/blob/main/src/utils.ts',
              score: 0.8,
            },
          ],
        },
      });

      const result = await adapter.searchCode('export function');

      expect(result.success).toBe(true);
      expect(result.data!.totalCount).toBe(2);
      expect(result.data!.results).toHaveLength(2);
      expect(result.data!.results[0]).toEqual({
        name: 'index.ts',
        path: 'src/index.ts',
        repository: 'user/repo-a',
        htmlUrl: 'https://github.com/user/repo-a/blob/main/src/index.ts',
        score: 1.5,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // getReadme()
  // ═══════════════════════════════════════════════════════════════════════
  describe('getReadme', () => {
    it('should return error for missing params', async () => {
      const r1 = await adapter.getReadme('', 'repo');
      expect(r1.success).toBe(false);
      expect(r1.error).toBe('owner and repo are required');

      const r2 = await adapter.getReadme('owner', '');
      expect(r2.success).toBe(false);
      expect(r2.error).toBe('owner and repo are required');
    });

    it('should return HTML content', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: '<h1>My Project</h1><p>Description here</p>',
        config: { url: 'https://api.github.com/repos/owner/repo/readme' },
      });

      const result = await adapter.getReadme('owner', 'repo');

      expect(result.success).toBe(true);
      expect(result.data!.htmlContent).toBe('<h1>My Project</h1><p>Description here</p>');
      expect(result.data!.owner).toBe('owner');
      expect(result.data!.repo).toBe('repo');
      expect(result.data!.url).toBe('https://api.github.com/repos/owner/repo/readme');
    });

    it('should use correct Accept header for HTML readme', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: '<h1>Readme</h1>',
        config: { url: 'https://api.github.com/repos/o/r/readme' },
      });

      await adapter.getReadme('o', 'r');

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://api.github.com/repos/o/r/readme',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/vnd.github.v3.html',
          }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // getHeaders()
  // ═══════════════════════════════════════════════════════════════════════
  describe('getHeaders (via API calls)', () => {
    it('should include auth token when set', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          id: 1,
          full_name: 'user/repo',
          html_url: 'https://github.com/user/repo',
          clone_url: 'https://github.com/user/repo.git',
          private: false,
        },
      });

      await authedAdapter.createRepo('repo');

      const headers = mockAxiosPost.mock.calls[0][2].headers;
      expect(headers.Authorization).toBe('Bearer ghp_testtoken123');
    });

    it('should omit auth when no token', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          id: 1,
          full_name: 'user/repo',
          html_url: 'https://github.com/user/repo',
          clone_url: 'https://github.com/user/repo.git',
          private: false,
        },
      });

      await adapter.createRepo('repo');

      const headers = mockAxiosPost.mock.calls[0][2].headers;
      expect(headers.Authorization).toBeUndefined();
    });

    it('should always include Accept header', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          id: 1,
          full_name: 'user/repo',
          html_url: 'https://github.com/user/repo',
          clone_url: 'https://github.com/user/repo.git',
          private: false,
        },
      });

      await authedAdapter.createRepo('repo');

      const headers = mockAxiosPost.mock.calls[0][2].headers;
      expect(headers.Accept).toBe('application/vnd.github.v3+json');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // execute()
  // ═══════════════════════════════════════════════════════════════════════
  describe('execute', () => {
    it('should return error for unknown action', async () => {
      const result = await adapter.execute({ action: 'unknownAction' as any });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown action');
    });

    it('should route to createRepo for action "createRepo"', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          id: 1,
          full_name: 'u/r',
          html_url: 'https://github.com/u/r',
          clone_url: 'https://github.com/u/r.git',
          private: false,
        },
      });

      const result = await authedAdapter.execute({ action: 'createRepo', name: 'r' });

      expect(result.success).toBe(true);
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.github.com/user/repos',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should route to getFile for action "getFile"', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          name: 'test.js',
          path: 'test.js',
          size: 10,
          sha: 'abc',
          encoding: 'base64',
          content: Buffer.from('hi').toString('base64'),
        },
      });

      const result = await adapter.execute({ action: 'getFile', owner: 'o', repo: 'r', path: 'test.js' });

      expect(result.success).toBe(true);
      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://api.github.com/repos/o/r/contents/test.js',
        expect.any(Object),
      );
    });

    it('should route to createIssue for action "createIssue"', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          id: 1,
          number: 1,
          html_url: 'https://github.com/o/r/issues/1',
          title: 'Bug',
          state: 'open',
        },
      });

      const result = await authedAdapter.execute({ action: 'createIssue', owner: 'o', repo: 'r', title: 'Bug', body: 'Details' });

      expect(result.success).toBe(true);
    });

    it('should route to searchCode for action "searchCode"', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { total_count: 0, items: [] },
      });

      const result = await adapter.execute({ action: 'searchCode', query: 'test' });

      expect(result.success).toBe(true);
    });

    it('should route to getReadme for action "getReadme"', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: '<h1>Readme</h1>',
        config: { url: 'https://api.github.com/repos/o/r/readme' },
      });

      const result = await adapter.execute({ action: 'getReadme', owner: 'o', repo: 'r' });

      expect(result.success).toBe(true);
    });

    it('should catch GitHub API errors with response.data.message', async () => {
      const apiError = new Error('Request failed') as any;
      apiError.response = { data: { message: 'Bad credentials' } };
      mockAxiosPost.mockRejectedValueOnce(apiError);

      // Call through execute which has the try-catch
      const result = await authedAdapter.execute({ action: 'createRepo', name: 'repo' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Bad credentials');
    });

    it('should catch errors without response.data.message', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('Network error'));

      // Call through execute which has the try-catch
      const result = await authedAdapter.execute({ action: 'createRepo', name: 'repo' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });
});
