/**
 * K6 Load Test - Project Generation API
 * Run: k6 run k6-load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const projectCreationRate = new Rate('project_creation_success');
const projectCreationDuration = new Trend('project_creation_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '1m', target: 10 }, // Ramp up to 10 users
    { duration: '3m', target: 10 }, // Stay at 10 users
    { duration: '1m', target: 50 }, // Spike to 50 users
    { duration: '2m', target: 50 }, // Stay at 50 users
    { duration: '1m', target: 0 },  // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    'project_creation_success': ['rate>0.9'], // 90% success rate
    http_req_failed: ['rate<0.1'], // Error rate must be below 10%
  },
};

const API_URL = __ENV.API_URL || 'http://localhost:3000';

// Login and get auth token
function getAuthToken() {
  const loginRes = http.post(`${API_URL}/api/auth/login`, JSON.stringify({
    email: 'load-test@example.com',
    password: 'test123',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(loginRes, {
    'login successful': (r) => r.status === 200,
  });

  return loginRes.json('token');
}

export function setup() {
  // Run once before all VUs
  return { token: getAuthToken() };
}

export default function (data) {
  const token = data.token;

  // Test 1: Health check
  const healthRes = http.get(`${API_URL}/api/health`);
  check(healthRes, {
    'health check OK': (r) => r.status === 200,
  });

  // Test 2: Create project
  const startTime = Date.now();

  const createRes = http.post(`${API_URL}/api/projects`, JSON.stringify({
    prompt: `Build a landing page with React - iteration ${__ITER}`,
    framework: 'react',
    style: 'modern',
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  const success = check(createRes, {
    'project created': (r) => r.status === 201,
    'has project ID': (r) => r.json('projectId') !== undefined,
    'has job ID': (r) => r.json('jobId') !== undefined,
  });

  // Record metrics
  projectCreationRate.add(success);
  projectCreationDuration.add(Date.now() - startTime);

  if (success) {
    const projectId = createRes.json('projectId');

    // Test 3: Get project status
    const statusRes = http.get(`${API_URL}/api/projects/${projectId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    check(statusRes, {
      'status retrieved': (r) => r.status === 200,
    });
  }

  // Test 4: Get queue metrics
  const metricsRes = http.get(`${API_URL}/api/queue/metrics`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  check(metricsRes, {
    'metrics retrieved': (r) => r.status === 200,
  });

  sleep(1); // Wait 1 second between iterations
}

export function teardown(data) {
  // Cleanup after test
  console.log('Load test completed');
}

/**
 * Expected Results:
 * 
 * - Average response time: < 200ms
 * - p95 response time: < 500ms
 * - p99 response time: < 1000ms
 * - Error rate: < 5%
 * - Throughput: > 100 req/s
 * - Queue backpressure should activate at high load
 * - Circuit breakers should trip if AI providers fail
 * - Sandbox warm pool should maintain < 2s latency
 */
