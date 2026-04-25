import React, { useState } from 'react';
import './JobManager.css';

interface JobManagerProps {
  jobs: string[];
  onResumeJob: (jobId: string) => void;
}

export const JobManager: React.FC<JobManagerProps> = ({ jobs, onResumeJob }) => {
  const [expanded, setExpanded] = useState(false);

  if (jobs.length === 0) {
    return null;
  }

  return (
    <div className="job-manager">
      <div
        className="job-manager-header"
        onClick={() => setExpanded(!expanded)}
      >
        <h3>Previous Jobs ({jobs.length})</h3>
        <span className="toggle-icon">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="job-list">
          {jobs.slice(-10).reverse().map((jobId, index) => (
            <div key={index} className="job-item">
              <span className="job-id">{jobId.substring(0, 12)}...</span>
              <button
                className="resume-btn"
                onClick={() => onResumeJob(jobId)}
              >
                Resume
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
