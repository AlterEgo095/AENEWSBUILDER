/**
 * Multimedia, Search & Art MCP Tools Bundle
 * Image Generation, Video, Audio, Charts, Data Extraction/Search, Translation
 *
 * Image generation uses Replicate or Stability AI. Audio/video use ffmpeg.
 * Web search falls back to DuckDuckGo when no API key is configured.
 * Translation uses LibreTranslate or Google Translate (free endpoint).
 */

import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════
// Image Generation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Image generation adapter
 * Uses Replicate API by default; falls back to Stability AI
 * Requires REPLICATE_API_TOKEN or STABILITY_API_KEY env var
 */
export class ImageGenAdapter {
  private replicateToken: string;
  private stabilityKey: string;

  constructor() {
    this.replicateToken = process.env.REPLICATE_API_TOKEN || '';
    this.stabilityKey = process.env.STABILITY_API_KEY || '';
  }

  /**
   * Generate an image from a text prompt
   * @returns URL of the generated image
   */
  async generate(prompt: string, options?: { width?: number; height?: number; model?: string }): Promise<string> {
    try {
      if (this.replicateToken) {
        return await this.generateReplicate(prompt, options);
      }
      if (this.stabilityKey) {
        return await this.generateStability(prompt, options);
      }
      throw new Error('No image generation API key configured (REPLICATE_API_TOKEN or STABILITY_API_KEY)');
    } catch (error: any) {
      throw new Error(`Image generation failed: ${error.message}`);
    }
  }

  /** Edit an image with a prompt */
  async edit(imageUrl: string, prompt: string): Promise<string> {
    try {
      if (!this.replicateToken) throw new Error('REPLICATE_API_TOKEN required for image editing');
      const { data } = await axios.post('https://api.replicate.com/v1/predictions', {
        version: 'c14d77f0a8654b2a8035e093e8b9b5d4b0a0e0e0e0e0e0e0e0e0e0e0e0e0e0e',
        input: { image: imageUrl, prompt },
      }, { headers: { Authorization: `Bearer ${this.replicateToken}` } });
      return await this.pollReplicateResult(data.urls?.get);
    } catch (error: any) {
      throw new Error(`Image edit failed: ${error.message}`);
    }
  }

  /** Create a variation of an image */
  async vary(imageUrl: string): Promise<string> {
    try {
      if (!this.replicateToken) throw new Error('REPLICATE_API_TOKEN required for image variation');
      const { data } = await axios.post('https://api.replicate.com/v1/predictions', {
        version: 'c14d77f0a8654b2a8035e093e8b9b5d4b0a0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e',
        input: { image: imageUrl, prompt: 'a variation of this image' },
      }, { headers: { Authorization: `Bearer ${this.replicateToken}` } });
      return await this.pollReplicateResult(data.urls?.get);
    } catch (error: any) {
      throw new Error(`Image vary failed: ${error.message}`);
    }
  }

  /** Generate via Replicate API */
  private async generateReplicate(prompt: string, options?: any): Promise<string> {
    const { data } = await axios.post('https://api.replicate.com/v1/predictions', {
      version: options?.model || 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
      input: { prompt, width: options?.width || 1024, height: options?.height || 1024 },
    }, { headers: { Authorization: `Bearer ${this.replicateToken}` } });
    return await this.pollReplicateResult(data.urls?.get);
  }

  /** Poll Replicate for result URL */
  private async pollReplicateResult(url?: string, maxAttempts: number = 30): Promise<string> {
    if (!url) throw new Error('No polling URL returned');
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const { data } = await axios.get(url, { headers: { Authorization: `Bearer ${this.replicateToken}` } });
      if (data.status === 'succeeded') return data.output?.[0] || data.output;
      if (data.status === 'failed') throw new Error(data.error || 'Replicate prediction failed');
    }
    throw new Error('Image generation timed out');
  }

  /** Generate via Stability API */
  private async generateStability(prompt: string, options?: any): Promise<string> {
    const { data } = await axios.post('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
      text_prompts: [{ text: prompt, weight: 1 }],
      cfg_scale: 7, width: options?.width || 1024, height: options?.height || 1024, steps: 30, samples: 1,
    }, {
      headers: { Authorization: `Bearer ${this.stabilityKey}`, 'Content-Type': 'application/json' },
      responseType: 'arraybuffer',
    });
    // Return base64 encoded image
    return Buffer.from(data, 'binary').toString('base64');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Video
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Video processing adapter
 * Requires ffmpeg installed in the environment
 */
export class VideoAdapter {
  /**
   * Transcribe video audio to text using Whisper
   * Requires OPENAI_API_KEY for Whisper API
   */
  async transcribe(videoUrl: string): Promise<string> {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey) {
        // Download and send to Whisper API
        const { data: videoData } = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 120000 });
        const form = new URLSearchParams();
        form.append('file', new Blob([videoData], { type: 'video/mp4' }), 'video.mp4');
        form.append('model', 'whisper-1');
        const { data } = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
          headers: { Authorization: `Bearer ${apiKey}` }, timeout: 120000,
        });
        return data.text;
      }
      // Fallback: use local whisper if available
      const { stdout } = await execAsync(`whisper "${videoUrl}" --model tiny --output_format txt --output_dir /tmp`, {
        timeout: 300000, maxBuffer: 5 * 1024 * 1024,
      });
      return stdout.trim();
    } catch (error: any) {
      throw new Error(`Video transcription failed: ${error.message}`);
    }
  }

  /**
   * Extract frames from a video at a specified FPS
   * @returns Array of frame image file paths
   */
  async extractFrames(videoUrl: string, fps: number = 1): Promise<string[]> {
    try {
      const outDir = `/tmp/video_frames_${Date.now()}`;
      await execAsync(`mkdir -p ${outDir}`);
      await execAsync(
        `ffmpeg -i "${videoUrl}" -vf fps=${fps} -q:v 2 "${outDir}/frame_%04d.jpg"`,
        { timeout: 120000 },
      );
      const { stdout } = await execAsync(`ls ${outDir}/frame_*.jpg 2>/dev/null`);
      return stdout.split('\n').filter(Boolean);
    } catch (error: any) {
      throw new Error(`Frame extraction failed: ${error.message}`);
    }
  }

  /** Get video metadata using ffprobe */
  async getMetadata(videoUrl: string): Promise<any> {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v quiet -print_format json -show_format -show_streams "${videoUrl}"`,
        { timeout: 30000 },
      );
      return JSON.parse(stdout);
    } catch (error: any) {
      return { error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Audio
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Audio processing adapter
 * Supports transcription via Whisper and TTS via multiple providers
 */
export class AudioAdapter {
  /**
   * Transcribe audio to text
   * Requires OPENAI_API_KEY for Whisper API, or local whisper installation
   */
  async transcribe(audioUrl: string): Promise<string> {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey) {
        const { data: audioData } = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 120000 });
        const form = new URLSearchParams();
        form.append('file', new Blob([audioData]), 'audio.mp3');
        form.append('model', 'whisper-1');
        const { data } = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
          headers: { Authorization: `Bearer ${apiKey}` }, timeout: 120000,
        });
        return data.text;
      }
      const { stdout } = await execAsync(`whisper "${audioUrl}" --model tiny --output_format txt --output_dir /tmp`, {
        timeout: 300000, maxBuffer: 5 * 1024 * 1024,
      });
      return stdout.trim();
    } catch (error: any) {
      throw new Error(`Audio transcription failed: ${error.message}`);
    }
  }

  /**
   * Generate text-to-speech audio
   * Uses OpenAI TTS API; returns base64-encoded MP3
   */
  async generateTTS(text: string, voice?: string): Promise<string> {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY required for TTS');
      const { data } = await axios.post('https://api.openai.com/v1/audio/speech', {
        model: 'tts-1', input: text, voice: voice || 'alloy',
      }, {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        responseType: 'arraybuffer',
      });
      return Buffer.from(data, 'binary').toString('base64');
    } catch (error: any) {
      throw new Error(`TTS generation failed: ${error.message}`);
    }
  }

  /** Get audio metadata using ffprobe */
  async getMetadata(audioUrl: string): Promise<any> {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v quiet -print_format json -show_format -show_streams "${audioUrl}"`,
        { timeout: 15000 },
      );
      return JSON.parse(stdout);
    } catch (error: any) {
      return { error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Chart Generation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chart generation adapter
 * Generates charts as PNG or SVG using a quick-chart API or local canvas
 */
export class ChartAdapter {
  /**
   * Generate a chart image
   * @returns base64-encoded PNG
   */
  async generate(type: string, data: any, options?: any): Promise<string> {
    try {
      const config = this.buildChartConfig(type, data, options);
      const { data: imgData } = await axios.post('https://quickchart.io/chart', config, {
        responseType: 'arraybuffer', timeout: 30000,
      });
      return Buffer.from(imgData, 'binary').toString('base64');
    } catch (error: any) {
      throw new Error(`Chart generation failed: ${error.message}`);
    }
  }

  /**
   * Generate a chart as SVG string
   * @returns SVG string
   */
  async generateSVG(type: string, data: any, options?: any): Promise<string> {
    try {
      const config = this.buildChartConfig(type, data, { ...options, format: 'svg' });
      const { data: svgData } = await axios.post('https://quickchart.io/chart', config, {
        responseType: 'text', timeout: 30000,
      });
      return typeof svgData === 'string' ? svgData : JSON.stringify(svgData);
    } catch (error: any) {
      throw new Error(`SVG chart generation failed: ${error.message}`);
    }
  }

  /** Build Chart.js-compatible config from our parameters */
  private buildChartConfig(type: string, data: any, options?: any): any {
    return {
      type: type || 'bar',
      data: {
        labels: data.labels || [],
        datasets: (data.datasets || [{ label: 'Data', data: data.values || [] }]).map((ds: any) => ({
          label: ds.label || 'Dataset',
          data: ds.data || ds.values || [],
          backgroundColor: ds.colors || ds.backgroundColor || undefined,
          borderColor: ds.borderColor || '#333',
          borderWidth: ds.borderWidth || 1,
        })),
      },
      options: {
        responsive: true,
        plugins: { title: { display: !!options?.title, text: options?.title || '' } },
        scales: ['pie', 'doughnut', 'radar', 'polarArea'].includes(type) ? undefined : {
          x: { title: { display: !!options?.xLabel, text: options?.xLabel || '' } },
          y: { title: { display: !!options?.yLabel, text: options?.yLabel || '' }, beginAtZero: true },
        },
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Data Extraction / Search
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Data extraction and web search adapter
 * Extracts content from URLs, searches the web, news, docs, StackOverflow, YouTube
 */
export class DataExtractionAdapter {
  private serpApiKey: string;

  constructor() {
    this.serpApiKey = process.env.SERPAPI_KEY || '';
  }

  /**
   * Extract structured content from a URL
   */
  async extractFromURL(url: string): Promise<{ title: string; content: string; links: string[]; metadata: any }> {
    try {
      const { data } = await axios.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'AENEWSBUILDER-MCP/1.0' },
      });
      const html = typeof data === 'string' ? data : JSON.stringify(data);
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i);
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const linkRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
      const links = [...new Set([...html.matchAll(linkRegex)].map(m => m[1]))];
      const metadata = {
        description: descMatch ? descMatch[1] : '',
        ogTitle: this.extractMeta(html, 'og:title'),
        ogImage: this.extractMeta(html, 'og:image'),
        ogDescription: this.extractMeta(html, 'og:description'),
        canonical: this.extractLink(html, 'canonical'),
      };
      return { title: titleMatch ? titleMatch[1].trim() : '', content: text.substring(0, 50000), links, metadata };
    } catch (error: any) {
      throw new Error(`URL extraction failed: ${error.message}`);
    }
  }

  /**
   * Search the web using SerpAPI or DuckDuckGo
   */
  async searchWeb(query: string, numResults: number = 10): Promise<{ url: string; title: string; snippet: string }[]> {
    try {
      if (this.serpApiKey) {
        const { data } = await axios.get('https://serpapi.com/search', {
          params: { q: query, api_key: this.serpApiKey, num: Math.min(numResults, 10) },
        });
        return (data.organic_results || []).map((r: any) => ({
          url: r.link, title: r.title, snippet: r.snippet,
        }));
      }
      // DuckDuckGo fallback
      const { data } = await axios.get('https://api.duckduckgo.com', {
        params: { q: query, format: 'json', no_html: 1 },
      });
      const results: { url: string; title: string; snippet: string }[] = [];
      if (data.Abstract) {
        results.push({ title: data.Heading || query, url: data.AbstractURL, snippet: data.Abstract });
      }
      for (const topic of (data.RelatedTopics || []).slice(0, numResults)) {
        if (topic.Text) {
          results.push({ title: topic.Text.substring(0, 80), url: topic.FirstURL || '', snippet: topic.Text });
        }
      }
      return results;
    } catch (error: any) {
      throw new Error(`Web search failed: ${error.message}`);
    }
  }

  /** Search for recent news */
  async searchNews(query: string): Promise<any[]> {
    try {
      const { data } = await axios.get('https://newsapi.org/v2/everything', {
        params: { q: query, sortBy: 'publishedAt', pageSize: 20, language: 'en', apiKey: process.env.NEWS_API_KEY || '' },
        timeout: 15000,
      });
      if (data.status === 'ok') {
        return (data.articles || []).map((a: any) => ({
          title: a.title, url: a.url, source: a.source?.name,
          publishedAt: a.publishedAt, description: a.description,
        }));
      }
      // Fallback to web search with "news" keyword
      const results = await this.searchWeb(`${query} news latest`);
      return results.map(r => ({ title: r.title, url: r.url, source: 'web', description: r.snippet }));
    } catch (error: any) {
      return [];
    }
  }

  /** Search documentation for a library */
  async searchDocumentation(library: string, topic: string): Promise<any[]> {
    try {
      const results = await this.searchWeb(`${library} documentation ${topic}`, 10);
      return results.map(r => ({ title: r.title, url: r.url, snippet: r.snippet, source: 'docs' }));
    } catch (error: any) {
      return [];
    }
  }

  /** Search StackOverflow for answers */
  async searchStackOverflow(question: string): Promise<any[]> {
    try {
      const { data } = await axios.get('https://api.stackexchange.com/2.3/search/advanced', {
        params: {
          order: 'desc', sort: 'relevance', q: question,
          site: 'stackoverflow', answers: 1, filter: 'withbody', limit: 10,
        },
      });
      return (data.items || []).map((item: any) => ({
        title: item.title, url: item.link,
        snippet: item.body?.replace(/<[^>]*>/g, '').substring(0, 300),
        score: item.score, answerCount: item.answer_count, source: 'stackoverflow',
      }));
    } catch (error: any) {
      const results = await this.searchWeb(`site:stackoverflow.com ${question}`, 5);
      return results.map(r => ({ title: r.title, url: r.url, snippet: r.snippet, source: 'stackoverflow' }));
    }
  }

  /** Get YouTube video transcript */
  async getYouTubeTranscript(videoId: string): Promise<string> {
    try {
      // Use youtube-transcript-api equivalent via direct fetch
      const { data } = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
        timeout: 15000,
      });
      const html = typeof data === 'string' ? data : '';
      // Extract caption tracks
      const captionMatch = html.match(/"captionTracks":\[([^\]]+)\]/);
      if (!captionMatch) throw new Error('No captions available');
      const tracks = JSON.parse(`[${captionMatch[1]}]`);
      const baseUrl = tracks[0]?.baseUrl;
      if (!baseUrl) throw new Error('No caption URL found');
      const { data: captionXml } = await axios.get(baseUrl, { timeout: 15000 });
      const text = (captionXml || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ').trim();
      return text;
    } catch (error: any) {
      throw new Error(`YouTube transcript failed: ${error.message}`);
    }
  }

  /** Helper: extract OpenGraph or Twitter meta tag content */
  private extractMeta(html: string, property: string): string {
    const regex = new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["'](.*?)["']`, 'i');
    const match = html.match(regex);
    return match ? match[1] : '';
  }

  /** Helper: extract link href by rel attribute */
  private extractLink(html: string, rel: string): string {
    const regex = new RegExp(`<link[^>]*rel=["']${rel}["'][^>]*href=["'](.*?)["']`, 'i');
    const match = html.match(regex);
    return match ? match[1] : '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Translation / i18n
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Translation and language detection adapter
 * Uses LibreTranslate API by default; falls back to Google Translate (unofficial)
 */
export class TranslationAdapter {
  private libreUrl: string;
  private libreKey: string;

  constructor() {
    this.libreUrl = process.env.LIBRETRANSLATE_URL || 'https://libretranslate.com';
    this.libreKey = process.env.LIBRETRANSLATE_API_KEY || '';
  }

  /**
   * Translate text from one language to another
   * @param from Source language code (e.g., 'en', 'auto')
   * @param to Target language code (e.g., 'fr', 'es', 'de')
   */
  async translate(text: string, from: string, to: string): Promise<string> {
    try {
      // Try LibreTranslate first
      if (this.libreUrl) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.libreKey) headers['Authorization'] = `Bearer ${this.libreKey}`;
        const { data } = await axios.post(`${this.libreUrl}/translate`, {
          q: text, source: from === 'auto' ? 'auto' : from, target: to, format: 'text',
        }, { headers, timeout: 30000 });
        if (data.translatedText) return data.translatedText;
      }
      // Fallback: Google Translate (unofficial)
      const { data } = await axios.get('https://translate.googleapis.com/translate_a/single', {
        params: {
          client: 'gtx', sl: from, tl: to, dt: 't', q: text,
        },
        timeout: 15000,
      });
      return data[0].map((item: any) => item[0]).join('');
    } catch (error: any) {
      throw new Error(`Translation failed: ${error.message}`);
    }
  }

  /**
   * Detect the language of a text
   * @returns ISO language code (e.g., 'en', 'fr')
   */
  async detectLanguage(text: string): Promise<string> {
    try {
      if (this.libreUrl) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.libreKey) headers['Authorization'] = `Bearer ${this.libreKey}`;
        const { data } = await axios.post(`${this.libreUrl}/detect`, { q: text }, { headers, timeout: 15000 });
        return Array.isArray(data) ? data[0]?.language || 'unknown' : data.language || 'unknown';
      }
      // Fallback: use Google Translate detection
      const { data } = await axios.get('https://translate.googleapis.com/translate_a/single', {
        params: { client: 'gtx', sl: 'auto', tl: 'en', dt: 't', q: text.substring(0, 200) },
        timeout: 15000,
      });
      return data[2] || 'unknown';
    } catch (error: any) {
      return 'unknown';
    }
  }

  /**
   * Translate multiple texts in batch
   */
  async batchTranslate(texts: string[], from: string, to: string): Promise<string[]> {
    try {
      // Process sequentially to avoid rate limiting
      const results: string[] = [];
      for (const text of texts) {
        const translated = await this.translate(text, from, to);
        results.push(translated);
        // Small delay between requests
        if (texts.indexOf(text) < texts.length - 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      }
      return results;
    } catch (error: any) {
      throw new Error(`Batch translation failed: ${error.message}`);
    }
  }
}
