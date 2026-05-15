/**
 * AENEWS BUILDER - Spike Test
 * Instant spike to 10K users to test system resilience
 * Verifies recovery after sudden load
 * 
 * Run: k6 run k6-spike.js
 * WARNING: This is an aggressive test!
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import exec from 'k6/execution';
import {
  BASE_URL, API_PREFIX, JSON_HEADERS, authHeaders,
  healthCheck, loginUser, registerUser, createProject,
  errorRate, apiLatency, requestsCounter,
  randomPrompt, randomSleep,
} from './utils.js';

var spikeRecoveryTime = new Trend('spike_recovery_time', true);
var spikeErrorDuringPeak = new Counter('spike_errors_peak');
var spikeRequestsDuringPeak = new Counter('spike_requests_peak');

export const options = {
  stages: [
    { duration: '10s', target: 0 },
    { duration: '5s',  target: 10000 },
    { duration: '30s', target: 10000 },
    { duration: '30s', target: 0 },
    { duration: '30s', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<10000'],
    http_req_failed: ['rate<0.25'],
    errors: ['rate<0.30'],
  },
};

export function setup() {
  console.log('Spike Test: Starting instant spike test');
  console.log('Phase 1: Baseline (0 users)');
  console.log('Phase 2: SPIKE to 10,000 users');
  console.log('Phase 3: Hold at 10K for 30s');
  console.log('Phase 4: Ramp down');
  console.log('Phase 5: Recovery check');
  
  var health = healthCheck();
  console.log('Spike Test: Baseline health - ' + (health.isHealthy ? 'HEALTHY' : 'UNHEALTHY'));
  console.log('Spike Test: Baseline latency - ' + health.duration + 'ms');
  
  return {
    baselineHealth: health.isHealthy,
    baselineLatency: health.duration,
    testStartTime: Date.now(),
  };
}

export default function (data) {
  var vuId = exec.vu.idInTest;
  var elapsed = Date.now() - data.testStartTime;
  
  var phaseTag = 'normal';
  if (elapsed > 10000 && elapsed < 45000) {
    phaseTag = 'peak';
  } else if (elapsed > 75000) {
    phaseTag = 'recovery';
  }
  
  var userEmail = 'spike-' + vuId + '@aenews.net';
  var userPassword = 'LoadTest2026!';
  
  var token = null;
  
  group('Spike Auth [' + phaseTag + ']', function() {
    token = loginUser(userEmail, userPassword);
    if (!token) {
      token = registerUser(userEmail, userPassword, 'Spike User ' + vuId);
    }
    if (!token) {
      token = loginUser(userEmail, userPassword);
    }
  });

  if (!token) {
    errorRate.add(1);
    if (phaseTag === 'peak') spikeErrorDuringPeak.add(1);
    sleep(0.5);
    return;
  }

  // Health Check
  group('Spike Health [' + phaseTag + ']', function() {
    var res = http.get(
      BASE_URL + API_PREFIX + '/health',
      { tags: { endpoint: 'health', test: 'spike', phase: phaseTag } }
    );
    
    requestsCounter.add(1);
    if (phaseTag === 'peak') spikeRequestsDuringPeak.add(1);
    
    check(res, {
      'health responds': function(r) { return r.status === 200 || r.status === 503; },
    });
    
    errorRate.add(res.status >= 500 ? 1 : 0);
    apiLatency.add(res.timings.duration);
  });

  sleep(0.3);

  // Create Project (20% peak, 50% recovery)
  var createProbability = phaseTag === 'peak' ? 0.2 : (phaseTag === 'recovery' ? 0.5 : 0.3);
  
  if (Math.random() < createProbability) {
    group('Spike Create Project [' + phaseTag + ']', function() {
      var result = createProject(token, randomPrompt());
      
      if (!result.success && phaseTag === 'peak') {
        spikeErrorDuringPeak.add(1);
      }
    });
  }

  if (phaseTag === 'peak') {
    sleep(0.2 + Math.random() * 0.3);
  } else if (phaseTag === 'recovery') {
    sleep(1 + Math.random() * 2);
  } else {
    sleep(0.5 + Math.random() * 1);
  }
}

export function teardown(data) {
  console.log('Spike Test: Checking system recovery...');
  
  sleep(2);
  
  var health = healthCheck();
  console.log('Spike Test: Final health - ' + (health.isHealthy ? 'HEALTHY' : 'UNHEALTHY'));
  console.log('Spike Test: Final latency - ' + health.duration + 'ms');
  console.log('Spike Test: Baseline was ' + data.baselineLatency + 'ms, now ' + health.duration + 'ms');
  
  if (health.isHealthy && health.duration < data.baselineLatency * 2) {
    console.log('Spike Test: System recovered successfully');
  } else if (health.isHealthy) {
    console.log('Spike Test: System healthy but latency elevated');
  } else {
    console.log('Spike Test: System did not recover');
  }
}
