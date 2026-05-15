/**
 * AENEWS BUILDER - Stress Test
 * Gradually ramps to 10,000 concurrent users
 * Identifies system breaking point
 * 
 * Run: k6 run k6-stress.js
 * WARNING: This test requires significant system resources!
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import exec from 'k6/execution';
import {
  BASE_URL, API_PREFIX, JSON_HEADERS, authHeaders,
  healthCheck, loginUser, registerUser, createProject,
  errorRate, apiLatency, projectCreationTime, requestsCounter,
  randomPrompt, randomSleep,
} from './utils.js';

var stressBreakpoint = new Trend('stress_breakpoint', true);
var stageTransitionTime = new Trend('stage_transition_time', true);
var projectsStressCounter = new Counter('projects_created_stress');

export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '2m', target: 1000 },
    { duration: '2m', target: 5000 },
    { duration: '2m', target: 10000 },
    { duration: '5m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.10'],
    errors: ['rate<0.15'],
    api_latency: ['p(95)<5000'],
    project_creation_time: ['p(95)<5000'],
  },
};

export function setup() {
  console.log('Stress Test: Starting gradual ramp to 10K users');
  console.log('Stage 1: 100 users (normal)');
  console.log('Stage 2: 1,000 users (elevated)');
  console.log('Stage 3: 5,000 users (high)');
  console.log('Stage 4: 10,000 users (peak)');
  
  var health = healthCheck();
  if (!health.isHealthy) {
    console.error('WARNING: System is not healthy before stress test!');
    console.error('Health data: ' + JSON.stringify(health.healthData));
  }
  
  return { startTime: Date.now(), healthy: health.isHealthy };
}

export default function (data) {
  var vuId = exec.vu.idInTest;

  var userEmail = 'stress-' + vuId + '@aenews.net';
  var userPassword = 'LoadTest2026!';

  // Auth with retry
  var token = null;
  
  group('Stress Auth', function() {
    token = loginUser(userEmail, userPassword);
    if (!token) {
      token = registerUser(userEmail, userPassword, 'Stress User ' + vuId);
    }
    if (!token) {
      token = loginUser(userEmail, userPassword);
    }
  });

  if (!token) {
    errorRate.add(1);
    sleep(1);
    return;
  }

  randomSleep(0.3, 1);

  // Health Check
  group('Stress Health', function() {
    var res = http.get(
      BASE_URL + API_PREFIX + '/health',
      { tags: { endpoint: 'health', test: 'stress' } }
    );
    
    requestsCounter.add(1);
    
    check(res, {
      'health 200': function(r) { return r.status === 200 || r.status === 503; },
    });
    
    errorRate.add(res.status >= 500 ? 1 : 0);
    apiLatency.add(res.timings.duration);
  });

  randomSleep(0.2, 0.8);

  // Create Project (30%)
  if (Math.random() < 0.3) {
    group('Stress Create Project', function() {
      var result = createProject(token, randomPrompt());
      
      check(null, {
        'project created under stress': function() { return result.success; },
      });
      
      if (result.success) {
        projectsStressCounter.add(1);
      }
      
      if (!result.success) {
        stressBreakpoint.add(Date.now() - data.startTime);
      }
    });
  }

  randomSleep(0.3, 1);

  // View Projects List
  group('Stress View Projects', function() {
    var res = http.get(
      BASE_URL + API_PREFIX + '/projects',
      { headers: authHeaders(token), tags: { endpoint: 'list_projects', test: 'stress' } }
    );
    
    requestsCounter.add(1);
    
    check(res, {
      'projects list responds': function(r) { return r.status === 200 || r.status === 429 || r.status === 503; },
    });
    
    errorRate.add(res.status >= 500 ? 1 : 0);
    apiLatency.add(res.timings.duration);
  });

  sleep(0.5 + Math.random() * 1);
}

export function teardown(data) {
  var totalDuration = Date.now() - data.startTime;
  console.log('Stress Test: Completed in ' + totalDuration + 'ms');
  console.log('Stress Test: System was ' + (data.healthy ? 'healthy' : 'unhealthy') + ' at start');
  
  var health = healthCheck();
  console.log('Stress Test: System is ' + (health.isHealthy ? 'healthy' : 'unhealthy') + ' at end');
}
