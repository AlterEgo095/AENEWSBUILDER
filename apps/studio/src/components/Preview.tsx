import React from 'react';
import './Preview.css';

interface PreviewProps {
  artifacts?: {
    files: string[];
    preview: string;
    deployUrl?: string;
  };
  status: 'idle' | 'queued' | 'processing' | 'completed' | 'failed';
}

export const Preview: React.FC<PreviewProps> = ({ artifacts, status }) => {
  if (!artifacts && status !== 'completed') {
    return (
      <div className="preview">
        <div className="preview-header">
          <h3>Preview</h3>
        </div>
        <div className="preview-empty">
          <p>Preview will appear when generation is complete.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="preview">
      <div className="preview-header">
        <h3>Preview</h3>
        {artifacts?.deployUrl && (
          <a
            href={artifacts.deployUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="deploy-link"
          >
            🚀 Open Live
          </a>
        )}
      </div>

      {artifacts?.preview ? (
        <div className="preview-iframe-container">
          <iframe
            src={artifacts.preview}
            title="Project Preview"
            className="preview-iframe"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      ) : (
        <div className="preview-files">
          <h4>Generated Files</h4>
          <ul className="file-list">
            {artifacts?.files.map((file, index) => (
              <li key={index} className="file-item">
                <span className="file-icon">📄</span>
                <span className="file-name">{file}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
