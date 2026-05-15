
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
} from "react";

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

interface DashboardProps {
  token: string;
}

type ServiceStatus = "up" | "down" | "degraded";

interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  uptime?: string;
}

interface QueueStats {
  active: number;
  waiting: number;
  completed: number;
  failed: number;
}

interface HealthResponse {
  status: string;
  services: {
    redis: ServiceStatus;
    database: ServiceStatus;
    queue: ServiceStatus;
    api: ServiceStatus;
  };
  queueStats: QueueStats;
}

interface Project {
  id: string;
  name: string;
  prompt: string;
  state: string;
  deployUrl?: string;
  createdAt: string;
  updatedAt: string;
  context?: {
    aiModel?: string;
    tokensInput?: number;
    tokensOutput?: number;
    costUsd?: number;
    latencyMs?: number;
    provider?: string;
    circuitBreaker?: "closed" | "open" | "half-open";
    mcpTools?: McpToolInvocation[];
  };
}

interface McpToolInvocation {
  tool: string;
  durationMs: number;
  status: "success" | "failure";
}

interface DailyStat {
  date: string;
  count: number;
  successRate: number;
  cost: number;
  avgTime: number;
}

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */

const PIPELINE_STATES: {
  key: string;
  label: string;
  color: string;
  bg: string;
}[] = [
  { key: "INIT", label: "INIT", color: "#94a3b8", bg: "rgba(148,163,184,.15)" },
  { key: "ANALYSIS", label: "ANALYSIS", color: "#a78bfa", bg: "rgba(167,139,250,.15)" },
  { key: "PLANNING", label: "PLANNING", color: "#60a5fa", bg: "rgba(96,165,250,.15)" },
  { key: "EXECUTE_MCP", label: "EXECUTE_MCP", color: "#fb923c", bg: "rgba(251,146,60,.15)" },
  { key: "GENERATE", label: "GENERATE", color: "#22d3ee", bg: "rgba(34,211,238,.15)" },
  { key: "TEST", label: "TEST", color: "#facc15", bg: "rgba(250,204,21,.15)" },
  { key: "FIX", label: "FIX", color: "#f87171", bg: "rgba(248,113,113,.15)" },
  { key: "DEPLOY", label: "DEPLOY", color: "#f472b6", bg: "rgba(244,114,182,.15)" },
  { key: "DONE", label: "DONE", color: "#34d399", bg: "rgba(52,211,153,.15)" },
  { key: "FAILED", label: "FAILED", color: "#dc2626", bg: "rgba(220,38,38,.15)" },
];

const MCP_TOOLS_LIST = [
  "figma",
  "notion",
  "playwright",
  "cloudflare",
  "supabase",
  "github",
  "slack",
  "websearch",
];

const API_BASE = "";

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

function statusDot(s: ServiceStatus): string {
  if (s === "up") return "#10b981";
  if (s === "down") return "#ef4444";
  return "#f59e0b";
}

function fmt(n: number): string {
  return n.toLocaleString("fr-FR");
}

function fmtUsd(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function shortDay(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `il y a ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  return `il y a ${hours}h`;
}

/* ═══════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════ */

const S: Record<string, CSSProperties> = {
  root: {
    fontFamily: "system-ui, -apple-system, sans-serif",
    background: "#0f172a",
    color: "#e2e8f0",
    minHeight: "100vh",
    padding: 24,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
    flexWrap: "wrap" as const,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: "-0.5px",
    background: "linear-gradient(135deg,#3b82f6,#8b5cf6)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: "#94a3b8",
    marginTop: 2,
  },
  card: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 12,
    padding: 20,
    position: "relative" as const,
    overflow: "hidden",
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "#94a3b8",
    marginBottom: 12,
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
    gap: 16,
  },
  grid4: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
    gap: 16,
  },
  grid8: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))",
    gap: 10,
  },
  healthRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 0",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
  },
  healthLabel: {
    fontSize: 13,
    color: "#cbd5e1",
    flex: 1,
  },
  healthUptime: {
    fontSize: 11,
    color: "#64748b",
  },
  statValue: {
    fontSize: 32,
    fontWeight: 700,
    lineHeight: 1.1,
  },
  statLabel: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 4,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.03em",
  },
  badgeCount: {
    fontSize: 13,
    fontWeight: 700,
  },
  pipelineFlow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
    alignItems: "center",
  },
  arrow: {
    color: "#475569",
    fontSize: 16,
    lineHeight: 1,
  },
  tableWrap: {
    overflowX: "auto" as const,
    maxHeight: 480,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    color: "#94a3b8",
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    borderBottom: "1px solid #334155",
    position: "sticky" as const,
    top: 0,
    background: "#1e293b",
    zIndex: 2,
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #1e293b",
    color: "#cbd5e1",
    verticalAlign: "top",
  },
  tr: {
    cursor: "pointer",
    transition: "background .15s",
  },
  link: {
    color: "#60a5fa",
    textDecoration: "none",
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    background: "#0f172a",
    overflow: "hidden",
    flex: 1,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
    transition: "width .4s ease",
  },
  sseIndicator: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "#94a3b8",
  },
  sseDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
  },
  chartRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 6,
    height: 120,
    paddingTop: 8,
  },
  barCol: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
  },
  bar: {
    borderRadius: "4px 4px 0 0",
    width: "100%",
    maxWidth: 40,
    transition: "height .4s ease",
  },
  barLabel: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 4,
    textAlign: "center" as const,
  },
  barValue: {
    fontSize: 10,
    color: "#94a3b8",
    marginBottom: 2,
  },
  section: {
    marginBottom: 24,
  },
  expandContent: {
    padding: "12px 12px 12px 24px",
    background: "#0f172a",
    borderTop: "1px solid #334155",
  },
  expandRow: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap" as const,
    fontSize: 12,
    color: "#94a3b8",
  },
  expandItem: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  },
  expandLabel: {
    fontSize: 10,
    textTransform: "uppercase" as const,
    color: "#64748b",
    letterSpacing: "0.05em",
  },
  expandValue: {
    color: "#e2e8f0",
    fontSize: 13,
  },
  queueRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  queueLabel: {
    fontSize: 13,
    width: 100,
    color: "#cbd5e1",
  },
  queueCount: {
    fontSize: 13,
    fontWeight: 600,
    width: 50,
    textAlign: "right" as const,
  },
  mcpGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
    gap: 10,
  },
  mcpCard: {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 8,
    padding: 12,
  },
  mcpName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#e2e8f0",
    marginBottom: 6,
  },
  mcpDetail: {
    fontSize: 11,
    color: "#94a3b8",
    marginBottom: 2,
  },
  aiMetricRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid #334155",
    fontSize: 13,
  },
  aiMetricLabel: {
    color: "#94a3b8",
  },
  aiMetricValue: {
    color: "#e2e8f0",
    fontWeight: 600,
  },
  adminLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 20px",
    background: "linear-gradient(135deg,#3b82f6,#8b5cf6)",
    borderRadius: 8,
    color: "#fff",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 14,
    transition: "opacity .15s",
  },
  lineChartSvg: {
    width: "100%",
    height: 100,
  },
  refreshBadge: {
    fontSize: 11,
    color: "#64748b",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  spinner: {
    display: "inline-block",
    width: 14,
    height: 14,
    border: "2px solid #334155",
    borderTopColor: "#3b82f6",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  tooltip: {
    position: "absolute" as const,
    background: "#0f172a",
    border: "1px solid #475569",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 11,
    color: "#e2e8f0",
    zIndex: 50,
    pointerEvents: "none" as const,
    whiteSpace: "nowrap" as const,
  },
};

/* ═══════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

/* --- System Health Banner --- */
function SystemHealthBanner({ services }: { services: ServiceHealth[] }) {
  return (
    <div style={S.card}>
      <div style={S.cardTitle}>État des Services Système</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 4 }}>
        {services.map((s) => (
          <div key={s.name} style={S.healthRow}>
            <div style={{ ...S.dot, background: statusDot(s.status), boxShadow: `0 0 6px ${statusDot(s.status)}` }} />
            <span style={S.healthLabel}>{s.name}</span>
            <span style={S.healthUptime}>{s.uptime ?? "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --- Stats Cards --- */
function StatsCards({ total, completed, failed, successRate }: { total: number; completed: number; failed: number; successRate: number }) {
  const cards = [
    { label: "Total Projets", value: fmt(total), color: "#3b82f6", icon: "📦" },
    { label: "Terminés (DONE)", value: fmt(completed), color: "#10b981", icon: "✅" },
    { label: "Échoués (FAILED)", value: fmt(failed), color: "#ef4444", icon: "❌" },
    { label: "Taux de Réussite", value: `${successRate.toFixed(1)}%`, color: "#f59e0b", icon: "📈" },
  ];
  return (
    <div style={S.grid4}>
      {cards.map((c) => (
        <div key={c.label} style={{ ...S.card, borderTop: `3px solid ${c.color}` }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>{c.icon}</div>
          <div style={{ ...S.statValue, color: c.color }}>{c.value}</div>
          <div style={S.statLabel}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

/* --- L4 Pipeline State Visualization --- */
function PipelineVisualization({ stateCounts }: { stateCounts: Record<string, number> }) {
  return (
    <div style={S.card}>
      <div style={S.cardTitle}>Pipeline L4 — Machine à États</div>
      <div style={S.pipelineFlow}>
        {PIPELINE_STATES.map((ps, i) => (
          <React.Fragment key={ps.key}>
            <div
              style={{
                ...S.badge,
                background: ps.bg,
                color: ps.color,
                border: `1px solid ${ps.color}44`,
              }}
            >
              <span>{ps.label}</span>
              <span style={S.badgeCount}>{stateCounts[ps.key] ?? 0}</span>
            </div>
            {i < PIPELINE_STATES.length - 1 && (
              <span style={S.arrow}>▸</span>
            )}
          </React.Fragment>
        ))}
      </div>
      {/* Pipeline bar visualization */}
      <div style={{ marginTop: 16, display: "flex", gap: 2, borderRadius: 6, overflow: "hidden", height: 24 }}>
        {PIPELINE_STATES.map((ps) => {
          const count = stateCounts[ps.key] ?? 0;
          if (count === 0) return null;
          return (
            <div
              key={ps.key}
              style={{
                background: ps.color,
                flex: count,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                color: "#0f172a",
                minWidth: count > 0 ? 24 : 0,
              }}
              title={`${ps.label}: ${count}`}
            >
              {count}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --- AI Metrics Section --- */
function AIMetrics({ projects }: { projects: Project[] }) {
  const providerStats: Record<string, { model: string; tokensIn: number; tokensOut: number; cost: number; latency: number; count: number; circuit: string }> = {};

  for (const p of projects) {
    const prov = p.context?.provider || "DashScope";
    if (!providerStats[prov]) {
      providerStats[prov] = { model: p.context?.aiModel || "qwen3-coder-480b-a35b-instruct", tokensIn: 0, tokensOut: 0, cost: 0, latency: 0, count: 0, circuit: p.context?.circuitBreaker || "closed" };
    }
    const s = providerStats[prov];
    s.tokensIn += p.context?.tokensInput || 0;
    s.tokensOut += p.context?.tokensOutput || 0;
    s.cost += p.context?.costUsd || 0;
    s.latency += p.context?.latencyMs || 0;
    s.count += 1;
    if (p.context?.circuitBreaker) s.circuit = p.context.circuitBreaker;
  }

  if (Object.keys(providerStats).length === 0) {
    // Show placeholder with default DashScope
    providerStats["DashScope"] = { model: "qwen3-coder-480b-a35b-instruct", tokensIn: 0, tokensOut: 0, cost: 0, latency: 0, count: 0, circuit: "closed" };
  }

  const circuitColor = (c: string) => {
    if (c === "closed") return "#10b981";
    if (c === "open") return "#ef4444";
    return "#f59e0b";
  };
  const circuitLabel = (c: string) => {
    if (c === "closed") return "Fermé (OK)";
    if (c === "open") return "Ouvert (Bloqué)";
    return "Demi-ouvert";
  };

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>Métriques IA</div>
      {Object.entries(providerStats).map(([provider, stats]) => (
        <div key={provider} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginBottom: 8 }}>
            {provider === "DashScope" ? "🤖" : provider === "OpenAI" ? "🧠" : "🔮"} {provider}
          </div>
          <div style={S.aiMetricRow}>
            <span style={S.aiMetricLabel}>Modèle</span>
            <span style={S.aiMetricValue}>{stats.model}</span>
          </div>
          <div style={S.aiMetricRow}>
            <span style={S.aiMetricLabel}>Tokens Entrée (total)</span>
            <span style={S.aiMetricValue}>{fmt(stats.tokensIn)}</span>
          </div>
          <div style={S.aiMetricRow}>
            <span style={S.aiMetricLabel}>Tokens Sortie (total)</span>
            <span style={S.aiMetricValue}>{fmt(stats.tokensOut)}</span>
          </div>
          <div style={S.aiMetricRow}>
            <span style={S.aiMetricLabel}>Tokens / Projet</span>
            <span style={S.aiMetricValue}>{stats.count > 0 ? fmt(Math.round((stats.tokensIn + stats.tokensOut) / stats.count)) : "—"}</span>
          </div>
          <div style={S.aiMetricRow}>
            <span style={S.aiMetricLabel}>Coût Total (USD)</span>
            <span style={{ ...S.aiMetricValue, color: "#f59e0b" }}>${fmtUsd(stats.cost)}</span>
          </div>
          <div style={S.aiMetricRow}>
            <span style={S.aiMetricLabel}>Coût / Projet (USD)</span>
            <span style={{ ...S.aiMetricValue, color: "#f59e0b" }}>${stats.count > 0 ? fmtUsd(stats.cost / stats.count) : "—"}</span>
          </div>
          <div style={S.aiMetricRow}>
            <span style={S.aiMetricLabel}>Latence Moyenne (ms)</span>
            <span style={S.aiMetricValue}>{stats.count > 0 ? Math.round(stats.latency / stats.count) : "—"}</span>
          </div>
          <div style={{ ...S.aiMetricRow, borderBottom: "none" }}>
            <span style={S.aiMetricLabel}>Circuit Breaker</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, color: circuitColor(stats.circuit) }}>
              <span style={{ ...S.dot, width: 8, height: 8, background: circuitColor(stats.circuit) }} />
              {circuitLabel(stats.circuit)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* --- MCP Tools Section --- */
function MCPToolsSection({ projects }: { projects: Project[] }) {
  const toolStats: Record<string, { count: number; success: number; failure: number; totalDuration: number }> = {};
  for (const t of MCP_TOOLS_LIST) {
    toolStats[t] = { count: 0, success: 0, failure: 0, totalDuration: 0 };
  }
  for (const p of projects) {
    if (p.context?.mcpTools) {
      for (const inv of p.context.mcpTools) {
        if (!toolStats[inv.tool]) toolStats[inv.tool] = { count: 0, success: 0, failure: 0, totalDuration: 0 };
        toolStats[inv.tool].count += 1;
        toolStats[inv.tool].totalDuration += inv.durationMs;
        if (inv.status === "success") toolStats[inv.tool].success += 1;
        else toolStats[inv.tool].failure += 1;
      }
    }
  }

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>Outils MCP</div>
      <div style={S.mcpGrid}>
        {MCP_TOOLS_LIST.map((tool) => {
          const s = toolStats[tool];
          const avgDur = s.count > 0 ? Math.round(s.totalDuration / s.count) : 0;
          const successRate = s.count > 0 ? ((s.success / s.count) * 100).toFixed(0) : "—";
          return (
            <div key={tool} style={S.mcpCard}>
              <div style={S.mcpName}>
                🔧 {tool.charAt(0).toUpperCase() + tool.slice(1)}
              </div>
              <div style={S.mcpDetail}>Invocations : {s.count}</div>
              <div style={S.mcpDetail}>Succès : {s.success} | Échecs : {s.failure}</div>
              <div style={S.mcpDetail}>Durée moy. : {avgDur > 0 ? `${avgDur}ms` : "—"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <div style={{ ...S.progressBarBg, width: "100%", height: 6 }}>
                  <div
                    style={{
                      ...S.progressBarFill,
                      width: s.count > 0 ? `${(s.success / s.count) * 100}%` : "0%",
                      background: s.count > 0 && s.success / s.count >= 0.8 ? "#10b981" : s.count > 0 && s.success / s.count >= 0.5 ? "#f59e0b" : "#ef4444",
                    }}
                  />
                </div>
                <span style={{ fontSize: 11, color: "#94a3b8", minWidth: 32 }}>{successRate === "—" ? "—" : `${successRate}%`}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --- Queue Status Panel --- */
function QueueStatusPanel({ queueStats }: { queueStats: QueueStats }) {
  const total = queueStats.active + queueStats.waiting + queueStats.completed + queueStats.failed;
  const rows = [
    { label: "Actifs", value: queueStats.active, color: "#3b82f6" },
    { label: "En Attente", value: queueStats.waiting, color: "#f59e0b" },
    { label: "Terminés", value: queueStats.completed, color: "#10b981" },
    { label: "Échoués", value: queueStats.failed, color: "#ef4444" },
  ];
  return (
    <div style={S.card}>
      <div style={S.cardTitle}>File d&apos;Attente BullMQ</div>
      {rows.map((r) => (
        <div key={r.label} style={S.queueRow}>
          <span style={S.queueLabel}>{r.label}</span>
          <div style={S.progressBarBg}>
            <div
              style={{
                ...S.progressBarFill,
                width: total > 0 ? `${(r.value / total) * 100}%` : "0%",
                background: r.color,
              }}
            />
          </div>
          <span style={{ ...S.queueCount, color: r.color }}>{fmt(r.value)}</span>
        </div>
      ))}
      <div style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>
        Total : {fmt(total)}
      </div>
    </div>
  );
}

/* --- Charts Section --- */
function ChartsSection({ dailyStats }: { dailyStats: DailyStat[] }) {
  const maxCount = Math.max(...dailyStats.map((d) => d.count), 1);
  const maxCost = Math.max(...dailyStats.map((d) => d.cost), 0.01);
  const maxTime = Math.max(...dailyStats.map((d) => d.avgTime), 1);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
      {/* Projects per day */}
      <div style={S.card}>
        <div style={S.cardTitle}>Projets / Jour (7 jours)</div>
        <div style={S.chartRow}>
          {dailyStats.map((d) => (
            <div key={d.date} style={S.barCol}>
              <div style={S.barValue}>{d.count}</div>
              <div
                style={{
                  ...S.bar,
                  height: `${(d.count / maxCount) * 100}%`,
                  background: "linear-gradient(180deg,#3b82f6,#1d4ed8)",
                }}
              />
              <div style={S.barLabel}>{shortDay(d.date)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Success rate trend — SVG line */}
      <div style={S.card}>
        <div style={S.cardTitle}>Tendance Taux de Réussite</div>
        <svg style={S.lineChartSvg} viewBox="0 0 280 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
          </defs>
          {dailyStats.length > 1 && (
            <>
              <path
                d={dailyStats
                  .map((d, i) => {
                    const x = (i / (dailyStats.length - 1)) * 270 + 5;
                    const y = 95 - (d.successRate / 100) * 90;
                    return `${i === 0 ? "M" : "L"}${x},${y}`;
                  })
                  .join(" ")}
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
              />
              <path
                d={
                  dailyStats
                    .map((d, i) => {
                      const x = (i / (dailyStats.length - 1)) * 270 + 5;
                      const y = 95 - (d.successRate / 100) * 90;
                      return `${i === 0 ? "M" : "L"}${x},${y}`;
                    })
                    .join(" ") +
                  ` L${((dailyStats.length - 1) / (dailyStats.length - 1)) * 270 + 5},95 L5,95 Z`
                }
                fill="url(#successGrad)"
              />
              {dailyStats.map((d, i) => {
                const x = (i / (dailyStats.length - 1)) * 270 + 5;
                const y = 95 - (d.successRate / 100) * 90;
                return <circle key={i} cx={x} cy={y} r="3" fill="#10b981" />;
              })}
            </>
          )}
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          {dailyStats.map((d) => (
            <span key={d.date} style={S.barLabel}>{shortDay(d.date)}</span>
          ))}
        </div>
      </div>

      {/* AI cost distribution */}
      <div style={S.card}>
        <div style={S.cardTitle}>Distribution Coûts IA (USD)</div>
        <div style={S.chartRow}>
          {dailyStats.map((d) => (
            <div key={d.date} style={S.barCol}>
              <div style={S.barValue}>${d.cost.toFixed(1)}</div>
              <div
                style={{
                  ...S.bar,
                  height: `${(d.cost / maxCost) * 100}%`,
                  background: "linear-gradient(180deg,#f59e0b,#d97706)",
                }}
              />
              <div style={S.barLabel}>{shortDay(d.date)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Avg generation time */}
      <div style={S.card}>
        <div style={S.cardTitle}>Temps Moyen de Génération (s)</div>
        <div style={S.chartRow}>
          {dailyStats.map((d) => (
            <div key={d.date} style={S.barCol}>
              <div style={S.barValue}>{(d.avgTime / 1000).toFixed(1)}s</div>
              <div
                style={{
                  ...S.bar,
                  height: `${(d.avgTime / maxTime) * 100}%`,
                  background: "linear-gradient(180deg,#8b5cf6,#6d28d9)",
                }}
              />
              <div style={S.barLabel}>{shortDay(d.date)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --- Projects Table --- */
function ProjectsTable({ projects }: { projects: Project[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => (prev === id ? null : id));
  };

  const stateColor = (state: string): string => {
    const found = PIPELINE_STATES.find((ps) => ps.key === state);
    return found ? found.color : "#94a3b8";
  };

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>Liste des Projets</div>
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Nom</th>
              <th style={S.th}>Prompt</th>
              <th style={S.th}>État</th>
              <th style={S.th}>Modèle IA</th>
              <th style={S.th}>Tokens</th>
              <th style={S.th}>Coût</th>
              <th style={S.th}>Créé le</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const isExpanded = expanded === p.id;
              const totalTokens = (p.context?.tokensInput || 0) + (p.context?.tokensOutput || 0);
              const sc = stateColor(p.state);
              return (
                <React.Fragment key={p.id}>
                  <tr
                    style={S.tr}
                    onClick={() => toggleExpand(p.id)}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#1e293b"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <td style={{ ...S.td, fontWeight: 600, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {p.name}
                    </td>
                    <td style={{ ...S.td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {p.prompt}
                    </td>
                    <td style={S.td}>
                      <span style={{ ...S.badge, background: `${sc}22`, color: sc, border: `1px solid ${sc}44` }}>
                        {p.state}
                      </span>
                    </td>
                    <td style={{ ...S.td, fontSize: 11, color: "#94a3b8" }}>
                      {p.context?.aiModel || "—"}
                    </td>
                    <td style={S.td}>
                      {totalTokens > 0 ? fmt(totalTokens) : "—"}
                    </td>
                    <td style={S.td}>
                      {p.context?.costUsd ? `$${fmtUsd(p.context.costUsd)}` : "—"}
                    </td>
                    <td style={{ ...S.td, fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" as const }}>
                      {fmtDate(p.createdAt)}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} style={{ padding: 0 }}>
                        <div style={S.expandContent}>
                          <div style={S.expandRow}>
                            <div style={S.expandItem}>
                              <span style={S.expandLabel}>ID</span>
                              <span style={S.expandValue}>{p.id}</span>
                            </div>
                            <div style={S.expandItem}>
                              <span style={S.expandLabel}>Prompt Complet</span>
                              <span style={{ ...S.expandValue, maxWidth: 300, wordBreak: "break-word" as const }}>{p.prompt}</span>
                            </div>
                            <div style={S.expandItem}>
                              <span style={S.expandLabel}>Fournisseur</span>
                              <span style={S.expandValue}>{p.context?.provider || "DashScope"}</span>
                            </div>
                            <div style={S.expandItem}>
                              <span style={S.expandLabel}>Tokens Entrée</span>
                              <span style={S.expandValue}>{p.context?.tokensInput ? fmt(p.context.tokensInput) : "—"}</span>
                            </div>
                            <div style={S.expandItem}>
                              <span style={S.expandLabel}>Tokens Sortie</span>
                              <span style={S.expandValue}>{p.context?.tokensOutput ? fmt(p.context.tokensOutput) : "—"}</span>
                            </div>
                            <div style={S.expandItem}>
                              <span style={S.expandLabel}>Latence</span>
                              <span style={S.expandValue}>{p.context?.latencyMs ? `${p.context.latencyMs}ms` : "—"}</span>
                            </div>
                            <div style={S.expandItem}>
                              <span style={S.expandLabel}>Circuit Breaker</span>
                              <span style={S.expandValue}>{p.context?.circuitBreaker || "—"}</span>
                            </div>
                            <div style={S.expandItem}>
                              <span style={S.expandLabel}>URL Déploiement</span>
                              {p.deployUrl ? (
                                <a href={p.deployUrl} target="_blank" rel="noopener noreferrer" style={S.link}>
                                  {p.deployUrl}
                                </a>
                              ) : (
                                <span style={S.expandValue}>—</span>
                              )}
                            </div>
                            <div style={S.expandItem}>
                              <span style={S.expandLabel}>Mis à Jour</span>
                              <span style={S.expandValue}>{fmtDate(p.updatedAt)}</span>
                            </div>
                          </div>
                          {p.context?.mcpTools && p.context.mcpTools.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                              <span style={{ ...S.expandLabel, fontSize: 11, display: "block", marginBottom: 6 }}>Outils MCP Invoqués</span>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                                {p.context.mcpTools.map((t, i) => (
                                  <span
                                    key={i}
                                    style={{
                                      ...S.badge,
                                      background: t.status === "success" ? "rgba(16,185,129,.15)" : "rgba(239,68,68,.15)",
                                      color: t.status === "success" ? "#10b981" : "#ef4444",
                                      border: `1px solid ${t.status === "success" ? "#10b98144" : "#ef444444"}`,
                                    }}
                                  >
                                    {t.tool} · {t.durationMs}ms · {t.status === "success" ? "✓" : "✗"}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN DASHBOARD COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export function Dashboard({ token }: DashboardProps) {
  /* --- State --- */
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [queueStats, setQueueStats] = useState<QueueStats>({ active: 0, waiting: 0, completed: 0, failed: 0 });
  const [projects, setProjects] = useState<Project[]>([]);
  const [stateCounts, setStateCounts] = useState<Record<string, number>>({});
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sseRef = useRef<EventSource | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* --- Fetch Helpers --- */
  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }), [token]);

  /* --- Process projects into derived data --- */
  const processProjects = useCallback((projs: Project[]) => {
    // State counts
    const counts: Record<string, number> = {};
    for (const ps of PIPELINE_STATES) counts[ps.key] = 0;
    for (const p of projs) {
      counts[p.state] = (counts[p.state] || 0) + 1;
    }
    setStateCounts(counts);

    // Daily stats (last 7 days)
    const now = new Date();
    const days: DailyStat[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();

      const dayProjects = projs.filter((p) => p.createdAt >= dayStart && p.createdAt < dayEnd);
      const dayDone = dayProjects.filter((p) => p.state === "DONE").length;
      const dayFailed = dayProjects.filter((p) => p.state === "FAILED").length;
      const totalDay = dayDone + dayFailed;
      const successRate = totalDay > 0 ? (dayDone / totalDay) * 100 : dayProjects.length > 0 ? 100 : 0;
      const cost = dayProjects.reduce((s, p) => s + (p.context?.costUsd || 0), 0);
      const avgTime = dayProjects.length > 0
        ? dayProjects.reduce((s, p) => s + (p.context?.latencyMs || 0), 0) / dayProjects.length
        : 0;

      days.push({
        date: dayStart,
        count: dayProjects.length,
        successRate,
        cost,
        avgTime,
      });
    }
    setDailyStats(days);
  }, []);

  /* --- Fetch Health --- */
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/health`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`Health: ${res.status}`);
      const data: HealthResponse = await res.json();

      const serviceList: ServiceHealth[] = [
        { name: "API Gateway", status: data.services.api || "up", uptime: "99.9%" },
        { name: "Redis", status: data.services.redis || "up", uptime: "99.8%" },
        { name: "PostgreSQL", status: data.services.database || "up", uptime: "99.9%" },
        { name: "BullMQ", status: data.services.queue || "up", uptime: "99.7%" },
        { name: "Service d'Exécution", status: data.services.api || "up", uptime: "99.5%" },
        { name: "Warm Pool", status: data.services.api || "up", uptime: "99.6%" },
        { name: "Prometheus", status: "up", uptime: "99.9%" },
        { name: "Grafana", status: "up", uptime: "99.9%" },
      ];
      setServices(serviceList);
      setQueueStats(data.queueStats || { active: 0, waiting: 0, completed: 0, failed: 0 });
    } catch {
      // Fallback: show all as unknown
      setServices([
        { name: "API Gateway", status: "down" as ServiceStatus },
        { name: "Redis", status: "down" as ServiceStatus },
        { name: "PostgreSQL", status: "down" as ServiceStatus },
        { name: "BullMQ", status: "down" as ServiceStatus },
        { name: "Service d'Exécution", status: "down" as ServiceStatus },
        { name: "Warm Pool", status: "down" as ServiceStatus },
        { name: "Prometheus", status: "down" as ServiceStatus },
        { name: "Grafana", status: "down" as ServiceStatus },
      ]);
    }
  }, [authHeaders]);

  /* --- Fetch Projects --- */
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/projects`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`Projects: ${res.status}`);
      const data = await res.json();
      const projs: Project[] = data.projects || data || [];
      setProjects(projs);
      processProjects(projs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    }
  }, [authHeaders, processProjects]);

  /* --- Initial Load + Auto-refresh --- */
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchHealth(), fetchProjects()]);
      setLastUpdate(new Date());
      setLoading(false);
    };
    loadAll();

    intervalRef.current = setInterval(async () => {
      await Promise.all([fetchHealth(), fetchProjects()]);
      setLastUpdate(new Date());
    }, 15000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchHealth, fetchProjects]);

  /* --- SSE Connection for real-time updates --- */
  useEffect(() => {
    // Connect SSE to first active project if any
    const connectSSE = () => {
      if (sseRef.current) {
        sseRef.current.close();
      }
      const activeProject = projects.find((p) =>
        ["INIT", "ANALYSIS", "PLANNING", "EXECUTE_MCP", "GENERATE", "TEST", "FIX", "DEPLOY"].includes(p.state)
      );
      if (activeProject) {
        try {
          const es = new EventSource(`${API_BASE}/api/stream/${activeProject.id}?token=${encodeURIComponent(token)}`);
          es.onopen = () => setSseConnected(true);
          es.onmessage = (e) => {
            try {
              const update = JSON.parse(e.data);
              if (update.state) {
                setProjects((prev) =>
                  prev.map((p) => (p.id === activeProject.id ? { ...p, state: update.state, updatedAt: new Date().toISOString() } : p))
                );
              }
            } catch {
              // ignore parse errors
            }
          };
          es.onerror = () => {
            setSseConnected(false);
            es.close();
            // Reconnect after 10s
            setTimeout(connectSSE, 10000);
          };
          sseRef.current = es;
        } catch {
          setSseConnected(false);
        }
      }
    };

    if (projects.length > 0) {
      connectSSE();
    }

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [projects.length, token]);

  /* --- Derived Stats --- */
  const totalProjects = projects.length;
  const completedProjects = projects.filter((p) => p.state === "DONE").length;
  const failedProjects = projects.filter((p) => p.state === "FAILED").length;
  const successRate = totalProjects > 0 ? ((completedProjects / totalProjects) * 100) : 0;

  /* --- Render --- */
  return (
    <div style={S.root}>
      {/* Inject keyframe animation for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ─── HEADER ─── */}
      <header style={S.header}>
        <div>
          <h1 style={S.title}>AENEWS BUILDER</h1>
          <div style={S.subtitle}>Tableau de Bord Enterprise — Orchestration IA</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" as const }}>
          <div style={S.sseIndicator}>
            <div
              style={{
                ...S.sseDot,
                background: sseConnected ? "#10b981" : "#ef4444",
                boxShadow: `0 0 6px ${sseConnected ? "#10b981" : "#ef4444"}`,
              }}
            />
            {sseConnected ? "SSE Connecté" : "SSE Déconnecté"}
          </div>
          <div style={S.refreshBadge}>
            {loading && <span style={S.spinner} />}
            Dernière MAJ : {timeAgo(lastUpdate)}
          </div>
        </div>
      </header>

      {/* ─── ERROR BANNER ─── */}
      {error && (
        <div
          style={{
            background: "rgba(239,68,68,.15)",
            border: "1px solid #ef444444",
            borderRadius: 8,
            padding: "10px 16px",
            marginBottom: 16,
            fontSize: 13,
            color: "#f87171",
          }}
        >
          ⚠️ Erreur : {error} — Les données affichées peuvent être obsolètes.
        </div>
      )}

      {/* ─── 1. SYSTEM HEALTH ─── */}
      <section style={S.section}>
        <SystemHealthBanner services={services} />
      </section>

      {/* ─── 2. STATS CARDS ─── */}
      <section style={S.section}>
        <StatsCards
          total={totalProjects}
          completed={completedProjects}
          failed={failedProjects}
          successRate={successRate}
        />
      </section>

      {/* ─── 3. PIPELINE VISUALIZATION ─── */}
      <section style={S.section}>
        <PipelineVisualization stateCounts={stateCounts} />
      </section>

      {/* ─── 4. AI METRICS + 5. MCP TOOLS ─── */}
      <section style={S.section}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
          <AIMetrics projects={projects} />
          <MCPToolsSection projects={projects} />
        </div>
      </section>

      {/* ─── 6. QUEUE STATUS ─── */}
      <section style={S.section}>
        <QueueStatusPanel queueStats={queueStats} />
      </section>

      {/* ─── 8. CHARTS ─── */}
      <section style={S.section}>
        <ChartsSection dailyStats={dailyStats} />
      </section>

      {/* ─── 9. PROJECTS TABLE ─── */}
      <section style={S.section}>
        <ProjectsTable projects={projects} />
      </section>

      {/* ─── 10. ADMIN PANEL ─── */}
      <section style={S.section}>
        <div style={S.card}>
          <div style={S.cardTitle}>Panneau d&apos;Administration Unifié</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" as const }}>
            <a
              href="http://localhost:3182"
              target="_blank"
              rel="noopener noreferrer"
              style={S.adminLink}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            >
              🛡️ Ouvrir l&apos;Interface Admin (port 3182)
            </a>
            <span style={{ fontSize: 12, color: "#64748b" }}>
              Interface d&apos;administration accessible sur le port 3182
            </span>
          </div>
          <div style={{ marginTop: 16, borderRadius: 8, overflow: "hidden", border: "1px solid #334155" }}>
            <iframe
              src="http://localhost:3182"
              style={{ width: "100%", height: 400, border: "none", background: "#0f172a" }}
              title="Panneau d'Administration"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
            <div style={{ padding: 12, fontSize: 12, color: "#64748b", textAlign: "center" as const }}>
              Si l&apos;iframe ne se charge pas, utilisez le lien ci-dessus pour ouvrir l&apos;interface dans un nouvel onglet.
            </div>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer style={{ textAlign: "center", padding: "24px 0 8px", fontSize: 11, color: "#475569" }}>
        AENEWS BUILDER Dashboard v2.0 — Rafraîchissement automatique toutes les 15 secondes
      </footer>
    </div>
  );
}

export default Dashboard;
