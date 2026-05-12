import React, { useState, useEffect, useRef } from 'react';
import { useSSE } from '../hooks/useSSE';
import './ProjectGenerator.css';

interface ProjectGeneratorProps {
  token: string;
}

interface ProjectState {
  jobId: string | null;
  status: 'idle' | 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  logs: string[];
  currentStep: string;
  mcpTools: MCPToolStatus[];
  artifacts?: {
    files: string[];
    preview: string;
    deployUrl?: string;
  };
}

interface MCPToolStatus {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  description: string;
}

const PIPELINE_STEPS = [
  { id: 'INIT', label: 'Initialisation', icon: '\uD83D\uDCCB' },
  { id: 'ANALYSIS', label: 'Classification IA', icon: '\uD83E\uDDE0' },
  { id: 'PLANNING', label: 'Planification', icon: '\uD83D\uDCDD' },
  { id: 'EXECUTE_MCP', label: 'Outils MCP', icon: '\uD83D\uDD27' },
  { id: 'GENERATE', label: 'G\u00e9n\u00e9ration', icon: '\uD83D\uDCC4' },
  { id: 'TEST', label: 'Tests', icon: '\uD83E\uDDEA' },
  { id: 'DEPLOY', label: 'D\u00e9ploiement', icon: '\uD83D\uDE80' },
  { id: 'DONE', label: 'Termin\u00e9', icon: '\u2705' },
];

const MCP_TOOL_INFO: Record<string, string> = {
  websearch: 'Recherche web pour les meilleures pratiques',
  figma: 'Extraction des designs Figma',
  notion: 'Import de contenu Notion',
  playwright: 'Tests E2E automatis\u00e9s',
  github: 'Cr\u00e9ation du repository GitHub',
  cloudflare: 'Configuration Cloudflare',
  supabase: 'Sch\u00e9ma de base de donn\u00e9es Supabase',
  slack: 'Notification Slack',
};

export function ProjectGenerator({ token }: ProjectGeneratorProps) {
  const [projectState, setProjectState] = useState<ProjectState>({
    jobId: null, status: 'idle', progress: 0, logs: [],
    currentStep: 'INIT', mcpTools: [],
  });
  const [prompt, setPrompt] = useState('');
  const [projectName, setProjectName] = useState('');
  const terminalRef = useRef<HTMLDivElement>(null);

  const { events, connectionStatus } = useSSE(
    projectState.jobId ? `/api/stream/${projectState.jobId}` : null
  );

  useEffect(() => {
    if (events.length > 0) {
      const latestEvent = events[events.length - 1];
      const data = latestEvent.data || {};

      setProjectState((prev) => {
        const newLogs = [...prev.logs];

        let logMsg = '';
        if (latestEvent.type === 'connected') {
          logMsg = 'Flux temps r\u00e9el connect\u00e9';
        } else if (data.message) {
          logMsg = data.message;
        } else if (data.state || data.nextState) {
          const step = PIPELINE_STEPS.find(s => s.id === data.nextState || s.id === data.state);
          logMsg = step ? '\u27A1 ' + step.icon + ' ' + step.label : '\u27A1 ' + (data.nextState || data.state);
        } else {
          logMsg = JSON.stringify(latestEvent).substring(0, 200);
        }

        if (logMsg) {
          newLogs.push('[' + new Date().toLocaleTimeString() + '] ' + logMsg);
        }

        let currentStep = prev.currentStep;
        if (data.nextState) currentStep = data.nextState;
        else if (data.state) currentStep = data.state;

        let mcpTools = [...prev.mcpTools];
        if (data.mcpTools && Array.isArray(data.mcpTools)) {
          mcpTools = data.mcpTools.map((t: any) => ({
            name: typeof t === 'string' ? t : t.name,
            status: (typeof t === 'string' ? 'running' : t.status) || 'running',
            description: MCP_TOOL_INFO[typeof t === 'string' ? t : t.name] || (typeof t === 'string' ? t : t.description || t.name),
          }));
        }

        return {
          ...prev,
          status: latestEvent.type === 'completed' ? 'completed' :
                  latestEvent.type === 'failed' || latestEvent.type === 'error_occurred' ? 'failed' : 'processing',
          progress: data.progress || prev.progress,
          logs: newLogs.slice(-100),
          currentStep,
          mcpTools,
          artifacts: data.artifacts || prev.artifacts,
        };
      });
    }
  }, [events]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [projectState.logs]);

  const handleSubmit = async () => {
    if (!prompt.trim() || projectState.status === 'processing') return;
    const name = projectName.trim() || prompt.substring(0, 50).split(' ').slice(0, 3).join(' ');

    try {
      setProjectState(prev => ({
        ...prev,
        status: 'queued',
        currentStep: 'INIT',
        mcpTools: [],
        logs: [...prev.logs, '[' + new Date().toLocaleTimeString() + '] Cr\u00e9ation du projet "' + name + '"...'],
      }));

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({ prompt, name }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || '\u00c9chec de la cr\u00e9ation');
      }

      const newJobId = data.projectId;
      setProjectState(prev => ({
        ...prev,
        jobId: newJobId,
        status: 'queued',
        logs: [...prev.logs, '[' + new Date().toLocaleTimeString() + '] \u2705 Projet en file : ' + newJobId],
      }));
    } catch (error: any) {
      setProjectState(prev => ({
        ...prev,
        status: 'failed',
        logs: [...prev.logs, '[' + new Date().toLocaleTimeString() + '] \u274C Erreur : ' + error.message],
      }));
    }
  };

  const handleReset = () => {
    setProjectState({ jobId: null, status: 'idle', progress: 0, logs: [], currentStep: 'INIT', mcpTools: [] });
    setPrompt('');
    setProjectName('');
  };

  const getStepStatus = (stepId: string): 'pending' | 'active' | 'done' | 'failed' => {
    if (projectState.status === 'failed' && projectState.currentStep === stepId) return 'failed';
    if (projectState.status === 'completed' && stepId === 'DONE') return 'done';
    const stepIdx = PIPELINE_STEPS.findIndex(s => s.id === stepId);
    const currentIdx = PIPELINE_STEPS.findIndex(s => s.id === projectState.currentStep);
    if (stepIdx < currentIdx) return 'done';
    if (stepIdx === currentIdx && projectState.status === 'processing') return 'active';
    if (stepId === 'DONE' && projectState.status === 'completed') return 'done';
    return 'pending';
  };

  return (
    <div className="project-generator">
      <div className="generator-header">
        <div>
          <h1>Nouveau Projet</h1>
          <p className="generator-subtitle">D\u00e9crivez votre projet et l'IA le construira pour vous</p>
        </div>
        {(projectState.status === 'completed' || projectState.status === 'failed') && (
          <button className="new-project-btn" onClick={handleReset}>+ Nouveau Projet</button>
        )}
      </div>

      {projectState.status !== 'idle' && (
        <div className="pipeline-progress">
          <h3 className="pipeline-title">Pipeline AENEWS</h3>
          <div className="pipeline-steps">
            {PIPELINE_STEPS.map((step) => {
              const status = getStepStatus(step.id);
              return (
                <div key={step.id} className={'pipeline-step ' + status}>
                  <div className="step-icon">{step.icon}</div>
                  <span className="step-label">{step.label}</span>
                  {status === 'active' && <div className="step-spinner" />}
                  {status === 'done' && <span className="step-check">{'\u2713'}</span>}
                  {status === 'failed' && <span className="step-fail">{'\u2717'}</span>}
                </div>
              );
            })}
          </div>
          {projectState.status === 'processing' && (
            <div className="progress-bar-container">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: projectState.progress + '%' }} />
              </div>
              <span className="progress-text">{projectState.progress}%</span>
            </div>
          )}
        </div>
      )}

      {projectState.mcpTools.length > 0 && (
        <div className="mcp-panel">
          <h3 className="mcp-title">Outils MCP</h3>
          <div className="mcp-tools-grid">
            {projectState.mcpTools.map((tool) => (
              <div key={tool.name} className={'mcp-tool-card ' + tool.status}>
                <div className="mcp-tool-header">
                  <span className="mcp-tool-name">{tool.name}</span>
                  <span className={'mcp-tool-badge ' + tool.status}>
                    {tool.status === 'running' ? '\u23F3' : tool.status === 'success' ? '\u2705' : tool.status === 'failed' ? '\u274C' : '\u23F8'}
                  </span>
                </div>
                <span className="mcp-tool-desc">{tool.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(projectState.status === 'idle' || projectState.status === 'queued') && (
        <div className="generator-form">
          <div className="form-group">
            <label>Nom du projet (optionnel)</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="ex: Mon Blog E-commerce"
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>Description du projet *</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={"D\u00e9crivez votre projet en d\u00e9tail...\nex: Construire un blog moderne avec React, Tailwind CSS, authentification et un panneau d'administration"}
              rows={6}
              className="form-textarea"
              minLength={10}
              required
            />
          </div>
          <div className="form-actions">
            <button
              className="generate-btn"
              onClick={handleSubmit}
              disabled={prompt.trim().length < 10 || projectState.status === 'processing'}
            >
              {projectState.status === 'queued' ? 'En file d\'attente...' : 'G\u00e9n\u00e9rer le Projet'}
            </button>
          </div>
          <p className="form-hint">Minimum 10 caract\u00e8res. Plus vous \u00eates pr\u00e9cis, meilleur sera le r\u00e9sultat.</p>
        </div>
      )}

      {projectState.logs.length > 0 && (
        <div className="generator-terminal">
          <div className="terminal-header">
            <div className="terminal-title">
              <span className={'status-dot ' + projectState.status} />
              <span>{projectState.status.toUpperCase()}</span>
              {connectionStatus === 'connected' && projectState.status === 'processing' && (
                <span className="sse-badge">SSE Live</span>
              )}
            </div>
            <div className="terminal-controls">
              <span className="control-dot red" />
              <span className="control-dot yellow" />
              <span className="control-dot green" />
            </div>
          </div>
          <div className="terminal-body" ref={terminalRef}>
            {projectState.logs.map((log, i) => (
              <div key={i} className="log-line">
                <span className="log-prompt">$</span>
                <span className="log-text">{log}</span>
              </div>
            ))}
            {projectState.status === 'processing' && (
              <div className="log-line">
                <span className="log-prompt">$</span>
                <span className="log-text blink">{'\u258A'}</span>
              </div>
            )}
          </div>

          {projectState.artifacts && (
            <div className="generator-result">
              {projectState.artifacts.deployUrl && (
                <a href={projectState.artifacts.deployUrl} target="_blank" rel="noopener noreferrer" className="view-live-btn">
                  Voir l'application en ligne
                </a>
              )}
              {projectState.artifacts.files?.length > 0 && (
                <div className="generated-files">
                  <h4>Fichiers g\u00e9n\u00e9r\u00e9s ({projectState.artifacts.files.length})</h4>
                  <div className="file-grid">
                    {projectState.artifacts.files.map((file, i) => (
                      <span key={i} className="file-tag">{file}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
