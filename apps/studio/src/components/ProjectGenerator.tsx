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
  artifacts?: {
    files: string[];
    preview: string;
    deployUrl?: string;
  };
}

export function ProjectGenerator({ token }: ProjectGeneratorProps) {
  const [projectState, setProjectState] = useState<ProjectState>({
    jobId: null, status: 'idle', progress: 0, logs: [],
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
      setProjectState((prev) => ({
        ...prev,
        status: latestEvent.type === 'completed' ? 'completed' :
                latestEvent.type === 'failed' ? 'failed' : 'processing',
        progress: latestEvent.data?.progress || prev.progress,
        logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] ${latestEvent.data?.message || JSON.stringify(latestEvent)}`],
        artifacts: latestEvent.data?.artifacts || prev.artifacts,
      }));
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
        logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] Creating project "${name}"...`],
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
        throw new Error(data.message || data.error || 'Failed to create project');
      }

      const newJobId = data.projectId;
      setProjectState(prev => ({
        ...prev,
        jobId: newJobId,
        status: 'queued',
        logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] \u2705 Project queued: ${newJobId}`],
      }));
    } catch (error: any) {
      setProjectState(prev => ({
        ...prev,
        status: 'failed',
        logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] \u274C Error: ${error.message}`],
      }));
    }
  };

  const handleReset = () => {
    setProjectState({ jobId: null, status: 'idle', progress: 0, logs: [] });
    setPrompt('');
    setProjectName('');
  };

  return (
    <div className="project-generator">
      <div className="generator-header">
        <div>
          <h1>&#x1F680; Create New Project</h1>
          <p className="generator-subtitle">Describe your project and let AI build it for you</p>
        </div>
        {(projectState.status === 'completed' || projectState.status === 'failed') && (
          <button className="new-project-btn" onClick={handleReset}>+ New Project</button>
        )}
      </div>

      {(projectState.status === 'idle' || projectState.status === 'queued') && (
        <div className="generator-form">
          <div className="form-group">
            <label>Project Name (optional)</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g., My Awesome Blog"
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>Project Description *</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your project in detail... (e.g., 'Build a modern blog with React, Tailwind CSS, and a REST API backend with authentication')"
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
              {projectState.status === 'queued' ? '\u23F3 Queued...' : '\u{1F680} Generate Project'}
            </button>
          </div>
          <p className="form-hint">Minimum 10 characters. Be specific for better results.</p>
        </div>
      )}

      {/* Terminal/Log Output */}
      {projectState.logs.length > 0 && (
        <div className="generator-terminal">
          <div className="terminal-header">
            <div className="terminal-title">
              <span className={`status-dot ${projectState.status}`} />
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

          {projectState.status === 'processing' && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${projectState.progress}%` }} />
            </div>
          )}

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
                <span className="log-text blink">&#x258A;</span>
              </div>
            )}
          </div>

          {/* Preview / Result */}
          {projectState.artifacts && (
            <div className="generator-result">
              {projectState.artifacts.deployUrl && (
                <a href={projectState.artifacts.deployUrl} target="_blank" rel="noopener noreferrer" className="view-live-btn">
                  &#x1F680; View Live Application
                </a>
              )}
              {projectState.artifacts.files?.length > 0 && (
                <div className="generated-files">
                  <h4>Generated Files ({projectState.artifacts.files.length})</h4>
                  <div className="file-grid">
                    {projectState.artifacts.files.map((file, i) => (
                      <span key={i} className="file-tag">&#x1F4C4; {file}</span>
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
