/**
 * E2E Test: Complete Project Generation Workflow
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000';

describe('Project Generation Workflow (E2E)', () => {
  let authToken: string;
  let projectId: string;
  let jobId: string;

  beforeAll(async () => {
    // Get auth token
    const authResponse = await axios.post(`${API_URL}/api/auth/login`, {
      email: 'test@example.com',
      password: 'test123',
    });

    authToken = authResponse.data.token;
  });

  it('should create a new project', async () => {
    const response = await axios.post(
      `${API_URL}/api/projects`,
      {
        prompt: 'Build a simple landing page with React and Tailwind CSS',
        framework: 'react',
        style: 'modern',
      },
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('projectId');
    expect(response.data).toHaveProperty('jobId');

    projectId = response.data.projectId;
    jobId = response.data.jobId;
  });

  it('should get project status', async () => {
    const response = await axios.get(`${API_URL}/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(response.status).toBe(200);
    expect(response.data.id).toBe(projectId);
    expect(['queued', 'processing', 'completed']).toContain(
      response.data.status
    );
  });

  it('should stream project events via SSE', async () => {
    return new Promise<void>((resolve, reject) => {
      const eventsReceived: any[] = [];

      axios
        .get(`${API_URL}/api/stream/${projectId}`, {
          headers: { Authorization: `Bearer ${authToken}` },
          responseType: 'stream',
          timeout: 30000,
        })
        .then((response) => {
          response.data.on('data', (chunk: Buffer) => {
            const event = chunk.toString();
            if (event.includes('data:')) {
              eventsReceived.push(event);
            }
          });

          setTimeout(() => {
            expect(eventsReceived.length).toBeGreaterThan(0);
            resolve();
          }, 5000);
        })
        .catch(reject);
    });
  }, 35000);

  it('should complete project generation', async () => {
    // Poll for completion (max 5 minutes)
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const response = await axios.get(
        `${API_URL}/api/projects/${projectId}`,
        {
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );

      if (response.data.status === 'completed') {
        expect(response.data).toHaveProperty('artifacts');
        expect(response.data.artifacts.files).toBeInstanceOf(Array);
        return;
      }

      if (response.data.status === 'failed') {
        throw new Error(`Project generation failed: ${response.data.error}`);
      }

      // Wait 5 seconds before next check
      await new Promise((resolve) => setTimeout(resolve, 5000));
      attempts++;
    }

    throw new Error('Project generation timeout');
  }, 300000); // 5 minutes timeout

  it('should get project artifacts', async () => {
    const response = await axios.get(
      `${API_URL}/api/projects/${projectId}/artifacts`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('files');
    expect(response.data.files.length).toBeGreaterThan(0);
  });

  it('should delete project', async () => {
    const response = await axios.delete(
      `${API_URL}/api/projects/${projectId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    expect(response.status).toBe(204);
  });
});
