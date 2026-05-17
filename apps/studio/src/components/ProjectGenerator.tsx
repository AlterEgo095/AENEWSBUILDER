import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSSE } from '../hooks/useSSE';
import { RefinementChat } from './RefinementChat';
import ProjectPreviewDashboard from './ProjectPreviewDashboard';
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
  livePreviewUrl: string | null;
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
  websearch: 'Recherche web temps réel',
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
    classification: null, deployUrl: null, previewUrl: null, livePreviewUrl: null,
    mcpTools: [], totalCost: 0, startTime: null,
  });
  const [prompt, setPrompt] = useState('');
  const [projectName, setProjectName] = useState('');
  const [activeTab, setActiveTab] = useState<'pipeline' | 'files' | 'preview' | 'chat'>('pipeline');
  const terminalRef = useRef<HTMLDivElement>(null);

  const { events, lastEvent, connectionStatus } = useSSE(
    projectState.jobId ? `/api/stream/${projectState.jobId}` : null,
    token
  );

  // Process SSE events (same as before but with livePreview support)
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
      let newLivePreviewUrl = prev.livePreviewUrl;
      let newMcpTools = [...prev.mcpTools];
      let newTotalCost = prev.totalCost;

      if (data.nextState || data.state) {
        const targetStep = data.nextState || data.state;
        const stepIndex = newPipelineSteps.findIndex(s => s.id === targetStep);
        for (let i = 0; i < newPipelineSteps.length; i++) {
          if (i < (stepIndex >= 0 ? stepIndex : 999)) {
            if (newPipelineSteps[i].status === 'active') newPipelineSteps[i].status = 'done';
          }
        }
        if (stepIndex >= 0 && newPipelineSteps[stepIndex].status !== 'done') {
          newPipelineSteps[stepIndex].status = 'active';
        }
        const step = PIPELINE_STEPS.find(s => s.id === targetStep);
        if (step) newLogs.push(`[ ${new Date().toLocaleTimeString()} ] ➡️ ${step.icon} ${step.label}`);
      }

      if (eventType === 'file_generated' && data.filePath) {
        const existingIdx = newFiles.findIndex(f => f.path === data.filePath);
        const fileInfo: FileInfo = { path: data.filePath, type: data.fileType || 'other', model: data.model || 'unknown', reasoning: data.reasoning || '', status: 'done' };
        if (existingIdx >= 0) newFiles[existingIdx] = fileInfo; else newFiles.push(fileInfo);
        const genStep = newPipelineSteps.find(s => s.id === 'GENERATE');
        if (genStep) { genStep.detail = `${data.filesGenerated}/${data.totalFiles} fichiers`; genStep.status = 'active'; }
        newTotalCost += data.estimatedCost || 0;
        newLogs.push(`[ ${new Date().toLocaleTimeString()} ] 📄 ${data.filePath} (${data.model}, ${data.progress}%)`);
        if (prev.jobId && !newPreviewUrl) newPreviewUrl = `/api/preview/${prev.jobId}/html`;
      }

      if (eventType === 'file_refined' && data.filePath) {
        const existingIdx = newFiles.findIndex(f => f.path === data.filePath);
        if (existingIdx >= 0) newFiles[existingIdx] = { ...newFiles[existingIdx], status: 'done' };
        newLogs.push(`[ ${new Date().toLocaleTimeString()} ] ✏️ Raffiné: ${data.filePath}`);
      }

      if (eventType === 'analysis_complete' && data.classification) {
        newClassification = data.classification;
        const analysisStep = newPipelineSteps.find(s => s.id === 'ANALYSIS');
        if (analysisStep) { analysisStep.status = 'done'; analysisStep.detail = `${data.classification.type} · ${data.classification.complexity}`; }
        if (data.mcpTools) {
          newMcpTools = data.mcpTools.map((t: any) => ({
            name: typeof t === 'string' ? t : t.name,
            status: 'pending' as const,
            description: MCP_TOOL_INFO[typeof t === 'string' ? t : t.name] || '',
          }));
        }
        newLogs.push(`[ ${new Date().toLocaleTimeString()} ] 🧠 Classifié: ${data.classification.type} (${data.classification.complexity}), ${data.fileCount} fichiers`);
      }

      if (eventType === 'security_scan_complete') {
        const testStep = newPipelineSteps.find(s => s.id === 'TEST');
        if (testStep) testStep.detail = data.passed ? `Score: ${data.score}/100 ✅` : `Score: ${data.score}/100 ❌`;
        newLogs.push(`[ ${new Date().toLocaleTimeString()} ] 🛡️ Sécurité: ${data.passed ? 'PASSÉ' : 'ÉCHOUÉ'} (${data.score}/100)`);
      }

      if (eventType === 'deploy_complete' && data.url) {
        newDeployUrl = data.url;
        const deployStep = newPipelineSteps.find(s => s.id === 'DEPLOY');
        if (deployStep) { deployStep.status = 'done'; deployStep.detail = `${data.platform}: ${data.url}`; }
        newLogs.push(`[ ${new Date().toLocaleTimeString()} ] 🚀 Déployé: ${data.url}`);
      }

      if (eventType === 'connected') newLogs.push(`[ ${new Date().toLocaleTimeString()} ] 🔗 Flux temps réel connecté`);

      let newStatus = prev.status;
      if (data.nextState === 'DONE') {
        newStatus = 'completed';
        newPipelineSteps.forEach(s => { if (s.status === 'active') s.status = 'done'; });
        const doneStep = newPipelineSteps.find(s => s.id === 'DONE');
        if (doneStep) doneStep.status = 'done';
        newLogs.push(`[ ${new Date().toLocaleTimeString()} ] ✅ Projet terminé!`);
        // Auto-switch to preview tab when done
        newPreviewUrl = prev.jobId ? `/api/preview/${prev.jobId}/html` : null;
      } else if (data.nextState === 'FAILED' || eventType === 'error_occurred') {
        newStatus = 'failed';
        const failedStep = newPipelineSteps.find(s => s.status === 'active');
        if (failedStep) failedStep.status = 'failed';
        newLogs.push(`[ ${new Date().toLocaleTimeString()} ] ❌ Échec: ${data.error || 'Erreur inconnue'}`);
      } else if (data.nextState && data.nextState !== prev.currentStep) {
        newStatus = 'processing';
      }

      return {
        ...prev, status: newStatus, progress: data.progress || prev.progress,
        logs: newLogs.slice(-150), currentStep: data.nextState || prev.currentStep,
        files: newFiles, pipelineSteps: newPipelineSteps, classification: newClassification,
        deployUrl: newDeployUrl, previewUrl: newPreviewUrl, livePreviewUrl: newLivePreviewUrl,
        mcpTools: newMcpTools, totalCost: newTotalCost,
      };
    });
  }, [lastEvent]);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [projectState.logs]);

  // Auto-switch to preview when completed
  useEffect(() => {
    if (projectState.status === 'completed' && activeTab === 'pipeline') {
      setActiveTab('preview');
    }
  }, [projectState.status]);

  // Hydrate files from Preview API when project completes
  useEffect(() => {
    if (projectState.jobId && token && projectState.status === 'completed' && projectState.files.length === 0) {
      fetch(`/api/preview/${projectState.jobId}/files`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          const fileList = data.files || data || [];
          if (fileList.length > 0) {
            setProjectState(prev => ({
              ...prev,
              files: fileList.map((f: any) => ({
                path: f.path || f.name,
                type: f.type || 'other',
                model: f.model || 'unknown',
                reasoning: f.reasoning || '',
                status: 'done' as const,
              })),
            }));
          }
        })
        .catch(err => console.error('Failed to hydrate files:', err));
    }
  }, [projectState.jobId, token, projectState.status, projectState.files.length]);

  const handleStartLivePreview = async () => {
    if (!projectState.jobId) return;
    try {
      const response = await fetch(`/api/preview/${projectState.jobId}/start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (data.success) {
        setProjectState(prev => ({ ...prev, livePreviewUrl: data.directUrl }));
        setActiveTab('preview');
      }
    } catch (error) {
      console.error('Failed to start live preview:', error);
    }
  };

  const handleRefinementFilesModified = (modifiedFiles: Record<string, string>) => {
    // Update the file list to reflect refinements
    setProjectState(prev => {
      const updatedFiles = [...prev.files];
      for (const path of Object.keys(modifiedFiles)) {
        const idx = updatedFiles.findIndex(f => f.path === path);
        if (idx >= 0) {
          updatedFiles[idx] = { ...updatedFiles[idx], status: 'done' };
        } else {
          updatedFiles.push({ path, type: 'refined', model: 'refinement', reasoning: 'Modified via chat', status: 'done' });
        }
      }
      return { ...prev, files: updatedFiles };
    });
    // Refresh live preview if running
    if (projectState.livePreviewUrl) {
      handleStartLivePreview();
    }
  };

  const handleSubmit = async () => {
    if (!prompt.trim() || projectState.status === 'processing') return;
    const name = projectName.trim() || prompt.substring(0, 50).split(' ').slice(0, 3).join(' ');
    try {
      setProjectState(prev => ({
        ...prev, status: 'queued', currentStep: 'INIT', files: [],
        pipelineSteps: PIPELINE_STEPS, mcpTools: [], totalCost: 0, startTime: Date.now(),
        logs: [...prev.logs, `[ ${new Date().toLocaleTimeString()} ] 🚀 Création: "${name}"...`],
      }));
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ prompt, name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Échec');
      setProjectState(prev => ({
        ...prev, jobId: data.projectId, status: 'queued',
        logs: [...prev.logs, `[ ${new Date().toLocaleTimeString()} ] ✅ En file: ${data.projectId}`],
      }));
    } catch (error: any) {
      setProjectState(prev => ({
        ...prev, status: 'failed',
        logs: [...prev.logs, `[ ${new Date().toLocaleTimeString()} ] ❌ ${error.message}`],
      }));
    }
  };

  const handleReset = () => {
    setProjectState({
      jobId: null, status: 'idle', progress: 0, logs: [],
      currentStep: 'INIT', files: [], pipelineSteps: PIPELINE_STEPS,
      classification: null, deployUrl: null, previewUrl: null, livePreviewUrl: null,
      mcpTools: [], totalCost: 0, startTime: null,
    });
    setPrompt(''); setProjectName(''); setActiveTab('pipeline');
  };

  const elapsed = useMemo(() => {
    if (!projectState.startTime) return '0s';
    const ms = Date.now() - projectState.startTime;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  }, [projectState.startTime, projectState.logs.length]);

  const isProcessing = projectState.status === 'processing' || projectState.status === 'queued';
  const isCompleted = projectState.status === 'completed';

  return (
    <div className="project-generator">
      {/* Header */}
      <div className="pg-header">
        <h2 className="pg-title">🏗️ AENEWS Builder — Agent L4</h2>
        <div className="pg-meta">
          {isProcessing && (
            <>
              <span className="pg-timer">⏱️ {elapsed}</span>
              <span className="pg-cost">💰 ${projectState.totalCost.toFixed(4)}</span>
              <span className={`pg-connection ${connectionStatus}`}>
                {connectionStatus === 'connected' ? '🟢 Live' : connectionStatus === 'reconnecting' ? '🟡' : '🔴'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Prompt Input */}
      {!isProcessing && !isCompleted && (
        <div className="pg-prompt-section">
          <input type="text" className="pg-input pg-name-input" placeholder="Nom du projet (optionnel)" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          <textarea className="pg-textarea" placeholder="Décrivez votre projet... (ex: Dashboard e-commerce avec React, graphiques temps réel, auth)" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} />
          <button className="pg-submit-btn" onClick={handleSubmit} disabled={!prompt.trim() || prompt.length < 10}>🚀 Générer le projet</button>
        </div>
      )}

      {/* Progress Bar */}
      {isProcessing && (
        <div className="pg-progress-bar">
          <div className="pg-progress-fill" style={{ width: `${projectState.progress}%` }} />
          <span className="pg-progress-text">{projectState.progress}%</span>
        </div>
      )}

      {/* Pipeline Steps */}
      {(isProcessing || isCompleted || projectState.status === 'failed') && (
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

      {/* Tab Navigation — includes Chat tab when completed */}
      {(isProcessing || isCompleted) && (
        <div className="pg-tabs">
          <button className={`pg-tab ${activeTab === 'pipeline' ? 'active' : ''}`} onClick={() => setActiveTab('pipeline')}>📊 Pipeline</button>
          <button className={`pg-tab ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>📄 Fichiers ({projectState.files.length})</button>
          <button className={`pg-tab ${activeTab === 'preview' ? 'active' : ''}`} onClick={() => setActiveTab('preview')}>👁️ Preview</button>
          {isCompleted && (
            <button className={`pg-tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>💬 Raffiner</button>
          )}
        </div>
      )}

      {/* Tab Content: Files */}
      {activeTab === 'files' && (
        <div className="pg-files-list">
          {projectState.files.map((file) => (
            <div key={file.path} className={`pg-file-item pg-file-${file.status}`}>
              <div className="pg-file-icon">{file.status === 'done' ? '✅' : '🔄'}</div>
              <div className="pg-file-info">
                <div className="pg-file-path">{file.path}</div>
                <div className="pg-file-meta">
                  <span className="pg-file-type">{file.type}</span>
                  {file.model && <span className="pg-file-model">🤖 {file.model}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab Content: Preview — Full Dashboard */}
      {activeTab === 'preview' && projectState.jobId && (
        <ProjectPreviewDashboard
          projectId={projectState.jobId}
          token={token}
          projectName={projectName || 'Projet'}
        />
      )}

      {/* Tab Content: Chat Refinement */}
      {activeTab === 'chat' && projectState.jobId && isCompleted && (
        <RefinementChat
          projectId={projectState.jobId}
          token={token}
          filesModified={handleRefinementFilesModified}
        />
      )}

      {/* MCP Tools */}
      {projectState.mcpTools.length > 0 && (
        <div className="pg-mcp-section">
          <h4>🔧 Outils MCP ({projectState.mcpTools.length})</h4>
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

      {/* Terminal */}
      {projectState.logs.length > 0 && (
        <div className="pg-terminal" ref={terminalRef}>
          {projectState.logs.map((log, i) => <div key={i} className="pg-terminal-line">{log}</div>)}
          {isProcessing && <div className="pg-terminal-cursor">▊</div>}
        </div>
      )}

      {/* Actions */}
      {(isCompleted || projectState.status === 'failed') && (
        <div className="pg-actions">
          {projectState.deployUrl && (
            <a href={projectState.deployUrl} target="_blank" rel="noopener noreferrer" className="pg-btn pg-btn-primary">🚀 Projet déployé</a>
          )}
          <button className="pg-btn pg-btn-secondary" onClick={handleReset}>🔄 Nouveau projet</button>
        </div>
      )}
    </div>
  );
}
