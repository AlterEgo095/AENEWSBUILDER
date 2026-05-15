/**
 * AENEWS BUILDER - k6 Load Test Utilities
 * Shared helper functions for all k6 test scripts
 * 
 * NOTE: k6 v0.50.0 does not support:
 *   - Optional chaining (?.)  => use (obj && obj.prop)
 *   - Spread operator (...)   => use Object.assign()
 *   - Nullish coalescing (??) => use (val || default)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import exec from 'k6/execution';

// ============================================
// CUSTOM METRICS (shared across all tests)
// ============================================
export const errorRate = new Rate('errors');
export const apiLatency = new Trend('api_latency', true);
export const projectCreationTime = new Trend('project_creation_time', true);
export const authLoginTime = new Trend('auth_login_time', true);
export const healthCheckTime = new Trend('health_check_time', true);
export const pipelineStageTime = new Trend('pipeline_stage_time', true);
export const activeUsersGauge = new Gauge('active_users');
export const requestsCounter = new Counter('total_requests');

// AI Pipeline stage-specific metrics
export const classificationTime = new Trend('classification_time', true);
export const planningTime = new Trend('planning_time', true);
export const mcpExecutionTime = new Trend('mcp_execution_time', true);
export const generationTime = new Trend('generation_time', true);
export const reviewTime = new Trend('review_time', true);
export const pipelineCompleteTime = new Trend('pipeline_complete_time', true);

// ============================================
// CONFIGURATION
// ============================================
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3181';
export const API_PREFIX = '/api';

// Request headers
export const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

// Auth headers builder (no spread operator)
export function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': 'Bearer ' + token,
  };
}

// ============================================
// AUTH HELPERS
// ============================================

/**
 * Register a new user and return the auth token
 */
export function registerUser(email, password, name) {
  const res = http.post(
    BASE_URL + API_PREFIX + '/auth/register',
    JSON.stringify({ email: email, password: password, name: name }),
    { headers: JSON_HEADERS, tags: { endpoint: 'register' } }
  );
  
  check(res, {
    'register status valid': function(r) { return r.status === 201 || r.status === 409; },
  });
  
  if (res.status === 201) {
    try {
      var body = JSON.parse(res.body);
      if (body.data && body.data.token) {
        return body.data.token;
      }
      return null;
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Login and return the auth token
 */
export function loginUser(email, password) {
  var startTime = Date.now();
  
  var res = http.post(
    BASE_URL + API_PREFIX + '/auth/login',
    JSON.stringify({ email: email, password: password }),
    { headers: JSON_HEADERS, tags: { endpoint: 'login' } }
  );
  
  authLoginTime.add(Date.now() - startTime);
  requestsCounter.add(1);
  
  check(res, {
    'login status received': function(r) { return r.status === 200 || r.status === 401 || r.status === 400; },
  });
  
  errorRate.add(res.status >= 500 ? 1 : 0);
  
  if (res.status === 200) {
    try {
      var body = JSON.parse(res.body);
      if (body.data && body.data.token) {
        return body.data.token;
      }
      return null;
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Register-or-login a test user
 */
export function getAuthToken(userId) {
  var email = 'loadtest-' + userId + '@aenews.net';
  var password = 'LoadTest2026!';
  var name = 'Load Test User ' + userId;
  
  var token = registerUser(email, password, name);
  if (token) return token;
  
  return loginUser(email, password);
}

/**
 * Verify a token is still valid
 */
export function verifyToken(token) {
  var res = http.get(
    BASE_URL + API_PREFIX + '/auth/verify',
    { headers: authHeaders(token), tags: { endpoint: 'verify' } }
  );
  
  requestsCounter.add(1);
  return res.status === 200;
}

// ============================================
// HEALTH CHECK HELPERS
// ============================================

/**
 * Perform a health check
 */
export function healthCheck() {
  var startTime = Date.now();
  
  var res = http.get(
    BASE_URL + API_PREFIX + '/health',
    { tags: { endpoint: 'health' } }
  );
  
  healthCheckTime.add(Date.now() - startTime);
  requestsCounter.add(1);
  
  var isHealthy = false;
  var healthData = {};
  
  try {
    healthData = JSON.parse(res.body);
    isHealthy = healthData.status === 'healthy';
  } catch (e) {
    isHealthy = false;
  }
  
  check(res, {
    'health check 200': function(r) { return r.status === 200; },
    'status is healthy': function() { return isHealthy; },
  });
  
  errorRate.add(res.status >= 500 ? 1 : 0);
  apiLatency.add(res.timings.duration);
  
  return { isHealthy: isHealthy, healthData: healthData, duration: res.timings.duration };
}

// ============================================
// PROJECT HELPERS
// ============================================

/**
 * Create a new project
 */
export function createProject(token, prompt, name) {
  var startTime = Date.now();
  
  var projectName = name || ('Load Test Project ' + Date.now());
  var projectPrompt = prompt || ('Build a modern landing page with hero section and contact form - iteration ' + exec.scenario.iterationInTest);
  
  var res = http.post(
    BASE_URL + API_PREFIX + '/projects',
    JSON.stringify({
      name: projectName,
      prompt: projectPrompt,
    }),
    { headers: authHeaders(token), tags: { endpoint: 'create_project' } }
  );
  
  projectCreationTime.add(Date.now() - startTime);
  requestsCounter.add(1);
  
  var success = check(res, {
    'project created': function(r) { return r.status === 201; },
    'has project ID': function(r) {
      try {
        var body = JSON.parse(r.body);
        return !!body.projectId;
      } catch (e) {
        return false;
      }
    },
  });
  
  errorRate.add(res.status >= 500 ? 1 : 0);
  apiLatency.add(res.timings.duration);
  
  if (success) {
    try {
      var body = JSON.parse(res.body);
      return {
        success: true,
        projectId: body.projectId,
        duration: Date.now() - startTime,
      };
    } catch (e) {
      return { success: false, duration: Date.now() - startTime };
    }
  }
  
  return { success: false, duration: Date.now() - startTime };
}

/**
 * Get project status
 */
export function getProjectStatus(token, projectId) {
  var res = http.get(
    BASE_URL + API_PREFIX + '/projects/' + projectId,
    { headers: authHeaders(token), tags: { endpoint: 'get_project' } }
  );
  
  requestsCounter.add(1);
  
  var projectData = null;
  
  if (res.status === 200) {
    try {
      projectData = JSON.parse(res.body);
    } catch (e) {
      // ignore parse errors
    }
  }
  
  check(res, {
    'project status retrieved': function(r) { return r.status === 200; },
  });
  
  errorRate.add(res.status >= 500 ? 1 : 0);
  apiLatency.add(res.timings.duration);
  
  return { projectData: projectData, status: res.status, duration: res.timings.duration };
}

/**
 * Poll project status until complete or timeout
 */
export function pollProjectStatus(token, projectId, maxWaitMs, intervalMs) {
  maxWaitMs = maxWaitMs || 120000;
  intervalMs = intervalMs || 2000;
  var startTime = Date.now();
  var lastState = 'UNKNOWN';
  
  while (Date.now() - startTime < maxWaitMs) {
    var result = getProjectStatus(token, projectId);
    
    if (result.projectData) {
      lastState = result.projectData.state || result.projectData.jobState || 'UNKNOWN';
      
      if (lastState === 'CLASSIFYING') {
        classificationTime.add(Date.now() - startTime);
      } else if (lastState === 'PLANNING') {
        planningTime.add(Date.now() - startTime);
      } else if (lastState === 'MCP_EXECUTING') {
        mcpExecutionTime.add(Date.now() - startTime);
      } else if (lastState === 'GENERATING') {
        generationTime.add(Date.now() - startTime);
      } else if (lastState === 'REVIEWING') {
        reviewTime.add(Date.now() - startTime);
      } else if (lastState === 'COMPLETE') {
        pipelineCompleteTime.add(Date.now() - startTime);
        return { state: 'COMPLETE', totalTime: Date.now() - startTime, projectData: result.projectData };
      } else if (lastState === 'FAILED') {
        return { state: 'FAILED', totalTime: Date.now() - startTime, projectData: result.projectData };
      }
    }
    
    sleep(intervalMs / 1000);
  }
  
  return { state: lastState, totalTime: Date.now() - startTime, timedOut: true };
}

// ============================================
// ADMIN HELPERS
// ============================================

/**
 * Access admin dashboard
 */
export function adminDashboard(token) {
  var res = http.get(
    BASE_URL + API_PREFIX + '/admin/dashboard',
    { headers: authHeaders(token), tags: { endpoint: 'admin_dashboard' } }
  );
  
  requestsCounter.add(1);
  
  check(res, {
    'admin dashboard accessible': function(r) { return r.status === 200 || r.status === 403; },
  });
  
  errorRate.add(res.status >= 500 ? 1 : 0);
  apiLatency.add(res.timings.duration);
  
  return { status: res.status, duration: res.timings.duration };
}

// ============================================
// RANDOM DATA HELPERS
// ============================================

var PROJECT_PROMPTS = [
  'Build a modern SaaS landing page with pricing table and testimonials section',
  'Create a portfolio website with dark theme, project showcase, and contact form',
  'Design a restaurant website with menu, reservation system, and photo gallery',
  'Build an e-commerce product page with reviews, ratings, and add-to-cart functionality',
  'Create a blog platform with article listing, categories, and search functionality',
  'Design a fitness app dashboard with workout tracker, progress charts, and goals',
  'Build a real estate listing page with property cards, filters, and map integration',
  'Create a social media feed with posts, likes, comments, and user profiles',
  'Design a job board with search, filters, and application tracking',
  'Build a weather dashboard with forecasts, maps, and location-based alerts',
  'Create a music streaming interface with playlists, artist pages, and player controls',
  'Design a project management board with Kanban columns, tasks, and team members',
  'Build an online course platform with video lessons, quizzes, and progress tracking',
  'Create a cryptocurrency tracker with real-time prices, charts, and portfolio management',
  'Design a food delivery app with restaurant listings, cart, and order tracking',
];

export function randomPrompt() {
  return PROJECT_PROMPTS[Math.floor(Math.random() * PROJECT_PROMPTS.length)];
}

export function randomSleep(min, max) {
  min = min || 0.5;
  max = max || 3;
  sleep(min + Math.random() * (max - min));
}

// ============================================
// TEST LIFECYCLE HELPERS
// ============================================

/**
 * Setup function: register a test user and get auth token
 */
export function setupAuth() {
  var email = 'loadtest-setup@aenews.net';
  var password = 'LoadTest2026!';
  var name = 'Load Test Setup User';
  
  var token = registerUser(email, password, name);
  if (!token) {
    token = loginUser(email, password);
  }
  
  return { token: token, email: email, password: password };
}

/**
 * Generate a summary report
 */
export function generateReport(testName, metrics) {
  var report = {
    testName: testName,
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    metrics: {
      totalRequests: metrics.totalRequests || 0,
      errorRate: metrics.errorRate || 0,
      p95Latency: metrics.p95Latency || 0,
      p99Latency: metrics.p99Latency || 0,
    },
  };
  
  console.log(JSON.stringify(report, null, 2));
  return report;
}

// ============================================
// THRESHOLD DEFINITIONS
// ============================================

export var THRESHOLDS = {
  // Strict: for smoke and load tests
  strict: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.05'],
    api_latency: ['p(95)<2000'],
  },
  // Moderate: for stress tests
  moderate: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.10'],
    errors: ['rate<0.15'],
    api_latency: ['p(95)<5000'],
  },
  // Relaxed: for spike tests
  relaxed: {
    http_req_duration: ['p(95)<10000'],
    http_req_failed: ['rate<0.20'],
    errors: ['rate<0.25'],
  },
  // Pipeline-specific
  pipeline: {
    'http_req_duration{endpoint:pipeline}': ['p(95)<2000'],
    'http_req_duration{endpoint:classification}': ['p(95)<500'],
    http_req_failed: ['rate<0.10'],
  },
};
