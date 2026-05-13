/**
 * Web Search Adapter Tests
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ─── Mock axios BEFORE importing the module ─────────────────────────────

const mockAxiosGet = vi.fn();

vi.mock('axios', () => ({
  default: {
    get: (...args: any[]) => mockAxiosGet(...args),
  },
}));

// ─── Import module (mocks are active) ────────────────────────────────────

import WebSearchAdapter from '../tools/websearch.js';

describe('WebSearchAdapter', () => {
  let adapter: WebSearchAdapter;
  let serpAdapter: WebSearchAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new WebSearchAdapter(); // No API key → DuckDuckGo
    serpAdapter = new WebSearchAdapter('test-serp-key'); // With API key → SerpAPI
  });

  // ═══════════════════════════════════════════════════════════════════════
  // search()
  // ═══════════════════════════════════════════════════════════════════════
  describe('search', () => {
    it('should return error for empty query', async () => {
      const result = await adapter.search('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('query is required');
      expect(mockAxiosGet).not.toHaveBeenCalled();
    });

    it('should use SerpAPI when serpApiKey is set', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          organic_results: [
            { title: 'Result 1', link: 'https://example.com/1', snippet: 'Snippet 1' },
            { title: 'Result 2', link: 'https://example.com/2', snippet: 'Snippet 2' },
          ],
        },
      });

      const result = await serpAdapter.search('test query');

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://serpapi.com/search',
        expect.objectContaining({
          params: expect.objectContaining({
            q: 'test query',
            api_key: 'test-serp-key',
          }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.data!.results).toHaveLength(2);
    });

    it('should use DuckDuckGo when no serpApiKey', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          Abstract: 'An abstract answer',
          Heading: 'Test Topic',
          AbstractURL: 'https://example.com',
          RelatedTopics: [],
        },
      });

      const result = await adapter.search('test query');

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://api.duckduckgo.com',
        expect.objectContaining({
          params: expect.objectContaining({
            q: 'test query',
            format: 'json',
          }),
        }),
      );
      expect(result.success).toBe(true);
    });

    it('should pass numResults to SerpAPI', async () => {
      mockAxiosGet.mockResolvedValueOnce({ data: { organic_results: [] } });

      await serpAdapter.search('test', 5);

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://serpapi.com/search',
        expect.objectContaining({
          params: expect.objectContaining({
            num: 5,
          }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // searchSerpApi (tested via search with serpApiKey)
  // ═══════════════════════════════════════════════════════════════════════
  describe('searchSerpApi', () => {
    it('should map organic_results correctly', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          organic_results: [
            { title: 'Title A', link: 'https://a.com', snippet: 'Snippet A' },
            { title: 'Title B', link: 'https://b.com', snippet: 'Snippet B' },
            { title: 'Title C', link: 'https://c.com', snippet: 'Snippet C' },
          ],
        },
      });

      const result = await serpAdapter.search('search test');

      expect(result.success).toBe(true);
      expect(result.data!.results).toHaveLength(3);
      expect(result.data!.results[0]).toEqual({ title: 'Title A', link: 'https://a.com', snippet: 'Snippet A' });
      expect(result.data!.count).toBe(3);
    });

    it('should handle empty organic_results', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { organic_results: [] },
      });

      const result = await serpAdapter.search('no results');

      expect(result.success).toBe(true);
      expect(result.data!.results).toHaveLength(0);
      expect(result.data!.count).toBe(0);
    });

    it('should cap numResults at 10 for SerpAPI', async () => {
      mockAxiosGet.mockResolvedValueOnce({ data: { organic_results: [] } });

      await serpAdapter.search('test', 100);

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://serpapi.com/search',
        expect.objectContaining({
          params: expect.objectContaining({
            num: 10,
          }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // searchDuckDuckGo
  // ═══════════════════════════════════════════════════════════════════════
  describe('searchDuckDuckGo', () => {
    it('should handle Abstract response', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          Abstract: 'TypeScript is a typed superset of JavaScript.',
          Heading: 'TypeScript',
          AbstractURL: 'https://example.com/typescript',
          RelatedTopics: [],
        },
      });

      const result = await adapter.search('TypeScript');

      expect(result.success).toBe(true);
      expect(result.data!.results).toHaveLength(1);
      expect(result.data!.results[0].title).toBe('TypeScript');
      expect(result.data!.results[0].snippet).toBe('TypeScript is a typed superset of JavaScript.');
      expect(result.data!.results[0].link).toBe('https://example.com/typescript');
    });

    it('should handle RelatedTopics', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          Abstract: '',
          Heading: '',
          AbstractURL: '',
          RelatedTopics: [
            { Text: 'Topic one text here', FirstURL: 'https://topic1.com' },
            { Text: 'Topic two text here', FirstURL: 'https://topic2.com' },
            { Text: 'Topic three text here', FirstURL: 'https://topic3.com' },
          ],
        },
      });

      const result = await adapter.search('topics test');

      expect(result.success).toBe(true);
      expect(result.data!.results).toHaveLength(3);
      expect(result.data!.results[0].title).toBe('Topic one text here'.substring(0, 80));
      expect(result.data!.results[0].link).toBe('https://topic1.com');
    });

    it('should catch axios errors', async () => {
      mockAxiosGet.mockRejectedValueOnce(new Error('Network error'));

      const result = await adapter.search('error test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('DuckDuckGo search failed');
      expect(result.error).toContain('Network error');
    });

    it('should respect numResults for RelatedTopics slicing', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          Abstract: '',
          Heading: '',
          AbstractURL: '',
          RelatedTopics: [
            { Text: 'Topic 1', FirstURL: 'https://t1.com' },
            { Text: 'Topic 2', FirstURL: 'https://t2.com' },
            { Text: 'Topic 3', FirstURL: 'https://t3.com' },
            { Text: 'Topic 4', FirstURL: 'https://t4.com' },
            { Text: 'Topic 5', FirstURL: 'https://t5.com' },
          ],
        },
      });

      const result = await adapter.search('limited', 2);

      expect(result.success).toBe(true);
      expect(result.data!.results).toHaveLength(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // getLatestNews()
  // ═══════════════════════════════════════════════════════════════════════
  describe('getLatestNews', () => {
    it('should construct correct query with topic', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { Abstract: 'AI news today', Heading: 'AI', AbstractURL: 'https://ai.news', RelatedTopics: [] },
      });

      await adapter.getLatestNews('AI');

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://api.duckduckgo.com',
        expect.objectContaining({
          params: expect.objectContaining({
            q: 'latest tech news AI',
          }),
        }),
      );
    });

    it('should use default query without topic', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { Abstract: 'General tech news', Heading: 'Tech', AbstractURL: 'https://tech.news', RelatedTopics: [] },
      });

      await adapter.getLatestNews();

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://api.duckduckgo.com',
        expect.objectContaining({
          params: expect.objectContaining({
            q: 'latest tech news',
          }),
        }),
      );
    });

    it('should set data.source to "tech news"', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { Abstract: 'News result', Heading: 'News', AbstractURL: 'https://n.com', RelatedTopics: [] },
      });

      const result = await adapter.getLatestNews();

      expect(result.success).toBe(true);
      expect(result.data!.source).toBe('tech news');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // getDocs()
  // ═══════════════════════════════════════════════════════════════════════
  describe('getDocs', () => {
    it('should return error when library is missing', async () => {
      const result = await adapter.getDocs('', 'hooks');

      expect(result.success).toBe(false);
      expect(result.error).toBe('library and topic are required');
    });

    it('should return error when topic is missing', async () => {
      const result = await adapter.getDocs('react', '');

      expect(result.success).toBe(false);
      expect(result.error).toBe('library and topic are required');
    });

    it('should construct correct query', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { Abstract: 'React hooks docs', Heading: 'React', AbstractURL: 'https://react.dev', RelatedTopics: [] },
      });

      await adapter.getDocs('react', 'hooks');

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://api.duckduckgo.com',
        expect.objectContaining({
          params: expect.objectContaining({
            q: 'react documentation hooks',
          }),
        }),
      );
    });

    it('should set data.source to library docs', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { Abstract: 'Docs', Heading: 'Vue', AbstractURL: 'https://vue.org', RelatedTopics: [] },
      });

      const result = await adapter.getDocs('vue', 'reactivity');

      expect(result.success).toBe(true);
      expect(result.data!.source).toBe('vue docs');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // getStackOverflow()
  // ═══════════════════════════════════════════════════════════════════════
  describe('getStackOverflow', () => {
    it('should return error for empty question', async () => {
      const result = await adapter.getStackOverflow('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('question is required');
    });

    it('should map StackExchange response correctly', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          items: [
            {
              title: 'How to use useState',
              link: 'https://stackoverflow.com/q/123',
              body: '<p>Use useState like this:</p><pre>const [x, setX] = useState(0)</pre>',
              score: 15,
              answer_count: 3,
            },
          ],
        },
      });

      const result = await adapter.getStackOverflow('how to use useState in react');

      expect(result.success).toBe(true);
      expect(result.data!.results).toHaveLength(1);
      expect(result.data!.results[0].title).toBe('How to use useState');
      expect(result.data!.results[0].link).toBe('https://stackoverflow.com/q/123');
      expect(result.data!.results[0].source).toBe('stackoverflow');
      expect(result.data!.results[0].score).toBe(15);
      expect(result.data!.results[0].answerCount).toBe(3);
      expect(result.data!.count).toBe(1);
    });

    it('should strip HTML from body', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          items: [
            {
              title: 'HTML strip test',
              link: 'https://stackoverflow.com/q/456',
              body: '<p>Hello <strong>world</strong></p><code>const x = 1;</code>',
              score: 5,
              answer_count: 1,
            },
          ],
        },
      });

      const result = await adapter.getStackOverflow('strip html test');

      expect(result.success).toBe(true);
      const snippet = result.data!.results[0].snippet;
      // HTML tags should be stripped
      expect(snippet).not.toContain('<p>');
      expect(snippet).not.toContain('<strong>');
      expect(snippet).not.toContain('<code>');
      expect(snippet).toContain('Hello');
      expect(snippet).toContain('world');
    });

    it('should truncate snippet to 300 characters', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          items: [
            {
              title: 'Long snippet',
              link: 'https://stackoverflow.com/q/789',
              body: '<p>' + 'a'.repeat(400) + '</p>',
              score: 1,
              answer_count: 0,
            },
          ],
        },
      });

      const result = await adapter.getStackOverflow('long test');

      expect(result.success).toBe(true);
      expect(result.data!.results[0].snippet.length).toBeLessThanOrEqual(300);
    });

    it('should fall back to search on StackExchange API error', async () => {
      mockAxiosGet
        .mockRejectedValueOnce(new Error('StackExchange API down')) // getStackOverflow fails
        .mockResolvedValueOnce({
          data: { Abstract: 'Fallback result', Heading: 'Fallback', AbstractURL: 'https://fallback.com', RelatedTopics: [] },
        }); // search fallback via DuckDuckGo

      const result = await adapter.getStackOverflow('fallback test');

      expect(result.success).toBe(true);
      // The fallback should have called the DuckDuckGo endpoint
      expect(mockAxiosGet).toHaveBeenCalledTimes(2);
    });

    it('should call StackExchange with correct params', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { items: [] },
      });

      await adapter.getStackOverflow('react hooks');

      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://api.stackexchange.com/2.3/search/advanced',
        expect.objectContaining({
          params: expect.objectContaining({
            q: 'react hooks',
            site: 'stackoverflow',
            answers: 1,
            filter: 'withbody',
          }),
        }),
      );
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

    it('should route to search for action "search"', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { Abstract: 'Search result', Heading: 'Test', AbstractURL: 'https://test.com', RelatedTopics: [] },
      });

      const result = await adapter.execute({ action: 'search', query: 'test' });

      expect(result.success).toBe(true);
      expect(mockAxiosGet).toHaveBeenCalledWith(
        'https://api.duckduckgo.com',
        expect.objectContaining({
          params: expect.objectContaining({ q: 'test' }),
        }),
      );
    });

    it('should route to getLatestNews for action "getLatestNews"', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { Abstract: 'News', Heading: 'N', AbstractURL: 'https://n.com', RelatedTopics: [] },
      });

      const result = await adapter.execute({ action: 'getLatestNews', topic: 'tech' });

      expect(result.success).toBe(true);
      expect(result.data!.source).toBe('tech news');
    });

    it('should route to getDocs for action "getDocs"', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { Abstract: 'Docs', Heading: 'D', AbstractURL: 'https://d.com', RelatedTopics: [] },
      });

      const result = await adapter.execute({ action: 'getDocs', library: 'react', topic: 'hooks' });

      expect(result.success).toBe(true);
      expect(result.data!.source).toBe('react docs');
    });

    it('should route to getStackOverflow for action "getStackOverflow"', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: { items: [] },
      });

      const result = await adapter.execute({ action: 'getStackOverflow', query: 'how to debug' });

      expect(result.success).toBe(true);
    });

    it('should catch and return errors from routed methods', async () => {
      mockAxiosGet.mockRejectedValueOnce(new Error('API down'));

      const result = await adapter.execute({ action: 'search', query: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
