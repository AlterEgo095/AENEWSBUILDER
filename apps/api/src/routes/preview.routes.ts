/**
 * Preview Routes - Serve generated files for live preview
 * 
 * Provides endpoints for the Studio frontend to:
 * - Get individual generated file content
 * - Get an HTML preview of the entire project (for iframe embedding)
 * - List all generated files for a project
 */

import type { FastifyInstance } from 'fastify';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';

export async function previewRoutes(app: FastifyInstance) {

  // ─────────────────────────────────────────────────────────────
  // GET /api/preview/:projectId/files — List all generated files
  // ─────────────────────────────────────────────────────────────
  app.get('/:projectId/files', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, state: true, context: true },
      });

      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const context = project.context as any;
      const files = context?.files || {};
      const fileList = Object.keys(files).map((path) => ({
        path,
        type: guessFileType(path),
        size: (files[path] as string)?.length || 0,
      }));

      return reply.send({
        projectId: project.id,
        state: project.state,
        fileCount: fileList.length,
        files: fileList,
      });
    } catch (error: any) {
      logger.error({ error: error.message, projectId }, 'Failed to list preview files');
      return reply.status(500).send({ error: 'Failed to list files' });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // GET /api/preview/:projectId/file/* — Get a single file content
  // ─────────────────────────────────────────────────────────────
  app.get('/:projectId/file/*', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const filePath = (request.params as any)['*'] as string;

    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { context: true },
      });

      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const context = project.context as any;
      const files = context?.files || {};
      const content = files[filePath];

      if (content === undefined) {
        return reply.status(404).send({ error: `File not found: ${filePath}` });
      }

      // Set correct content type
      const contentType = getContentType(filePath);
      reply.header('Content-Type', contentType);

      return reply.send(content);
    } catch (error: any) {
      logger.error({ error: error.message, projectId, filePath }, 'Failed to get file');
      return reply.status(500).send({ error: 'Failed to get file' });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // GET /api/preview/:projectId/html — Get full HTML preview
  // ─────────────────────────────────────────────────────────────
  app.get('/:projectId/html', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { context: true, state: true },
      });

      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const context = project.context as any;
      const files = context?.files || {};

      // Look for an index.html file
      let html = files['index.html'] || files['src/index.html'] || files['public/index.html'] || null;

      if (!html) {
        // If no index.html, generate a preview page listing all files
        const fileList = Object.keys(files);
        html = generatePreviewPage(projectId, fileList, files, project.state);
      }

      reply.header('Content-Type', 'text/html; charset=utf-8');
      return reply.send(html);
    } catch (error: any) {
      logger.error({ error: error.message, projectId }, 'Failed to generate preview');
      return reply.status(500).send({ error: 'Failed to generate preview' });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // GET /api/preview/:projectId/status — Quick status check
  // ─────────────────────────────────────────────────────────────
  app.get('/:projectId/status', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { state: true, context: true, deployUrl: true, updatedAt: true },
      });

      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const context = project.context as any;
      const files = context?.files || {};

      return reply.send({
        state: project.state,
        fileCount: Object.keys(files).length,
        deployUrl: project.deployUrl,
        updatedAt: project.updatedAt,
        hasPreview: !!files['index.html'] || !!files['src/index.html'] || !!files['public/index.html'],
      });
    } catch (error: any) {
      logger.error({ error: error.message, projectId }, 'Failed to get preview status');
      return reply.status(500).send({ error: 'Failed to get status' });
    }
  });
}

// ─── Helper Functions ──────────────────────────────────────

function guessFileType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const typeMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    css: 'style', scss: 'style', html: 'markup', json: 'config',
    md: 'document', yaml: 'config', yml: 'config', env: 'config',
    prisma: 'schema', sql: 'schema', graphql: 'schema',
  };
  return typeMap[ext] || 'other';
}

function getContentType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const contentTypes: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
    ts: 'text/typescript; charset=utf-8',
    tsx: 'text/typescript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    ico: 'image/x-icon',
  };
  return contentTypes[ext] || 'text/plain; charset=utf-8';
}

function generatePreviewPage(
  projectId: string,
  fileList: string[],
  files: Record<string, string>,
  state: string
): string {
  const fileEntries = fileList.map((path) => {
    const content = files[path] as string;
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `
      <details class="file-entry">
        <summary class="file-name">${path}</summary>
        <pre><code>${escaped}</code></pre>
      </details>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview \u2014 ${projectId.substring(0, 8)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0b; color: #e4e4e7; padding: 24px; }
    h1 { font-size: 20px; margin-bottom: 16px; color: #fff; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .badge-processing { background: #3b82f620; color: #3b82f6; }
    .badge-done { background: #10b98120; color: #10b981; }
    .badge-failed { background: #ef444420; color: #ef4444; }
    .file-entry { margin-bottom: 8px; border: 1px solid #ffffff10; border-radius: 8px; overflow: hidden; }
    .file-name { padding: 10px 14px; cursor: pointer; font-family: monospace; font-size: 13px; background: #ffffff05; }
    .file-name:hover { background: #ffffff0a; }
    pre { padding: 14px; background: #000; overflow-x: auto; font-size: 12px; line-height: 1.5; max-height: 400px; overflow-y: auto; }
    code { font-family: 'Fira Code', 'Cascadia Code', monospace; }
    .stats { margin-bottom: 20px; color: #a1a1aa; font-size: 14px; }
  </style>
</head>
<body>
  <h1>AENEWS Builder Preview <span class="badge badge-${state.toLowerCase() === 'done' ? 'done' : state.toLowerCase() === 'failed' ? 'failed' : 'processing'}">${state}</span></h1>
  <p class="stats">${fileList.length} files generated</p>
  ${fileEntries}
</body>
</html>`;
}
