/**
 * AENEWS BUILDER - Soak Test
 * Steady 1,000 users for 1 hour
 * Detects memory leaks, connection exhaustion, and degradation
 * 
 * Run: k6 run k6-soak.js
 * DURATION: ~1 hour
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import exec from 'k6/execution';
import {
  BASE_URL, API_PREFIX, JSON_HEADERS, authHeaders,
  healthCheck, loginUser, registerUser, createProject, getProjectStatus,
  errorRate, apiLatency, projectCreationTime, authLoginTime, requestsCounter,
  randomPrompt, randomSleep,
} from './utils.js';

var memoryLeakIndicator = new Trend('memory_leak_indicator', true);
var responseTimeDegradation = new Trend('response_time_degradation', true);
var connectionErrors = new Counter('connection_errors');
var soakProjectCounter = new Counter('soak_projects_created');
var healthCheckTrend = new Trend('health_check_trend', true);
var dbQueryTime = new Trend('db_query_time', true);

export const options = {
  stages: [
    { duration: '2m', target: 1000 },
    { duration: '56m', target: 1000 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.05'],
    api_latency: ['p(95)<3000'],
    health_check_trend: ['p(95)<5000'],
  },
};

var baselineLatency = null;
var baselineHealthTime = null;

export function setup() {
  console.log('Soak Test: Starting 1-hour soak test with 1,000 users');
  console.log('Monitoring for:');
  console.log('  - Memory leaks (increasing response times)');
  console.log('  - Connection exhaustion (increasing error rates)');
  console.log('  - Performance degradation over time');
  
  var health = healthCheck();
  baselineHealthTime = health.duration;
  
  return {
    testStartTime: Date.now(),
    baselineHealthTime: health.duration,
  };
}

export default function (data) {
  var vuId = exec.vu.idInTest;
  var iterId = exec.scenario.iterationInTest;
  var elapsed = (Date.now() - data.testStartTime) / 1000;
  
  var userEmail = 'soak-' + vuId + '@aenews.net';
  var userPassword = 'LoadTest2026!';

  var token = null;
  
  group('Soak Auth', function() {
    token = loginUser(userEmail, userPassword);
    if (!token) {
      token = registerUser(userEmail, userPassword, 'Soak User ' + vuId);
    }
    if (!token) {
      token = loginUser(userEmail, userPassword);
    }
  });

  if (!token) {
    connectionErrors.add(1);
    errorRate.add(1);
    sleep(2);
    return;
  }

  // Health Check
  group('Soak Health', function() {
    var health = healthCheck();
    healthCheckTrend.add(health.duration);
    
    if (data.baselineHealthTime && health.duration > 0) {
      var degradationRatio = health.duration / data.baselineHealthTime;
      responseTimeDegradation.add(degradationRatio);
      
      if (degradationRatio > 2.0) {
        console.log('WARNING: Health check degradation detected! ' + health.duration + 'ms (baseline: ' + data.baselineHealthTime + 'ms)');
        memoryLeakIndicator.add(1);
      } else {
        memoryLeakIndicator.add(0);
      }
    }
  });

  sleep(0.5);

  // Create Project (25%)
  if (Math.random() < 0.25) {
    group('Soak Create Project', function() {
      var result = createProject(token, randomPrompt());
      
      if (result.success) {
        soakProjectCounter.add(1);
        
        if (Math.random() < 0.3) {
          sleep(2);
          var statusResult = getProjectStatus(token, result.projectId);
          
          if (statusResult.duration > 0) {
            dbQueryTime.add(statusResult.duration);
          }
        }
      }
    });
  }

  randomSleep(0.5, 1.5);

  // View Projects List
  group('Soak View Projects', function() {
    var res = http.get(
      BASE_URL + API_PREFIX + '/projects',
      { headers: authHeaders(token), tags: { endpoint: 'list_projects', test: 'soak' } }
    );
    
    requestsCounter.add(1);
    
    check(res, {
      'projects list responds': function(r) { return r.status === 200; },
    });
    
    errorRate.add(res.status >= 500 ? 1 : 0);
    apiLatency.add(res.timings.duration);
  });

  // Periodic logging
  if (iterId % 200 === 0) {
    console.log('Soak Test: Elapsed=' + Math.floor(elapsed) + 's, VU=' + vuId + ', Iter=' + iterId);
  }

  sleep(1 + Math.random() * 2);
}

export function teardown(data) {
  var totalDuration = Date.now() - data.testStartTime;
  var durationMin = Math.floor(totalDuration / 60000);
  
  console.log('Soak Test: Completed');
  console.log('Soak Test: Duration: ' + durationMin + ' minutes');
  
  var health = healthCheck();
  console.log('Soak Test: Final health - ' + (health.isHealthy ? 'HEALTHY' : 'UNHEALTHY'));
  console.log('Soak Test: Baseline health latency: ' + data.baselineHealthTime + 'ms');
  console.log('Soak Test: Final health latency: ' + health.duration + 'ms');
  
  var degradationRatio = health.duration / data.baselineHealthTime;
  if (degradationRatio > 1.5) {
    console.log('Soak Test: Latency increased by ' + ((degradationRatio - 1) * 100).toFixed(1) + '% - possible memory leak');
  } else {
    console.log('Soak Test: No significant latency degradation detected');
  }
}
