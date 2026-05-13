/**
 * Notion MCP Tool
 * Fetches content from Notion pages and databases
 */

import { Client } from '@notionhq/client';

export interface NotionTool {
  name: 'notion';
  permissions: ['network', 'read'];
  execute: (params: NotionParams) => Promise<NotionResult>;
}

export interface NotionParams {
  pageId?: string;
  databaseId?: string;
  query?: string;
  format?: 'markdown' | 'json' | 'html';
}

export interface NotionResult {
  success: boolean;
  data?: {
    title: string;
    content: string;
    metadata?: Record<string, any>;
    children?: any[];
  };
  error?: string;
}

class NotionAdapter {
  private client: Client;

  constructor(authToken: string) {
    this.client = new Client({ auth: authToken });
  }

  /**
   * Execute Notion content extraction
   */
  async execute(params: NotionParams): Promise<NotionResult> {
    try {
      if (params.pageId) {
        return await this.fetchPage(params.pageId, params.format || 'markdown');
      }

      if (params.databaseId) {
        return await this.queryDatabase(params.databaseId, params.query);
      }

      return {
        success: false,
        error: 'Either pageId or databaseId must be provided',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Fetch page content
   */
  private async fetchPage(
    pageId: string,
    format: string
  ): Promise<NotionResult> {
    // Fetch page metadata
    const page: any = await this.client.pages.retrieve({ page_id: pageId });

    // Fetch page blocks (content)
    const blocks = await this.client.blocks.children.list({
      block_id: pageId,
    });

    // Extract title
    const title = this.extractTitle(page);

    // Convert blocks to desired format
    const content = this.convertBlocks(blocks.results, format);

    return {
      success: true,
      data: {
        title,
        content,
        metadata: {
          id: page.id,
          createdTime: page.created_time,
          lastEditedTime: page.last_edited_time,
        },
        children: blocks.results,
      },
    };
  }

  /**
   * Query database
   */
  private async queryDatabase(
    databaseId: string,
    query?: string
  ): Promise<NotionResult> {
    const response: any = await this.client.databases.query({
      database_id: databaseId,
      filter: query
        ? {
            property: 'Name',
            title: {
              contains: query,
            },
          }
        : undefined,
    });

    const items = response.results.map((page: any) => ({
      id: page.id,
      title: this.extractTitle(page),
      properties: page.properties,
      url: page.url,
    }));

    return {
      success: true,
      data: {
        title: 'Database Query Results',
        content: JSON.stringify(items, null, 2),
        metadata: {
          count: items.length,
        },
        children: items,
      },
    };
  }

  /**
   * Extract title from page
   */
  private extractTitle(page: any): string {
    try {
      const titleProp = Object.values(page.properties).find(
        (prop: any) => prop.type === 'title'
      ) as any;

      if (titleProp && titleProp.title && titleProp.title[0]) {
        return titleProp.title[0].plain_text;
      }

      return 'Untitled';
    } catch {
      return 'Untitled';
    }
  }

  /**
   * Convert blocks to format
   */
  private convertBlocks(blocks: any[], format: string): string {
    if (format === 'json') {
      return JSON.stringify(blocks, null, 2);
    }

    if (format === 'html') {
      return this.blocksToHTML(blocks);
    }

    // Default: Markdown
    return this.blocksToMarkdown(blocks);
  }

  /**
   * Convert blocks to Markdown
   */
  private blocksToMarkdown(blocks: any[]): string {
    return blocks
      .map((block) => {
        const type = block.type;
        const content = block[type];

        switch (type) {
          case 'paragraph':
            return this.richTextToMarkdown(content.rich_text) + '\n';
          case 'heading_1':
            return '# ' + this.richTextToMarkdown(content.rich_text) + '\n';
          case 'heading_2':
            return '## ' + this.richTextToMarkdown(content.rich_text) + '\n';
          case 'heading_3':
            return '### ' + this.richTextToMarkdown(content.rich_text) + '\n';
          case 'bulleted_list_item':
            return '- ' + this.richTextToMarkdown(content.rich_text) + '\n';
          case 'numbered_list_item':
            return '1. ' + this.richTextToMarkdown(content.rich_text) + '\n';
          case 'code':
            return (
              '```' +
              (content.language || '') +
              '\n' +
              this.richTextToMarkdown(content.rich_text) +
              '\n```\n'
            );
          case 'quote':
            return '> ' + this.richTextToMarkdown(content.rich_text) + '\n';
          default:
            return '';
        }
      })
      .join('');
  }

  /**
   * Convert blocks to HTML
   */
  private blocksToHTML(blocks: any[]): string {
    return blocks
      .map((block) => {
        const type = block.type;
        const content = block[type];

        switch (type) {
          case 'paragraph':
            return `<p>${this.richTextToHTML(content.rich_text)}</p>`;
          case 'heading_1':
            return `<h1>${this.richTextToHTML(content.rich_text)}</h1>`;
          case 'heading_2':
            return `<h2>${this.richTextToHTML(content.rich_text)}</h2>`;
          case 'heading_3':
            return `<h3>${this.richTextToHTML(content.rich_text)}</h3>`;
          case 'bulleted_list_item':
            return `<li>${this.richTextToHTML(content.rich_text)}</li>`;
          case 'code':
            return `<pre><code class="language-${content.language || 'text'}">${this.richTextToHTML(content.rich_text)}</code></pre>`;
          default:
            return '';
        }
      })
      .join('');
  }

  /**
   * Convert rich text to Markdown
   */
  private richTextToMarkdown(richText: any[]): string {
    if (!richText) return '';
    return richText.map((text) => text.plain_text).join('');
  }

  /**
   * Convert rich text to HTML
   */
  private richTextToHTML(richText: any[]): string {
    if (!richText) return '';
    return richText
      .map((text) => {
        let html = text.plain_text;
        if (text.annotations.bold) html = `<strong>${html}</strong>`;
        if (text.annotations.italic) html = `<em>${html}</em>`;
        if (text.annotations.code) html = `<code>${html}</code>`;
        return html;
      })
      .join('');
  }
}

export default NotionAdapter;
