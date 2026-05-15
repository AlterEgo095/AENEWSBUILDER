/**
 * AENEWS BUILDER - Standard Load Test
 * Simulates normal production load: 100 concurrent users over 5 minutes
 * 
 * Run: k6 run k6-load.js
 * With env: k6 run -e BASE_URL=http://localhost:3181 k6-load.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import exec from 'k6/execution';
import {
  BASE_URL, API_PREFIX, JSON_HEADERS, authHeaders,
  healthCheck, loginUser, registerUser, createProject, getProjectStatus,
  adminDashboard,
  errorRate, apiLatency, projectCreationTime, authLoginTime,
  requestsCounter, randomPrompt, randomSleep,
  THRESHOLDS,
} from './utils.js';

var projectsCreatedCounter = new Counter('projects_created');
var failedLogins = new Counter('failed_logins');

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '2m', target: 100 },
    { duration: '2m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.05'],
    api_latency: ['p(95)<2000'],
    project_creation_time: ['p(95)<3000'],
    auth_login_time: ['p(95)<1000'],
  },
};

export function setup() {
  console.log('Load Test: Creating test user pool...');
  
  var users = [];
  for (var i = 0; i < 5; i++) {
    var email = 'loadtest-pool-' + i + '@aenews.net';
    var password = 'LoadTest2026!';
    var name = 'Load Test User ' + i;
    
    var token = registerUser(email, password, name);
    if (!token) {
      token = loginUser(email, password);
    }
    
    if (token) {
      users.push({ email: email, password: password, token: token });
    }
  }
  
  console.log('Load Test: Created ' + users.length + ' seed users');
  
  var health = healthCheck();
  console.log('Load Test: Health check - ' + (health.isHealthy ? 'HEALTHY' : 'UNHEALTHY'));
  
  return { users: users };
}

export default function (data) {
  var vuId = exec.vu.idInTest;
  var iterId = exec.scenario.iterationInTest;
  
  var userEmail = 'loadtest-' + vuId + '@aenews.net';
  var userPassword = 'LoadTest2026!';

  // Phase 1: Health Check
  group('Health Check', function() {
    healthCheck();
  });

  sleep(0.5);

  // Phase 2: Auth Flow
  var token = null;
  
  group('Auth Flow', function() {
    token = loginUser(userEmail, userPassword);
    
    if (!token) {
      token = registerUser(userEmail, userPassword, 'Load User ' + vuId);
    }
    
    check(null, {
      'authenticated successfully': function() { return token !== null; },
    });
    
    if (!token) {
      failedLogins.add(1);
    }
  });

  if (!token) {
    errorRate.add(1);
    sleep(1);
    return;
  }

  randomSleep(0.5, 2);

  // Phase 3: Create Project (40% of iterations)
  if (Math.random() < 0.4) {
    group('Create Project', function() {
      var result = createProject(token, randomPrompt());
      
      check(null, {
        'project created': function() { return result.success; },
        'creation time < 2s': function() { return result.duration < 2000; },
      });
      
      if (result.success) {
        projectsCreatedCounter.add(1);
      }
    });
  }

  randomSleep(0.5, 1.5);

  // Phase 4: View Projects List
  group('View Projects', function() {
    var res = http.get(
      BASE_URL + API_PREFIX + '/projects',
      { headers: authHeaders(token), tags: { endpoint: 'list_projects' } }
    );
    
    requestsCounter.add(1);
    
    check(res, {
      'projects list 200': function(r) { return r.status === 200; },
    });
    
    errorRate.add(res.status >= 500 ? 1 : 0);
    apiLatency.add(res.timings.duration);
  });

  randomSleep(0.5, 2);

  // Phase 5: Admin Dashboard (10%)
  if (Math.random() < 0.1) {
    group('Admin Dashboard', function() {
      adminDashboard(token);
    });
  }

  // Phase 6: Verify Token (20%)
  if (Math.random() < 0.2) {
    group('Verify Token', function() {
      var res = http.get(
        BASE_URL + API_PREFIX + '/auth/verify',
        { headers: authHeaders(token), tags: { endpoint: 'verify' } }
      );
      
      requestsCounter.add(1);
      
      check(res, {
        'token valid': function(r) { return r.status === 200; },
      });
    });
  }

  randomSleep(1, 3);
}

export function teardown(data) {
  console.log('Load Test: Completed');
  console.log('Load Test: Total seed users: ' + data.users.length);
}
