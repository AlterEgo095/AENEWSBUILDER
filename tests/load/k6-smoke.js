/**
 * AENEWS BUILDER - Smoke Test
 * Quick verification of basic functionality
 * 1 user, 30 seconds
 * 
 * Run: k6 run k6-smoke.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import {
  BASE_URL, API_PREFIX, JSON_HEADERS, authHeaders,
  healthCheck, loginUser, registerUser, createProject, getProjectStatus,
  errorRate, apiLatency, requestsCounter,
  THRESHOLDS,
} from './utils.js';

var smokeTestPassed = new Rate('smoke_test_passed');

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: THRESHOLDS.strict,
};

export function setup() {
  console.log('Smoke Test: Setting up test user...');
  
  var email = 'smoke-test@aenews.net';
  var password = 'LoadTest2026!';
  var name = 'Smoke Test User';
  
  var token = registerUser(email, password, name);
  if (!token) {
    token = loginUser(email, password);
  }
  
  if (!token) {
    console.error('Smoke Test: Failed to authenticate!');
  }
  
  return { token: token };
}

export default function (data) {
  var token = data.token;
  var allPassed = true;

  // Test 1: Health Check
  group('Health Check', function() {
    var result = healthCheck();
    if (!result.isHealthy) {
      console.error('Health check failed: ' + JSON.stringify(result.healthData));
      allPassed = false;
    }
  });

  sleep(1);

  // Test 2: Auth Login
  group('Auth Login', function() {
    var loginRes = http.post(
      BASE_URL + API_PREFIX + '/auth/login',
      JSON.stringify({
        email: 'smoke-test@aenews.net',
        password: 'LoadTest2026!',
      }),
      { headers: JSON_HEADERS, tags: { endpoint: 'login' } }
    );

    requestsCounter.add(1);
    
    var loginPassed = check(loginRes, {
      'login returns 200': function(r) { return r.status === 200; },
      'login returns token': function(r) {
        try {
          var body = JSON.parse(r.body);
          return !!(body.data && body.data.token);
        } catch (e) {
          return false;
        }
      },
    });

    if (!loginPassed) {
      console.error('Login failed: status=' + loginRes.status);
      allPassed = false;
    }
    
    errorRate.add(loginRes.status >= 500 ? 1 : 0);
    apiLatency.add(loginRes.timings.duration);
  });

  sleep(1);

  // Test 3: Create Project
  group('Create Project', function() {
    if (!token) {
      console.error('No auth token, skipping project creation');
      allPassed = false;
      return;
    }

    var result = createProject(token, 'Build a simple landing page with hero and footer - smoke test');
    
    var createPassed = check(null, {
      'project created successfully': function() { return result.success; },
      'project creation < 2s': function() { return result.duration < 2000; },
    });

    if (!createPassed) {
      console.error('Project creation failed: ' + JSON.stringify(result));
      allPassed = false;
    }

    // Test 4: Check Project Status
    if (result.success && result.projectId) {
      sleep(1);
      
      var statusResult = getProjectStatus(token, result.projectId);
      
      var statusPassed = check(null, {
        'project status retrieved': function() { return statusResult.status === 200; },
        'project has valid state': function() {
          if (!statusResult.projectData) return false;
          var state = statusResult.projectData.state || statusResult.projectData.jobState;
          return !!state;
        },
      });

      if (!statusPassed) {
        console.error('Project status check failed: status=' + statusResult.status);
        allPassed = false;
      }
    }
  });

  sleep(1);

  smokeTestPassed.add(allPassed ? 1 : 0);
}

export function teardown(data) {
  console.log('Smoke Test: Completed');
}
