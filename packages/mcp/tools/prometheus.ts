/**
 * Prometheus MCP Tool
 * Execute PromQL queries, list metrics, get alerts, and inspect scrape targets
 *
 * Based on pab1it0/prometheus-mcp-server from the MCP ecosystem
 * Requires PROMETHEUS_URL env var
 */

import axios from 'axios';

export interface PrometheusTool {
  name: 'prometheus';
  permissions: ['network', 'read'];
  execute: (params: PrometheusParams) => Promise<PrometheusResult>;
}

export interface PrometheusParams {
  action: 'query' | 'getMetrics' | 'getAlerts' | 'getTargets' | 'queryRange';
  promql?: string;
  start?: string;
  end?: string;
  step?: string;
}

export interface PrometheusResult {
  success: boolean;
  data?: {
    resultType?: string;
    result?: Array<Record<string, any>>;
    metrics?: string[];
    alerts?: Array<Record<string, any>>;
    targets?: Array<Record<string, any>>;
  };
  error?: string;
}

class PrometheusAdapter {
  private prometheusUrl: string;

  constructor(prometheusUrl?: string) {
    const envUrl = prometheusUrl || process.env.PROMETHEUS_URL || 'http://localhost:9090';
    this.prometheusUrl = envUrl.replace(/\/+$/, '');
  }

  /**
   * Execute a Prometheus action
   */
  async execute(params: PrometheusParams): Promise<PrometheusResult> {
    try {
      switch (params.action) {
        case 'query':
          return await this.query(params.promql!);
        case 'getMetrics':
          return await this.getMetrics();
        case 'getAlerts':
          return await this.getAlerts();
        case 'getTargets':
          return await this.getTargets();
        case 'queryRange':
          return await this.queryRange(params.promql!, params.start!, params.end!, params.step!);
        default:
          return { success: false, error: `Unknown action: ${params.action}` };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Unknown error',
      };
    }
  }

  /**
   * Execute an instant PromQL query
   */
  async query(promql: string): Promise<PrometheusResult> {
    if (!promql) {
      return { success: false, error: 'promql is required' };
    }

    const response = await axios.get(`${this.prometheusUrl}/api/v1/query`, {
      params: { query: promql },
    });

    if (response.data.status !== 'success') {
      return {
        success: false,
        error: response.data.error || 'Prometheus query failed',
      };
    }

    return {
      success: true,
      data: {
        resultType: response.data.data.resultType,
        result: this.sanitizeResults(response.data.data.result),
      },
    };
  }

  /**
   * List available metric names
   */
  async getMetrics(): Promise<PrometheusResult> {
    const response = await axios.get(`${this.prometheusUrl}/api/v1/label/__name__/values`);

    if (response.data.status !== 'success') {
      return {
        success: false,
        error: response.data.error || 'Failed to fetch metrics',
      };
    }

    const metrics = response.data.data || [];

    return {
      success: true,
      data: { metrics, count: metrics.length },
    };
  }

  /**
   * Get active alerts (firing and pending)
   */
  async getAlerts(): Promise<PrometheusResult> {
    const response = await axios.get(`${this.prometheusUrl}/api/v1/alerts`);

    if (response.data.status !== 'success') {
      return {
        success: false,
        error: response.data.error || 'Failed to fetch alerts',
      };
    }

    const alerts = (response.data.data?.alerts || []).map((alert: any) => ({
      name: alert.labels?.alertname,
      state: alert.state,
      instance: alert.labels?.instance,
      job: alert.labels?.job,
      message: alert.annotations?.summary || alert.annotations?.message || '',
      value: alert.value,
      startsAt: alert.startsAt,
      endsAt: alert.endsAt,
    }));

    return {
      success: true,
      data: { alerts, count: alerts.length },
    };
  }

  /**
   * Get scrape targets and their health status
   */
  async getTargets(): Promise<PrometheusResult> {
    const response = await axios.get(`${this.prometheusUrl}/api/v1/targets`);

    if (response.data.status !== 'success') {
      return {
        success: false,
        error: response.data.error || 'Failed to fetch targets',
      };
    }

    const targets = (response.data.data?.activeTargets || []).map((target: any) => ({
      endpoint: target.scrapeUrl,
      state: target.health,
      lastScrape: target.lastScrape,
      lastScrapeDuration: target.lastScrapeDuration,
      error: target.lastError || null,
      labels: target.labels,
    }));

    return {
      success: true,
      data: { targets, count: targets.length },
    };
  }

  /**
   * Execute a range PromQL query over a time window
   */
  async queryRange(
    promql: string,
    start: string,
    end: string,
    step: string = '60s'
  ): Promise<PrometheusResult> {
    if (!promql || !start || !end) {
      return { success: false, error: 'promql, start, and end are required' };
    }

    // Convert human-readable time strings to epoch seconds
    const startTs = this.parseTime(start);
    const endTs = this.parseTime(end);

    const response = await axios.get(`${this.prometheusUrl}/api/v1/query_range`, {
      params: {
        query: promql,
        start: startTs,
        end: endTs,
        step,
      },
    });

    if (response.data.status !== 'success') {
      return {
        success: false,
        error: response.data.error || 'Prometheus range query failed',
      };
    }

    return {
      success: true,
      data: {
        resultType: response.data.data.resultType,
        result: this.sanitizeResults(response.data.data.result),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Convert a time string to epoch seconds
   * Accepts: ISO 8601, epoch seconds, or relative (e.g. "1h", "30m")
   */
  private parseTime(time: string): number {
    // Already epoch seconds
    if (/^\d+(\.\d+)?$/.test(time)) {
      return parseFloat(time);
    }

    // ISO 8601
    const isoMs = Date.parse(time);
    if (!isNaN(isoMs)) {
      return Math.floor(isoMs / 1000);
    }

    // Relative time (e.g. "1h ago", "-1h", "30m")
    const relativeMatch = time.match(/^(-)?(\d+)([smhdw])$/);
    if (relativeMatch) {
      const multiplier: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
      const amount = parseInt(relativeMatch[2]) * multiplier[relativeMatch[3]];
      const negate = relativeMatch[1] === '-' ? -1 : 1;
      return Math.floor(Date.now() / 1000) - (amount * negate);
    }

    throw new Error(`Invalid time format: ${time}`);
  }

  /**
   * Sanitize query results for safe serialization
   */
  private sanitizeResults(results: any[]): any[] {
    if (!results) return [];

    return results.map((r) => ({
      metric: r.metric || {},
      value: r.value || [],
      values: r.values ? r.values.slice(0, 100) : undefined,
    }));
  }
}

export default PrometheusAdapter;
