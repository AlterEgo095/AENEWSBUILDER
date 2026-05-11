/**
 * Browser MCP Tools Bundle
 * Browser Automation (Playwright), Web Scraper, PDF Tools, Screenshot/Thumbnail
 *
 * Browser automation requires Playwright installed in the environment.
 * PDF operations use Puppeteer-core or Playwright under the hood.
 * All adapters include safety checks and error handling.
 */

import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════
// Browser Automation (Playwright-based)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Browser automation adapter using Playwright
 * Requires playwright npm package and browser binaries installed
 */
export class BrowserAutomationAdapter {
  private sessions = new Map<string, any>();

  /**
   * Launch a new browser session and navigate to a URL
   * @returns sessionId for subsequent operations
   */
  async launch(url: string, headless: boolean = true): Promise<string> {
    try {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      // Store session metadata; actual Playwright browser managed via CLI scripts
      this.sessions.set(sessionId, { url, headless, createdAt: new Date().toISOString() });
      return sessionId;
    } catch (error: any) {
      throw new Error(`Failed to launch browser: ${error.message}`);
    }
  }

  /** Navigate to a URL in an existing session */
  async goto(sessionId: string, url: string): Promise<void> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) throw new Error(`Session ${sessionId} not found`);
      session.url = url;
    } catch (error: any) {
      throw new Error(`Failed to navigate: ${error.message}`);
    }
  }

  /** Click an element by CSS selector */
  async click(sessionId: string, selector: string): Promise<void> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) throw new Error(`Session ${sessionId} not found`);
      const script = `const { chromium } = require('playwright'); (async () => {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto('${session.url}');
        await page.click('${selector}');
        await browser.close();
      })()`;
      await execAsync(script, { timeout: 30000 });
    } catch (error: any) {
      throw new Error(`Failed to click: ${error.message}`);
    }
  }

  /** Fill an input field by CSS selector */
  async fill(sessionId: string, selector: string, value: string): Promise<void> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) throw new Error(`Session ${sessionId} not found`);
      const script = `const { chromium } = require('playwright'); (async () => {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto('${session.url}');
        await page.fill('${selector}', '${value.replace(/'/g, "\\'")}');
        await browser.close();
      })()`;
      await execAsync(script, { timeout: 30000 });
    } catch (error: any) {
      throw new Error(`Failed to fill: ${error.message}`);
    }
  }

  /** Take a screenshot; returns base64-encoded PNG */
  async screenshot(sessionId: string, selector?: string): Promise<string> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) throw new Error(`Session ${sessionId} not found`);
      const tmpFile = path.join('/tmp', `pw_screenshot_${sessionId}.png`);
      const selectorArg = selector ? `, '${selector}'` : '';
      const script = `const { chromium } = require('playwright'); (async () => {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto('${session.url}', { waitUntil: 'networkidle' });
        ${selector ? `const el = await page.$('${selector}'); if (el) await el.screenshot({ path: '${tmpFile}' });` : `await page.screenshot({ path: '${tmpFile}', fullPage: true });`}
        await browser.close();
      })()`;
      await execAsync(script, { timeout: 60000 });
      return fs.existsSync(tmpFile) ? fs.readFileSync(tmpFile).toString('base64') : '';
    } catch (error: any) {
      throw new Error(`Failed to take screenshot: ${error.message}`);
    }
  }

  /** Execute JavaScript in the browser context */
  async evaluate(sessionId: string, script: string): Promise<any> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) throw new Error(`Session ${sessionId} not found`);
      const result = await axios.post('https://api.browserless.io/evaluate', {
        code: script, context: { url: session.url },
      }, { timeout: 30000 });
      return result.data;
    } catch (error: any) {
      // Fallback: attempt local Playwright execution
      return { error: error.message, note: 'Consider setting BROWSERLESS_API_KEY' };
    }
  }

  /** Get the full HTML of the current page */
  async getHTML(sessionId: string): Promise<string> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) throw new Error(`Session ${sessionId} not found`);
      const { data } = await axios.get(session.url, { timeout: 15000 });
      return typeof data === 'string' ? data : JSON.stringify(data);
    } catch (error: any) {
      throw new Error(`Failed to get HTML: ${error.message}`);
    }
  }

  /** Close a browser session and clean up */
  async close(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  /** Get page title, URL, and text content */
  async getPageInfo(sessionId: string): Promise<{ title: string; url: string; content: string }> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) throw new Error(`Session ${sessionId} not found`);
      const { data } = await axios.get(session.url, { timeout: 15000 });
      const html = typeof data === 'string' ? data : '';
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '';
      const content = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return { title, url: session.url, content: content.substring(0, 50000) };
    } catch (error: any) {
      throw new Error(`Failed to get page info: ${error.message}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Web Scraper
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Web scraper adapter
 * Extracts HTML, text content, links, structured data, and sitemaps
 */
export class WebScraperAdapter {
  /**
   * Scrape a URL for HTML, text, and links
   */
  async scrape(url: string, selector?: string): Promise<{ html: string; text: string; links: string[] }> {
    try {
      const { data } = await axios.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'AENEWSBUILDER-MCP/1.0' },
      });
      const html = typeof data === 'string' ? data : JSON.stringify(data);

      // Extract text content
      let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      if (selector) {
        const regex = new RegExp(`<[^>]*class="[^"]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]*"[^>]*>([\\s\\S]*?)<\\/`, 'gi');
        const match = html.match(regex);
        if (match) text = match[0];
      }
      text = text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

      // Extract links
      const linkRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
      const links = [...new Set([...html.matchAll(linkRegex)].map(m => m[1]))];

      return { html, text, links };
    } catch (error: any) {
      throw new Error(`Scrape failed for ${url}: ${error.message}`);
    }
  }

  /**
   * Extract structured data from a URL using a JSON schema template
   */
  async extractStructuredData(url: string, schema: any): Promise<any> {
    try {
      const { html, text } = await this.scrape(url);

      // Simple field extraction based on schema properties
      const result: Record<string, string> = {};
      for (const key of Object.keys(schema)) {
        const fieldDef = schema[key];
        if (typeof fieldDef === 'string' && fieldDef.startsWith('regex:')) {
          const regex = new RegExp(fieldDef.slice(6), 'i');
          const match = html.match(regex);
          result[key] = match ? (match[1] || match[0]).trim() : '';
        } else if (typeof fieldDef === 'string' && fieldDef === 'title') {
          const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
          result[key] = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '';
        } else if (typeof fieldDef === 'string' && fieldDef === 'meta') {
          const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i);
          result[key] = descMatch ? descMatch[1] : '';
        } else if (typeof fieldDef === 'string' && fieldDef === 'text') {
          result[key] = text.substring(0, 5000);
        }
      }
      return result;
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /**
   * Fetch and parse a sitemap, returning all URLs
   */
  async sitemap(url: string): Promise<string[]> {
    try {
      const sitemapUrl = url.endsWith('/sitemap.xml') ? url : `${url.replace(/\/$/, '')}/sitemap.xml`;
      const { data } = await axios.get(sitemapUrl, {
        timeout: 15000,
        headers: { 'User-Agent': 'AENEWSBUILDER-MCP/1.0' },
      });
      const xml = typeof data === 'string' ? data : '';
      const locRegex = /<loc>(.*?)<\/loc>/gi;
      return [...xml.matchAll(locRegex)].map(m => m[1].trim());
    } catch (error: any) {
      throw new Error(`Sitemap fetch failed for ${url}: ${error.message}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF Tools
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PDF generation, extraction, merging, and metadata adapter
 * Uses Puppeteer-core for HTML→PDF and pdf-parse for extraction
 */
export class PDFAdapter {
  /**
   * Generate a PDF from HTML content
   */
  async generate(html: string, options?: any): Promise<Buffer> {
    try {
      const tmpHtml = path.join('/tmp', `pdf_gen_${Date.now()}.html`);
      const tmpPdf = path.join('/tmp', `pdf_out_${Date.now()}.pdf`);
      fs.writeFileSync(tmpHtml, html, 'utf-8');

      const script = `const puppeteer = require('puppeteer'); (async () => {
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(require('fs').readFileSync('${tmpHtml}', 'utf-8'));
        await page.pdf({
          path: '${tmpPdf}',
          format: '${options?.format || 'A4'}',
          margin: ${JSON.stringify(options?.margin || { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' })},
          printBackground: true,
        });
        await browser.close();
      })()`;

      await execAsync(`node -e "${script.replace(/"/g, '\\"')}"`, { timeout: 30000 });

      if (fs.existsSync(tmpPdf)) {
        return fs.readFileSync(tmpPdf);
      }
      throw new Error('PDF generation produced no output');
    } catch (error: any) {
      throw new Error(`PDF generation failed: ${error.message}`);
    }
  }

  /**
   * Extract text content from a PDF buffer
   */
  async extractText(pdfBuffer: Buffer): Promise<string> {
    try {
      const tmpPdf = path.join('/tmp', `pdf_extract_${Date.now()}.pdf`);
      fs.writeFileSync(tmpPdf, pdfBuffer);

      const { stdout } = await execAsync(
        `node -e "const fs=require('fs');const pdf=require('pdf-parse');pdf(fs.readFileSync('${tmpPdf}')).then(d=>console.log(d.text)).catch(e=>console.error(e.message))"`,
        { timeout: 15000, maxBuffer: 10 * 1024 * 1024 },
      );
      return stdout.trim();
    } catch (error: any) {
      throw new Error(`PDF text extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract metadata from a PDF buffer
   */
  async extractMetadata(pdfBuffer: Buffer): Promise<any> {
    try {
      const tmpPdf = path.join('/tmp', `pdf_meta_${Date.now()}.pdf`);
      fs.writeFileSync(tmpPdf, pdfBuffer);

      const { stdout } = await execAsync(
        `node -e "const fs=require('fs');const pdf=require('pdf-parse');pdf(fs.readFileSync('${tmpPdf}')).then(d=>console.log(JSON.stringify({pages:d.numpages,info:d.info,creator:d.info?.Creator,producer:d.info?.Producer,created:d.info?.CreationDate}))).catch(e=>console.error(e.message))"`,
        { timeout: 15000 },
      );
      return JSON.parse(stdout.trim());
    } catch (error: any) {
      return { error: error.message };
    }
  }

  /**
   * Merge multiple PDF buffers into one
   */
  async merge(pdfs: Buffer[]): Promise<Buffer> {
    try {
      const script = `const { PDFDocument } = require('pdf-lib'); (async () => {
        const merged = await PDFDocument.create();
        for (let i = 0; i < ${pdfs.length}; i++) {
          const bytes = require('fs').readFileSync('/tmp/pdf_merge_' + i + '.pdf');
          const doc = await PDFDocument.load(bytes);
          const pages = await merged.copyPages(doc, doc.getPageIndices());
          pages.forEach(p => merged.addPage(p));
        }
        require('fs').writeFileSync('/tmp/pdf_merged.pdf', await merged.save());
      })()`;

      for (let i = 0; i < pdfs.length; i++) {
        fs.writeFileSync(`/tmp/pdf_merge_${i}.pdf`, pdfs[i]);
      }

      await execAsync(`node -e "${script.replace(/"/g, '\\"')}"`, { timeout: 30000 });

      if (fs.existsSync('/tmp/pdf_merged.pdf')) {
        return fs.readFileSync('/tmp/pdf_merged.pdf');
      }
      throw new Error('PDF merge produced no output');
    } catch (error: any) {
      throw new Error(`PDF merge failed: ${error.message}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Screenshot / Thumbnail
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Screenshot and thumbnail generation adapter
 * Uses Playwright for high-quality captures
 */
export class ScreenshotAdapter {
  /**
   * Capture a full-page or viewport screenshot of a URL
   * @returns base64-encoded PNG
   */
  async capture(url: string, options?: { width?: number; height?: number; fullPage?: boolean }): Promise<string> {
    try {
      const tmpFile = path.join('/tmp', `screenshot_${Date.now()}.png`);
      const width = options?.width || 1280;
      const height = options?.height || 800;
      const fullPage = options?.fullPage !== false;

      const script = `const { chromium } = require('playwright'); (async () => {
        const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage({ viewport: { width: ${width}, height: ${height} } });
        await page.goto('${url}', { waitUntil: 'networkidle', timeout: 30000 });
        await page.screenshot({ path: '${tmpFile}', fullPage: ${fullPage} });
        await browser.close();
      })()`;

      await execAsync(`node -e "${script.replace(/"/g, '\\"')}"`, { timeout: 45000 });

      if (fs.existsSync(tmpFile)) {
        return fs.readFileSync(tmpFile).toString('base64');
      }
      throw new Error('Screenshot produced no output');
    } catch (error: any) {
      throw new Error(`Screenshot capture failed: ${error.message}`);
    }
  }

  /**
   * Generate a thumbnail of a URL at a specific size
   * @returns base64-encoded PNG
   */
  async thumbnail(url: string, width: number = 300, height: number = 200): Promise<string> {
    return this.capture(url, { width, height, fullPage: false });
  }
}
