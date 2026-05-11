import React, { useState, useEffect } from 'react';
import { Terminal } from './components/Terminal';
import { Preview } from './components/Preview';
import { JobManager } from './components/JobManager';
import { AuthForm } from './components/AuthForm';
import { useSSE } from './hooks/useSSE';
import './App.css';

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

interface User {
  id: string;
  email: string;
  name: string;
}

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('aenews:token'));
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('aenews:user');
    return saved ? JSON.parse(saved) : null;
  });

  const [projectState, setProjectState] = useState<ProjectState>({
    jobId: null,
    status: 'idle',
    progress: 0,
    logs: [],
  });

  const [prompt, setPrompt] = useState('');
  const [savedJobs, setSavedJobs] = useState<string[]>([]);

  // Load saved jobs from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('aenews:jobs');
    if (saved) {
      setSavedJobs(JSON.parse(saved));
    }
  }, []);

  // SSE connection for real-time updates
  const { events } = useSSE(
    projectState.jobId ? `/api/stream/${projectState.jobId}` : null
  );

  useEffect(() => {
    if (events.length > 0) {
      const latestEvent = events[events.length - 1];

      setProjectState((prev) => ({
        ...prev,
        status: latestEvent.type === 'completed' ? 'completed' : 'processing',
        progress: latestEvent.data?.progress || prev.progress,
        logs: [...prev.logs, latestEvent.data?.message || JSON.stringify(latestEvent)],
        artifacts: latestEvent.data?.artifacts || prev.artifacts,
      }));
    }
  }, [events]);

  // Auth handlers
  const handleAuthSuccess = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('aenews:token', newToken);
    localStorage.setItem('aenews:user', JSON.stringify(newUser));
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('aenews:token');
    localStorage.removeItem('aenews:user');
    setSavedJobs([]);
    localStorage.removeItem('aenews:jobs');
  };

  // Show auth form if not logged in
  if (!token || !user) {
    return <AuthForm onAuthSuccess={handleAuthSuccess} />;
  }

  const handleSubmit = async () => {
    if (!prompt.trim()) return;

    try {
      const name = prompt.substring(0, 50).split(' ').slice(0, 3).join(' ');

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt,
          name,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to create project');
      }

      const newJobId = data.projectId;

      setProjectState({
        jobId: newJobId,
        status: 'queued',
        progress: 0,
        logs: [`Job ${newJobId} created and queued`],
      });

      // Save job ID
      const updatedJobs = [...savedJobs, newJobId];
      setSavedJobs(updatedJobs);
      localStorage.setItem('aenews:jobs', JSON.stringify(updatedJobs));
    } catch (error: any) {
      setProjectState((prev) => ({
        ...prev,
        status: 'failed',
        logs: [...prev.logs, `Error: ${error.message}`],
      }));

      // If 401, token expired
      if (error.message.includes('Unauthorized') || error.message.includes('401')) {
        handleLogout();
      }
    }
  };

  const handleResumeJob = (jobId: string) => {
    setProjectState({
      jobId,
      status: 'processing',
      progress: 0,
      logs: [`Resuming job ${jobId}`],
    });
  };

  return (
    <div className="app">
      <header className="app-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>AENEWS STUDIO</h1>
            <p>AI-Powered Code Generation Platform</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '14px', opacity: 0.8 }}>{user.email}</span>
            <button onClick={handleLogout} style={{
              padding: '6px 16px',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.1)',
              color: 'white',
              cursor: 'pointer',
              fontSize: '13px',
            }}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="app-layout">
        {/* Left Panel: Input & Job Manager */}
        <div className="left-panel">
          <div className="input-section">
            <h2>Create Project</h2>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your project... (e.g., 'Build a modern blog with React and Tailwind CSS')"
              rows={6}
            />
            <button onClick={handleSubmit} disabled={projectState.status === 'processing'}>
              {projectState.status === 'processing' ? 'Generating...' : 'Generate'}
            </button>
          </div>

          <JobManager jobs={savedJobs} onResumeJob={handleResumeJob} />
        </div>

        {/* Center Panel: Terminal */}
        <div className="center-panel">
          <Terminal
            logs={projectState.logs}
            status={projectState.status}
            progress={projectState.progress}
          />
        </div>

        {/* Right Panel: Preview */}
        <div className="right-panel">
          <Preview
            artifacts={projectState.artifacts}
            status={projectState.status}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
