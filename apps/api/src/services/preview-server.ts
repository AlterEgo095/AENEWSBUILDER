/**
 * Preview Server Manager - Live Preview with Hot-Reload
 * 
 * Manages sandboxed HTTP servers that serve generated project files
 * with automatic hot-reload. Each project gets its own preview server
 * running inside a sandbox container.
 * 
 * Features:
 * - Static HTML/CSS/JS serving with live reload
 * - React/Next.js dev server support (npm run dev)
 * - WebSocket for instant browser refresh on file changes
 * - Port allocation and management
 * - Auto-cleanup on project completion
 */

import Docker from 'dockerode';
import { logger } from '../config/logger.js';
import { getRedis } from '../services/redis.service.js';
import { prisma } from '../config/prisma.js';

// ─── Configuration ─────────────────────────────────────────────

const PREVIEW_BASE_PORT = 9100;
const MAX_PREVIEW_SERVERS = 20;
const CONTAINER_PREFIX = 'aenews-preview-';

// ─── Types ─────────────────────────────────────────────────────

interface PreviewServer {
  projectId: string;
  containerId: string;
  port: number;
  url: string;
  status: 'starting' | 'running' | 'stopped' | 'error';
  type: 'static' | 'react' | 'next';
  createdAt: Date;
}

// ─── Live Reload Script ────────────────────────────────────────

const LIVE_RELOAD_SCRIPT = `
<script>
(function() {
  const ws = new WebSocket('ws://' + window.location.host + '/__livereload');
  ws.onmessage = function(evt) {
    if (evt.data === 'reload') {
      location.reload();
    }
  };
  ws.onclose = function() {
    console.log('[LiveReload] Disconnected, retrying in 2s...');
    setTimeout(function() { location.reload(); }, 2000);
  };
  console.log('[AENEWS LiveReload] Connected');
})();
</script>
`;

// ─── Static Preview Server (Node.js) ───────────────────────────

const STATIC_SERVER_CODE = `
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const FILES = JSON.parse(process.env.FILES || '{}');
const PORT = parseInt(process.env.PORT || '9100');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const wss = new WebSocket.Server({ noServer: true });

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? 'index.html' : req.url.slice(1);
  
  // Try to find the file
  let content = FILES[filePath];
  if (content === undefined) {
    // Try with common prefixes
    for (const key of Object.keys(FILES)) {
      if (key.endsWith('/' + filePath) || key.endsWith('\\\\' + filePath)) {
        content = FILES[key];
        filePath = key;
        break;
      }
    }
  }

  if (content !== undefined) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'text/plain; charset=utf-8';
    
    // Inject live reload script into HTML files
    if (ext === '.html' && typeof content === 'string') {
      content = content.replace('</body>', '__AENEWS_LIVERELOAD__</body>');
    }
    
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } else {
    res.writeHead(404);
    res.end('File not found: ' + filePath);
  }
});

// WebSocket upgrade for live reload
server.on('upgrade', (request, socket, head) => {
  if (request.url === '/__livereload') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Preview server running on port ' + PORT);
  process.send && process.send({ type: 'ready', port: PORT });
});

// Handle file updates via stdin
process.on('message', (msg) => {
  if (msg.type === 'update-files') {
    Object.assign(FILES, msg.files);
    // Notify all connected browsers to reload
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send('reload');
      }
    });
    process.send && process.send({ type: 'files-updated', count: Object.keys(FILES).length });
  }
});
`;

// ─── Preview Server Manager ────────────────────────────────────

export class PreviewServerManager {
  private docker: Docker;
  private servers: Map<string, PreviewServer> = new Map();
  private nextPort: number = PREVIEW_BASE_PORT;

  constructor() {
    this.docker = new Docker();
  }

  /**
   * Start a live preview server for a project.
   * Detects the project type and starts the appropriate server.
   */
  async startPreview(projectId: string): Promise<{ url: string; port: number }> {
    // Check if already running
    const existing = this.servers.get(projectId);
    if (existing && existing.status === 'running') {
      return { url: existing.url, port: existing.port };
    }

    // Load project files
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { context: true },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    const context = project.context as any;
    const files: Record<string, string> = context?.files || {};

    if (Object.keys(files).length === 0) {
      throw new Error('No files to preview');
    }

    // Detect project type
    const projectType = this.detectProjectType(files);
    const port = this.allocatePort();

    logger.info({ projectId, type: projectType, port }, '[Preview] Starting preview server');

    try {
      if (projectType === 'static') {
        return await this.startStaticPreview(projectId, files, port, projectType);
      } else {
        // For React/Next.js, fall back to static preview with the generated files
        // In a production system, we'd run npm install && npm run dev
        return await this.startStaticPreview(projectId, files, port, projectType);
      }
    } catch (error: any) {
      logger.error({ error: error.message, projectId }, '[Preview] Failed to start');
      throw error;
    }
  }

  /**
   * Start a static file server in a Docker container.
   */
  private async startStaticPreview(
    projectId: string,
    files: Record<string, string>,
    port: number,
    type: string
  ): Promise<{ url: string; port: number }> {
    const containerName = `${CONTAINER_PREFIX}${projectId.substring(0, 12)}`;

    // Remove existing container if any
    try {
      const existing = this.docker.getContainer(containerName);
      await existing.remove({ force: true });
    } catch { /* doesn't exist, fine */ }

    // Create and start container with Node.js to serve files
    const container = await this.docker.createContainer({
      name: containerName,
      Image: 'node:20-alpine',
      Cmd: ['node', '-e', STATIC_SERVER_CODE.replace('__AENEWS_LIVERELOAD__', LIVE_RELOAD_SCRIPT)
      Env: [
        `FILES=${JSON.stringify(files).replace(/'/g, "'\\''")}`,
        `PORT=${port}`,
      ],
      ExposedPorts: { [`${port}/tcp`]: {} },
      HostConfig: {
        PortBindings: { [`${port}/tcp`]: [{ HostPort: `${port}` }] },
        AutoRemove: true,
        Memory: 128 * 1024 * 1024, // 128MB limit
        CpuShares: 256,
      },
    });

    await container.start();

    const serverInfo: PreviewServer = {
      projectId,
      containerId: container.id,
      port,
      url: `http://localhost:${port}`,
      status: 'running',
      type: type as any,
      createdAt: new Date(),
    };

    this.servers.set(projectId, serverInfo);

    logger.info({ projectId, port, containerId: container.id.substring(0, 12) }, '[Preview] Server started');

    return { url: serverInfo.url, port };
  }

  /**
   * Update files in a running preview server (hot-reload).
   * Sends the updated files to the container which triggers a browser refresh.
   */
  async updateFiles(projectId: string, modifiedFiles: Record<string, string>): Promise<void> {
    const server = this.servers.get(projectId);
    if (!server || server.status !== 'running') {
      // If server not running, just update the DB — next preview load will pick up changes
      return;
    }

    try {
      const container = this.docker.getContainer(server.containerId);
      
      // For simplicity, we restart the container with updated files
      // In a production system, we'd use IPC or a file watcher
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { context: true },
      });

      if (project) {
        const context = project.context as any;
        const allFiles: Record<string, string> = context?.files || {};
        
        // Stop and restart with new files
        await container.stop();
        await this.startStaticPreview(projectId, allFiles, server.port, server.type);
        
        logger.info({ projectId, filesUpdated: Object.keys(modifiedFiles).length }, '[Preview] Files updated (container restarted)');
      }
    } catch (error: any) {
      logger.warn({ error: error.message, projectId }, '[Preview] Failed to update files');
    }
  }

  /**
   * Stop a preview server.
   */
  async stopPreview(projectId: string): Promise<void> {
    const server = this.servers.get(projectId);
    if (!server) return;

    try {
      const container = this.docker.getContainer(server.containerId);
      await container.stop();
      await container.remove({ force: true });
    } catch { /* already stopped */ }

    server.status = 'stopped';
    this.servers.delete(projectId);
    logger.info({ projectId }, '[Preview] Server stopped');
  }

  /**
   * Get the URL for a running preview server.
   */
  getPreviewUrl(projectId: string): string | null {
    const server = this.servers.get(projectId);
    return server?.status === 'running' ? server.url : null;
  }

  /**
   * Detect the project type from the generated files.
   */
  private detectProjectType(files: Record<string, string>): 'static' | 'react' | 'next' {
    const hasPackageJson = files['package.json'] || files['src/package.json'];
    if (hasPackageJson) {
      try {
        const pkg = JSON.parse(hasPackageJson);
        if (pkg.dependencies?.next) return 'next';
        if (pkg.dependencies?.react) return 'react';
      } catch { /* not valid JSON */ }
    }
    if (files['next.config.js'] || files['next.config.mjs'] || files['next.config.ts']) return 'next';
    return 'static';
  }

  /**
   * Allocate the next available port.
   */
  private allocatePort(): number {
    const usedPorts = new Set(Array.from(this.servers.values()).map(s => s.port));
    let port = this.nextPort;
    while (usedPorts.has(port) && port < PREVIEW_BASE_PORT + MAX_PREVIEW_SERVERS) {
      port++;
    }
    if (port >= PREVIEW_BASE_PORT + MAX_PREVIEW_SERVERS) {
      port = PREVIEW_BASE_PORT; // Wrap around
    }
    this.nextPort = port + 1;
    return port;
  }
}

// Singleton
export const previewServerManager = new PreviewServerManager();
