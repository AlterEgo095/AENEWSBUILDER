import React, { useEffect, useRef } from 'react';
import './Terminal.css';

interface TerminalProps {
  logs: string[];
  status: 'idle' | 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
}

export const Terminal: React.FC<TerminalProps> = ({ logs, status, progress }) => {
  const terminalRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const getStatusIcon = () => {
    switch (status) {
      case 'idle':
        return '⚪';
      case 'queued':
        return '🟡';
      case 'processing':
        return '🔵';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      default:
        return '⚪';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'idle':
        return 'Idle';
      case 'queued':
        return 'Queued';
      case 'processing':
        return `Processing (${progress}%)`;
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="terminal">
      <div className="terminal-header">
        <div className="terminal-title">
          <span className="terminal-icon">{getStatusIcon()}</span>
          <span>{getStatusText()}</span>
        </div>
        <div className="terminal-controls">
          <div className="control-dot red"></div>
          <div className="control-dot yellow"></div>
          <div className="control-dot green"></div>
        </div>
      </div>

      {status === 'processing' && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }}></div>
        </div>
      )}

      <div className="terminal-body" ref={terminalRef}>
        {logs.length === 0 ? (
          <div className="terminal-empty">
            <p>No logs yet. Submit a project to start.</p>
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="terminal-line">
              <span className="terminal-prompt">$</span>
              <span className="terminal-text">{log}</span>
            </div>
          ))
        )}
        {status === 'processing' && (
          <div className="terminal-line">
            <span className="terminal-prompt">$</span>
            <span className="terminal-text blinking-cursor">▊</span>
          </div>
        )}
      </div>
    </div>
  );
};
