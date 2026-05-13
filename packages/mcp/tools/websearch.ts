/**
 * Web Search MCP Tool
 * Search the web, get news, docs, and StackOverflow answers
 *
 * Based on pskill9/web-search from the MCP ecosystem
 * Uses SERPAPI_KEY env var; falls back to DuckDuckGo free API
 */

import axios from 'axios';

export interface WebSearchTool {
  name: 'websearch';
  permissions: ['network', 'read'];
  execute: (params: WebSearchParams) => Promise<WebSearchResult>;
}

export interface WebSearchParams {
  action: 'search' | 'getLatestNews' | 'getDocs' | 'getStackOverflow';
  query?: string;
  topic?: string;
  library?: string;
  numResults?: number;
}

export interface WebSearchResult {
  success: boolean;
  data?: {
    results?: Array<{
      title: string;
      link: string;
      snippet: string;
      source?: string;
    }>;
    count?: number;
  };
  error?: string;
}

class WebSearchAdapter {
  private serpApiKey: string;
  private readonly serpBaseUrl = 'https://serpapi.com/search';
  private readonly ddgBaseUrl = 'https://api.duckduckgo.com';

  constructor(serpApiKey?: string) {
    this.serpApiKey = serpApiKey || process.env.SERPAPI_KEY || '';
  }

  /**
   * Execute a web search action
   */
  async execute(params: WebSearchParams): Promise<WebSearchResult> {
    try {
      switch (params.action) {
        case 'search':
          return await this.search(params.query!, params.numResults);
        case 'getLatestNews':
          return await this.getLatestNews(params.topic);
        case 'getDocs':
          return await this.getDocs(params.library!, params.topic!);
        case 'getStackOverflow':
          return await this.getStackOverflow(params.query!);
        default:
          return { success: false, error: `Unknown action: ${params.action}` };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * General web search via SerpAPI or DuckDuckGo fallback
   */
  async search(query: string, numResults: number = 10): Promise<WebSearchResult> {
    if (!query) {
      return { success: false, error: 'query is required' };
    }

    if (this.serpApiKey) {
      return await this.searchSerpApi(query, numResults);
    }

    return await this.searchDuckDuckGo(query, numResults);
  }

  /**
   * Get latest tech news
   */
  async getLatestNews(topic?: string): Promise<WebSearchResult> {
    const q = topic ? `latest tech news ${topic}` : 'latest tech news';
    const result = await this.search(q, 10);

    if (result.success && result.data) {
      result.data.source = 'tech news';
    }

    return result;
  }

  /**
   * Search documentation for a library
   */
  async getDocs(library: string, topic: string): Promise<WebSearchResult> {
    if (!library || !topic) {
      return { success: false, error: 'library and topic are required' };
    }

    const q = `${library} documentation ${topic}`;
    const result = await this.search(q, 10);

    if (result.success && result.data) {
      result.data.source = `${library} docs`;
    }

    return result;
  }

  /**
   * Search StackOverflow for answers
   */
  async getStackOverflow(question: string): Promise<WebSearchResult> {
    if (!question) {
      return { success: false, error: 'question is required' };
    }

    // Use Stack Exchange API directly for better results
    try {
      const response = await axios.get('https://api.stackexchange.com/2.3/search/advanced', {
        params: {
          order: 'desc',
          sort: 'relevance',
          q: question,
          site: 'stackoverflow',
          answers: 1,
          filter: 'withbody',
          limit: 5,
        },
      });

      const items = (response.data.items || []).map((item: any) => ({
        title: item.title,
        link: item.link,
        snippet: this.stripHtml(item.body || '').substring(0, 300),
        source: 'stackoverflow',
        score: item.score,
        answerCount: item.answer_count,
      }));

      return {
        success: true,
        data: { results: items, count: items.length },
      };
    } catch {
      // Fallback to general search with site:stackoverflow.com
      return await this.search(`site:stackoverflow.com ${question}`, 5);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE SEARCH IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Search via SerpAPI (Google results)
   */
  private async searchSerpApi(query: string, numResults: number): Promise<WebSearchResult> {
    const response = await axios.get(this.serpBaseUrl, {
      params: {
        q: query,
        api_key: this.serpApiKey,
        num: Math.min(numResults, 10),
      },
    });

    const organicResults = (response.data.organic_results || []).map((r: any) => ({
      title: r.title,
      link: r.link,
      snippet: r.snippet,
    }));

    return {
      success: true,
      data: { results: organicResults, count: organicResults.length },
    };
  }

  /**
   * Search via DuckDuckGo Instant Answer API (free, no key required)
   */
  private async searchDuckDuckGo(query: string, numResults: number): Promise<WebSearchResult> {
    try {
      const response = await axios.get(this.ddgBaseUrl, {
        params: {
          q: query,
          format: 'json',
          no_html: 1,
          skip_disambig: 1,
        },
      });

      const results: Array<{ title: string; link: string; snippet: string }> = [];

      // Abstract — main instant answer
      if (response.data.Abstract) {
        results.push({
          title: response.data.Heading || query,
          link: response.data.AbstractURL,
          snippet: response.data.Abstract,
        });
      }

      // Related topics
      const topics = response.data.RelatedTopics || [];
      for (const topic of topics.slice(0, numResults)) {
        if (topic.Text) {
          results.push({
            title: topic.Text.substring(0, 80),
            link: topic.FirstURL || '',
            snippet: topic.Text,
          });
        }
      }

      return {
        success: true,
        data: { results: results.slice(0, numResults), count: results.length },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `DuckDuckGo search failed: ${error.message}`,
      };
    }
  }

  /**
   * Strip HTML tags from a string
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}

export default WebSearchAdapter;
