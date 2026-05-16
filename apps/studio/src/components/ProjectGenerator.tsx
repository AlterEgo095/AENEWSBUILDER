import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSSE } from '../hooks/useSSE';
import './ProjectGenerator.css';

interface ProjectGeneratorProps {
  token: string;
}

interface FileInfo {
  path: string;
  type: string;
  model: string;
  reasoning: string;
  status: 'pending' | 'generating' | 'done' | 'error';
}

interface PipelineStep {
  id: string;
  label: string;
  icon: string;
  status: 'pending' | 'active' | 'done' | 'failed';
  detail?: string;
  duration?: number;
}

interface ProjectState {
  jobId: string | null;
  status: 'idle' | 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  logs: string[];
  currentStep: string;
  files: FileInfo[];
  pipelineSteps: PipelineStep[];
  classification: any;
  deployUrl: string | null;
  previewUrl: string | null;
  mcpTools: MCPToolStatus[];
  totalCost: number;
  startTime: number | null;
}

interface MCPToolStatus {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  description: string;
}

const PIPELINE_STEPS: PipelineStep[] = [
  { id: 'INIT', label: 'Initialisation', icon: '📋', status: 'pending' },
  { id: 'ANALYSIS', label: 'Classification IA', icon: '🧠', status: 'pending' },
  { id: 'PLANNING', label: 'Planification', icon: '📝', status: 'pending' },
  { id: 'EXECUTE_MCP', label: 'Outils MCP', icon: '🔧', status: 'pending' },
  { id: 'GENERATE', label: 'Génération', icon: '📄', status: 'pending' },
  { id: 'TEST', label: 'Tests & Sécurité', icon: '🧪', status: 'pending' },
  { id: 'DEPLOY', label: 'Déploiement', icon: '🚀', status: 'pending' },
  { id: 'DONE', label: 'Terminé', icon: '✅', status: 'pending' },
];

const MCP_TOOL_INFO: Record<string, string> = {
  websearch: 'Recherche web pour les meilleures pratiques',
  figma: 'Extraction des designs Figma',
  notion: 'Import de contenu Notion',
  playwright: 'Tests E2E automatisés',
  github: 'Création du repository GitHub',
  cloudflare: 'Configuration Cloudflare',
  supabase: 'Schéma de base de données Supabase',
  slack: 'Notification Slack',
};

export function ProjectGenerator({ token }: ProjectGeneratorProps) {
  const [projectState, setProjectState] = useState<ProjectState>({
    jobId: null, status: 'idle', progress: 0, logs: [],
    currentStep: 'INIT', files: [], pipelineSteps: PIPELINE_STEPS,
    classification: null, deployUrl: null, previewUrl: null,
    mcpTools: [], totalCost: 0, startTime: null,
  });
  const [prompt, setPrompt] = useState('');
  const [projectName, setProjectName] = useState('');
  const [activeTab, setActiveTab] = useState<'pipeline' | 'files' | 'preview'>('pipeline');
  const terminalRef = useRef<HTMLDivElement>(null);

  const { events, lastEvent, connectionStatus } = useSSE(
    projectState.jobId ? `/api/stream/${projectState.jobId}` : null
  );

  // Process SSE events
  useEffect(() => {
    if (!lastEvent) return;

    const data = lastEvent.data || {};
    const eventType = lastEvent.type;

    setProjectState((prev) => {
      const newLogs = [...prev.logs];
      const newFiles = [...prev.files];
      const newPipelineSteps = prev.pipelineSteps.map(s => ({ ...s }));
      let newClassification = prev.classification;
      let newDeployUrl = prev.deployUrl;
      let newPreviewUrl = prev.previewUrl;
      let newMcpTools = [...prev.mcpTools];
      let newTotalCost = prev.totalCost;

      // ── State transition events ──
      if (data.nextState || data.state) {
        const targetStep = data.nextState || data.state;
        const stepIndex = newPipelineSteps.findIndex(s => s.id === targetStep);

        // Mark all previous steps as done
        for (let i = 0; i < newPipelineSteps.length; i++) {
          if (i < (stepIndex >= 0 ? stepIndex : 999)) {
            if (newPipelineSteps[i].status === 'active') {
              newPipelineSteps[i].status = 'done';
            }
          }
        }

        // Mark current step as active
        if (stepIndex >= 0 && newPipelineSteps[stepIndex].status !== 'done') {
          newPipelineSteps[stepIndex].status = 'active';
        }

        // Log the transition
        const step = PIPELINE_STEPS.find(s => s.id === targetStep);
        if (step) {
          newLogs.push(`[ ${new Date().toLocaleTimeString()} ] ➡️ ${step.icon} ${step.label}`);
        }
      }

      // ── File generated event ──
      if (eventType === 'file_generated' && data.filePath) {
        const existingIdx = newFiles.findIndex(f => f.path === data.filePath);
        const fileInfo: FileInfo = {
          path: data.filePath,
          type: data.fileType || 'other',
          model: data.model || 'unknown',
          reasoning: data.reasoning || '',
          status: 'done',
        };
        if (existingIdx >= 0) {
          newFiles[existingIdx] = fileInfo;
        } else {
          newFiles.push(fileInfo);
        }

        // Update GENERATE step detail
        const genStep = newPipelineSteps.find(s => s.id === 'GENERATE');
        if (genStep) {
          genStep.detail = `${data.filesGenerated}/${data.totalFiles} fichiers`;
          genStep.status = 'active';
        }

        newTotalCost += data.estimatedCost || 0;
        newLogs.push(`[ ${new Date().toLocaleTimeString()} ] 📄 ${data.filePath} (${data.model}, ${data.progress}%)`);

        // Update preview URL once we have files
        if (prev.jobId && !newPreviewUrl) {
          newPreviewUrl = `/api/preview/${prev.jobId}/html`;
        }
      }

      // ── Analysis complete event ──
      if (eventType === 'analysis_complete' && data.classification) {
        newClassification = data.classification;
        const analysisStep = newPipelineSteps.find(s => s.id === 'ANALYSIS');
        if (analysisStep) {
          analysisStep.status = 'done';
          analysisStep.detail = `${data.classification.type} · ${data.classification.complexity}`;
        }

        // Update MCP tools
        if (data.mcpTools && Array.isArray(data.mcpTools)) {
          newMcpTools = data.mcpTools.map((t: any) => ({
            name: typeof t === 'string' ? t : t.name,
            status: 'pending' as const,
            description: MCP_TOOL_INFO[typeof t === 'string' ? t : t.name] || '',
          }));
        }

        newLogs.push(`[ ${new Date().toLocaleTimeString()} ] 🧠 Classifié: ${data.classification.type} (${data.classification.complexity}), ${data.fileCount} fichiers`);
      }

      // ── Security scan event ──
      if (eventType === 'security_scan_complete') {
        const testStep = newPipelineSteps.find(s => s.id === 'TEST');
        if (testStep) {
          testStep.detail = data.passed ? `Score: ${data.score}/100 ✅` : `Score: ${data.score}/100 ❌`;
        }
        newLogs.push(`[ ${new Date().toLocaleTimeString()} ] 🛡️ Scan sécurité: ${data.passed ? 'PASSÉ' : 'ÉCHOUÉ'} (${data.score}/100)`);
      }

      // ── Deploy complete event ──
      if (eventType === 'deploy_complete' && data.url) {
        newDeployUrl = data.url;
        const deployStep = newPipelineSteps.find(s => s.id === 'DEPLOY');
        if (deployStep) {
          deployStep.status = 'done';
          deployStep.detail = `${data.platform}: ${data.url}`;
        }
        newLogs.push(`[ ${new Date().toLocaleTimeString()} ] 🚀 Déployé sur ${data.platform}: ${data.url}`);
      }

      // ── Connection event ──
      if (eventType === 'connected') {
        newLogs.push(`[ ${new Date().toLocaleTimeString()} ] 🔗 Flux temps réel connecté`);
      }

      // ── Handle DONE / FAILED ──
      let newStatus = prev.status;
      if (data.nextState === 'DONE') {
        newStatus = 'completed';
        newPipelineSteps.forEach(s => { if (s.status === 'active') s.status = 'done'; });
        const doneStep = newPipelineSteps.find(s => s.id === 'DONE');
        if (doneStep) doneStep.status = 'done';
        newLogs.push(`[ ${new Date().toLocaleTimeString()} ] ✅ Projet terminé avec succès!`);
      } else if (data.nextState === 'FAILED' || eventType === 'error_occurred') {
        newStatus = 'failed';
        const failedStep = newPipelineSteps.find(s => s.status === 'active');
        if (failedStep) failedStep.status = 'failed';
        newLogs.push(`[ ${new Date().toLocaleTimeString()} ] ❌ Échec: ${data.error || 'Erreur inconnue'}`);
      } else if (data.nextState && data.nextState !== prev.currentStep) {
        newStatus = 'processing';
      }

      return {
        ...prev,
        status: newStatus,
        progress: data.progress || prev.progress,
        logs: newLogs.slice(-150),
        currentStep: data.nextState || prev.currentStep,
        files: newFiles,
        pipelineSteps: newPipelineSteps,
        classification: newClassification,
        deployUrl: newDeployUrl,
        previewUrl: newPreviewUrl,
        mcpTools: newMcpTools,
        totalCost: newTotalCost,
      };
    });
  }, [lastEvent]);

  // Auto-scroll terminal
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
        files: [],
        pipelineSteps: PIPELINE_STEPS,
        mcpTools: [],
        totalCost: 0,
        startTime: Date.now(),
        logs: [...prev.logs, `[ ${new Date().toLocaleTimeString()} ] 🚀 Création du projet "${name}"...`],
      }));

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt, name }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Échec de la création');
      }

      const newJobId = data.projectId;
      setProjectState(prev => ({
        ...prev,
        jobId: newJobId,
        status: 'queued',
        logs: [...prev.logs, `[ ${new Date().toLocaleTimeString()} ] ✅ Projet en file: ${newJobId}`],
      }));
    } catch (error: any) {
      setProjectState(prev => ({
        ...prev,
        status: 'failed',
        logs: [...prev.logs, `[ ${new Date().toLocaleTimeString()} ] ❌ Erreur: ${error.message}`],
      }));
    }
  };

  const handleReset = () => {
    setProjectState({
      jobId: null, status: 'idle', progress: 0, logs: [],
      currentStep: 'INIT', files: [], pipelineSteps: PIPELINE_STEPS,
      classification: null, deployUrl: null, previewUrl: null,
      mcpTools: [], totalCost: 0, startTime: null,
    });
    setPrompt('');
    setProjectName('');
    setActiveTab('pipeline');
  };

  const elapsed = useMemo(() => {
    if (!projectState.startTime) return '0s';
    const ms = Date.now() - projectState.startTime;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  }, [projectState.startTime, projectState.logs.length]);

  const isProcessing = projectState.status === 'processing' || projectState.status === 'queued';

  return (
    <div className="project-generator">
      {/* ─── Header ─── */}
      <div className="pg-header">
        <h2 className="pg-title">🏗️ Générateur de Projets IA</h2>
        <div className="pg-meta">
          {isProcessing && (
            <>
              <span className="pg-timer">⏱️ {elapsed}</span>
              <span className="pg-cost">💰 ${projectState.totalCost.toFixed(4)}</span>
              <span className={`pg-connection ${connectionStatus}`}>
                {connectionStatus === 'connected' ? '🟢 Live' : connectionStatus === 'reconnecting' ? '🟡 Reconnect' : '🔴 Hors ligne'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ─── Prompt Input ─── */}
      {!isProcessing && projectState.status !== 'completed' && (
        <div className="pg-prompt-section">
          <div className="pg-input-group">
            <input
              type="text"
              className="pg-input pg-name-input"
              placeholder="Nom du projet (optionnel)"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>
          <div className="pg-input-group">
            <textarea
              className="pg-textarea"
              placeholder="Décrivez votre projet en détail... (ex: Créez un dashboard de vente en ligne avec React, des graphiques et une authentification)"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
            />
          </div>
          <button
            className="pg-submit-btn"
            onClick={handleSubmit}
            disabled={!prompt.trim() || prompt.length < 10}
          >
            🚀 Générer le projet
          </button>
        </div>
      )}

      {/* ─── Progress Bar ─── */}
      {isProcessing && (
        <div className="pg-progress-bar">
          <div className="pg-progress-fill" style={{ width: `${projectState.progress}%` }} />
          <span className="pg-progress-text">{projectState.progress}%</span>
        </div>
      )}

      {/* ─── Pipeline Steps Visual ─── */}
      {(isProcessing || projectState.status === 'completed' || projectState.status === 'failed') && (
        <div className="pg-pipeline">
          {projectState.pipelineSteps.map((step, idx) => (
            <div key={step.id} className={`pg-step pg-step-${step.status}`}>
              <div className="pg-step-icon">
                {step.status === 'done' ? '✅' : step.status === 'failed' ? '❌' : step.status === 'active' ? '🔄' : '⬜'}
              </div>
              <div className="pg-step-content">
                <div className="pg-step-label">{step.icon} {step.label}</div>
                {step.detail && <div className="pg-step-detail">{step.detail}</div>}
              </div>
              {idx < projectState.pipelineSteps.length - 1 && (
                <div className={`pg-step-arrow ${step.status === 'done' ? 'done' : ''}`}>→</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── Tab Navigation ─── */}
      {(isProcessing || projectState.status === 'completed') && projectState.files.length > 0 && (
        <div className="pg-tabs">
          <button
            className={`pg-tab ${activeTab === 'pipeline' ? 'active' : ''}`}
            onClick={() => setActiveTab('pipeline')}
          >
            📊 Pipeline
          </button>
          <button
            className={`pg-tab ${activeTab === 'files' ? 'active' : ''}`}
            onClick={() => setActiveTab('files')}
          >
            📄 Fichiers ({projectState.files.length})
          </button>
          <button
            className={`pg-tab ${activeTab === 'preview' ? 'active' : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            👁️ Prévisualisation
          </button>
        </div>
      )}

      {/* ─── Tab Content ─── */}
      {activeTab === 'files' && (
        <div className="pg-files-list">
          {projectState.files.map((file) => (
            <div key={file.path} className={`pg-file-item pg-file-${file.status}`}>
              <div className="pg-file-icon">
                {file.status === 'done' ? '✅' : file.status === 'generating' ? '🔄' : file.status === 'error' ? '❌' : '⏳'}
              </div>
              <div className="pg-file-info">
                <div className="pg-file-path">{file.path}</div>
                <div className="pg-file-meta">
                  <span className="pg-file-type">{file.type}</span>
                  {file.model && <span className="pg-file-model">🤖 {file.model}</span>}
                </div>
                {file.reasoning && <div className="pg-file-reasoning">{file.reasoning}</div>}
              </div>
            </div>
          ))}
          {/* Show pending files from classification */}
          {projectState.classification?.estimatedFiles && projectState.files.length < projectState.classification.estimatedFiles && (
            <div className="pg-file-item pg-file-pending">
              <div className="pg-file-icon">⏳</div>
              <div className="pg-file-info">
                <div className="pg-file-path">
                  {projectState.classification.estimatedFiles - projectState.files.length} fichier(s) restant(s)
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'preview' && projectState.previewUrl && (
        <div className="pg-preview-container">
          <div className="pg-preview-header">
            <span>👁️ Prévisualisation en direct</span>
            {projectState.deployUrl && (
              <a href={projectState.deployUrl} target="_blank" rel="noopener noreferrer" className="pg-deploy-link">
                🚀 Ouvrir en live
              </a>
            )}
          </div>
          <iframe
            src={projectState.previewUrl}
            className="pg-preview-iframe"
            title="Project Preview"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}

      {/* ─── MCP Tools ─── */}
      {projectState.mcpTools.length > 0 && (
        <div className="pg-mcp-section">
          <h4>🔧 Outils MCP</h4>
          <div className="pg-mcp-grid">
            {projectState.mcpTools.map((tool) => (
              <div key={tool.name} className={`pg-mcp-item pg-mcp-${tool.status}`}>
                <span className="pg-mcp-name">{tool.name}</span>
                <span className="pg-mcp-desc">{tool.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Terminal Logs ─── */}
      {projectState.logs.length > 0 && (
        <div className="pg-terminal" ref={terminalRef}>
          {projectState.logs.map((log, index) => (
            <div key={index} className="pg-terminal-line">{log}</div>
          ))}
          {isProcessing && <div className="pg-terminal-cursor">▊</div>}
        </div>
      )}

      {/* ─── Completed Actions ─── */}
      {(projectState.status === 'completed' || projectState.status === 'failed') && (
        <div className="pg-actions">
          {projectState.deployUrl && (
            <a href={projectState.deployUrl} target="_blank" rel="noopener noreferrer" className="pg-btn pg-btn-primary">
              🚀 Voir le projet déployé
            </a>
          )}
          <button className="pg-btn pg-btn-secondary" onClick={handleReset}>
            🔄 Nouveau projet
          </button>
        </div>
      )}
    </div>
  );
}