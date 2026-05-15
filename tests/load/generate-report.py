#!/usr/bin/env python3
"""AENEWS BUILDER - k6 Load Test Report Generator"""

import json
import sys
import os
import glob

def parse_summary(summary_file):
    """Parse a k6 summary JSON file and return formatted stats."""
    try:
        with open(summary_file) as f:
            data = json.load(f)
        metrics = data.get('metrics', {})
        
        lines = []
        
        # HTTP duration
        http_duration = metrics.get('http_req_duration', {})
        avg = http_duration.get('avg', 0)
        p95 = http_duration.get('p(95)', 0)
        p99 = http_duration.get('p(99)', 0)
        lines.append(f'  Latency - Avg: {avg:.0f}ms, P95: {p95:.0f}ms, P99: {p99:.0f}ms')
        
        # Requests
        http_reqs = metrics.get('http_reqs', {})
        count = http_reqs.get('count', 0)
        rate = http_reqs.get('rate', 0)
        lines.append(f'  Requests - Total: {count}, Rate: {rate:.1f} req/s')
        
        # Errors
        http_failed = metrics.get('http_req_failed', {})
        fail_rate = http_failed.get('rate', 0)
        lines.append(f'  Error Rate: {fail_rate*100:.1f}%')
        
        # Iterations
        iters = metrics.get('iterations', {})
        iter_count = iters.get('count', 0)
        lines.append(f'  Iterations: {iter_count}')
        
        # Custom metrics
        custom_metrics = [
            'api_latency', 'auth_login_time', 'project_creation_time', 'health_check_time',
            'pipeline_total_time', 'pipeline_initiated', 'pipeline_completed', 'pipeline_failed',
            'pipeline_timeout', 'pipeline_queue_time',
            'stage_classification_time', 'stage_planning_time', 'stage_mcp_execution_time',
            'stage_generation_time', 'stage_review_time',
            'smoke_test_passed', 'projects_created', 'projects_created_stress',
            'soak_projects_created', 'memory_leak_indicator', 'response_time_degradation',
            'stress_breakpoint', 'spike_recovery_time', 'spike_errors_peak',
            'queue_depth', 'queue_active',
            'connection_errors', 'health_check_trend', 'db_query_time',
        ]
        
        for name in custom_metrics:
            if name in metrics:
                m = metrics[name]
                if 'avg' in m:
                    lines.append(f'  {name} - Avg: {m["avg"]:.2f}, P95: {m.get("p(95)", 0):.2f}')
                elif 'passes' in m:
                    lines.append(f'  {name} - Passes: {m["passes"]}, Fails: {m.get("fails", 0)}')
                elif 'count' in m:
                    lines.append(f'  {name} - Count: {m["count"]}')
        
        return '\n'.join(lines)
    except Exception as e:
        return f'  Error parsing: {e}'


def generate_report(results_dir):
    """Generate a full report from all summary files in the results directory."""
    lines = []
    lines.append('============================================')
    lines.append('AENEWS BUILDER Load Test Summary Report')
    lines.append('============================================')
    
    from datetime import datetime
    lines.append(f'Date: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    lines.append(f'Results Dir: {results_dir}')
    lines.append('')
    
    # Find all summary files
    summary_files = sorted(glob.glob(os.path.join(results_dir, '*-summary.json')))
    
    for summary_file in summary_files:
        test_name = os.path.basename(summary_file).replace('-summary.json', '')
        lines.append(f'--- {test_name} ---')
        lines.append(parse_summary(summary_file))
        lines.append('')
    
    lines.append('============================================')
    lines.append('End of Report')
    lines.append('============================================')
    
    return '\n'.join(lines)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: generate-report.py <results_dir>")
        sys.exit(1)
    
    results_dir = sys.argv[1]
    report = generate_report(results_dir)
    
    # Save to file
    report_file = os.path.join(results_dir, 'summary-report.txt')
    with open(report_file, 'w') as f:
        f.write(report)
    
    print(report)
