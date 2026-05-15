/**
 * AENEWS BUILDER - AI Pipeline Load Test
 * Tests 1,000 simultaneous AI pipeline requests
 * Measures each pipeline stage: classification, planning, MCP execution, generation
 * 
 * Run: k6 run k6-ai-pipeline.js
 * 
 * Pipeline States (L4 State Machine):
 *   INIT -> CLASSIFYING -> PLANNING -> MCP_EXECUTING -> GENERATING -> REVIEWING -> COMPLETE
 *                                                             -> FAILED
 * 
 * Performance Targets:
 *   - API response P95 < 2 seconds
 *   - Full pipeline completion < 120 seconds
 *   - Classification time P95 < 500ms
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import exec from 'k6/execution';
import {
  BASE_URL, API_PREFIX, JSON_HEADERS, authHeaders,
  healthCheck, loginUser, registerUser, createProject, getProjectStatus,
  errorRate, apiLatency, requestsCounter,
  classificationTime, planningTime, mcpExecutionTime,
  generationTime, reviewTime, pipelineCompleteTime, pipelineStageTime,
  randomPrompt,
} from './utils.js';

var pipelineInitiated = new Counter('pipeline_initiated');
var pipelineCompleted = new Counter('pipeline_completed');
var pipelineFailed = new Counter('pipeline_failed');
var pipelineTimeout = new Counter('pipeline_timeout');
var pipelineQueueTime = new Trend('pipeline_queue_time', true);
var pipelineTotalTime = new Trend('pipeline_total_time', true);

var stageClassificationTime = new Trend('stage_classification_time', true);
var stagePlanningTime = new Trend('stage_planning_time', true);
var stageMcpExecutionTime = new Trend('stage_mcp_execution_time', true);
var stageGenerationTime = new Trend('stage_generation_time', true);
var stageReviewTime = new Trend('stage_review_time', true);

var queueDepthGauge = new Trend('queue_depth', true);
var queueActiveGauge = new Trend('queue_active', true);

var PIPELINE_PROMPTS = [
  'Build a React dashboard with real-time data visualization and dark mode',
  'Create a Next.js e-commerce store with product catalog and shopping cart',
  'Design a Vue.js admin panel with user management and analytics charts',
  'Build a Svelte todo application with drag-and-drop and local storage',
  'Create an Angular material design portfolio with animations and routing',
];

export const options = {
  scenarios: {
    ai_pipeline_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 200 },
        { duration: '1m', target: 500 },
        { duration: '1m', target: 1000 },
        { duration: '3m', target: 1000 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
      tags: { test_type: 'ai_pipeline' },
    },
  },
  thresholds: {
    'http_req_duration{endpoint:pipeline}': ['p(95)<2000'],
    'http_req_duration{endpoint:classification}': ['p(95)<500'],
    'http_req_duration{endpoint:create_project}': ['p(95)<2000'],
    pipeline_total_time: ['p(95)<120000'],
    stage_classification_time: ['p(95)<500'],
    http_req_failed: ['rate<0.10'],
    errors: ['rate<0.10'],
  },
};

export function setup() {
  console.log('AI Pipeline Test: Starting 1K simultaneous pipeline test');
  console.log('Target: 1,000 concurrent AI pipeline requests');
  console.log('P95 API latency target: < 2 seconds');
  console.log('P95 pipeline completion target: < 120 seconds');
  
  var health = healthCheck();
  var baselineQueueStats = {};
  if (health.healthData && health.healthData.services && health.healthData.services.queueStats) {
    baselineQueueStats = health.healthData.services.queueStats;
    console.log('AI Pipeline Test: Queue status - Active: ' + (baselineQueueStats.active || 0) + ', Waiting: ' + (baselineQueueStats.waiting || 0));
  }
  
  return {
    testStartTime: Date.now(),
    baselineQueueStats: baselineQueueStats,
  };
}

export default function (data) {
  var vuId = exec.vu.idInTest;
  var iterId = exec.scenario.iterationInTest;
  
  var userEmail = 'pipeline-' + vuId + '@aenews.net';
  var userPassword = 'LoadTest2026!';

  // Step 1: Authenticate
  var token = null;
  
  group('Pipeline Auth', function() {
    token = loginUser(userEmail, userPassword);
    if (!token) {
      token = registerUser(userEmail, userPassword, 'Pipeline User ' + vuId);
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

  sleep(0.2);

  // Step 2: Check Queue Status
  group('Pipeline Queue Check', function() {
    var healthRes = http.get(
      BASE_URL + API_PREFIX + '/health',
      { headers: authHeaders(token), tags: { endpoint: 'health', test: 'pipeline' } }
    );
    
    try {
      var body = JSON.parse(healthRes.body);
      if (body.services && body.services.queueStats) {
        queueDepthGauge.add(body.services.queueStats.waiting || 0);
        queueActiveGauge.add(body.services.queueStats.active || 0);
      }
    } catch (e) {}
  });

  // Step 3: Create Project (triggers pipeline)
  var projectId = null;
  
  group('Pipeline Create Project', function() {
    var prompt = PIPELINE_PROMPTS[iterId % PIPELINE_PROMPTS.length];
    var result = createProject(token, prompt);
    
    if (result.success) {
      projectId = result.projectId;
      pipelineInitiated.add(1);
    } else {
      pipelineFailed.add(1);
      errorRate.add(1);
    }
  });

  if (!projectId) {
    sleep(1);
    return;
  }

  // Step 4: Poll Pipeline Status
  var MAX_POLL_TIME = 120000;
  var POLL_INTERVAL = 2000;
  var startTime = Date.now();
  var lastState = 'INIT';
  var stateTransitions = {};
  var pipelineComplete = false;

  group('Pipeline Status Tracking', function() {
    while (Date.now() - startTime < MAX_POLL_TIME) {
      var statusResult = getProjectStatus(token, projectId);
      
      if (statusResult.projectData) {
        var currentState = statusResult.projectData.state || 
                          statusResult.projectData.jobState || 
                          'UNKNOWN';
        
        if (currentState !== lastState) {
          var transitionTime = Date.now() - startTime;
          stateTransitions[currentState] = transitionTime;
          
          console.log('Pipeline ' + projectId + ': ' + lastState + ' -> ' + currentState + ' (' + transitionTime + 'ms)');
          
          if (currentState === 'CLASSIFYING') {
            stageClassificationTime.add(transitionTime);
            classificationTime.add(transitionTime);
          } else if (currentState === 'PLANNING') {
            if (stateTransitions['CLASSIFYING']) {
              stagePlanningTime.add(transitionTime - stateTransitions['CLASSIFYING']);
            }
            planningTime.add(transitionTime);
          } else if (currentState === 'MCP_EXECUTING') {
            if (stateTransitions['PLANNING']) {
              stageMcpExecutionTime.add(transitionTime - stateTransitions['PLANNING']);
            }
            mcpExecutionTime.add(transitionTime);
          } else if (currentState === 'GENERATING') {
            if (stateTransitions['MCP_EXECUTING']) {
              stageGenerationTime.add(transitionTime - stateTransitions['MCP_EXECUTING']);
            }
            generationTime.add(transitionTime);
          } else if (currentState === 'REVIEWING') {
            if (stateTransitions['GENERATING']) {
              stageReviewTime.add(transitionTime - stateTransitions['GENERATING']);
            }
            reviewTime.add(transitionTime);
          } else if (currentState === 'COMPLETE') {
            pipelineCompleteTime.add(transitionTime);
            pipelineTotalTime.add(transitionTime);
            pipelineCompleted.add(1);
            console.log('Pipeline ' + projectId + ': COMPLETE in ' + transitionTime + 'ms');
            return;
          } else if (currentState === 'FAILED') {
            pipelineFailed.add(1);
            pipelineStageTime.add(transitionTime);
            console.log('Pipeline ' + projectId + ': FAILED after ' + transitionTime + 'ms');
            return;
          }
          
          lastState = currentState;
        }
      }
      
      sleep(POLL_INTERVAL / 1000);
    }
    
    if (!pipelineComplete) {
      pipelineTimeout.add(1);
      console.log('Pipeline ' + projectId + ': TIMEOUT after ' + MAX_POLL_TIME + 'ms (last state: ' + lastState + ')');
    }
  });

  sleep(1);
}

export function teardown(data) {
  var totalDuration = Date.now() - data.testStartTime;
  
  console.log('AI Pipeline Test: Completed');
  console.log('AI Pipeline Test: Duration: ' + Math.floor(totalDuration / 1000) + 's');
  
  var health = healthCheck();
  if (health.healthData && health.healthData.services) {
    var queueStats = health.healthData.services.queueStats || {};
    console.log('AI Pipeline Test: Final queue - Active: ' + (queueStats.active || 0) + ', Waiting: ' + (queueStats.waiting || 0) + ', Failed: ' + (queueStats.failed || 0) + ', Completed: ' + (queueStats.completed || 0));
  }
}
