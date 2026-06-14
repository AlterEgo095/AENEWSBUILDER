import React, { useState, useEffect, useCallback } from 'react';
import './ProjectPreviewDashboard.css';

interface GeneratedFile {
  path: string;
  size: number;
  type: 'html' | 'css' | 'js' | 'json' | 'other';
  content?: string;
}

interface ProjectPreviewDashboardProps {
  projectId: string;
  token: string;
  projectName: string;
  onClose?: () => void;
}

const ProjectPreviewDashboard: React.FC<ProjectPreviewDashboardProps> = ({
  projectId,
  token,
  projectName,
  onClose
}) => {
  const [activeView, setActiveView] = useState<'preview' | 'code' | 'files' | 'info'>('preview');
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [searchQuery, setSearchQuery] = useState('');
  const [totalSize, setTotalSize] = useState(0);

  const API_BASE = '/api';

  // Load project files
  useEffect(() => {
    const fetchFiles = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${API_BASE}/preview/${projectId}/files`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          const fileList = data.files || data || [];
          setFiles(fileList);
          const total = fileList.reduce((sum: number, f: any) => sum + (f.size || 0), 0);
          setTotalSize(total);
          // Auto-select first HTML file
          const htmlFile = fileList.find((f: any) => f.path?.endsWith('.html'));
          if (htmlFile) setSelectedFile(htmlFile.path);
        }
      } catch {
        // Failed to fetch files - non-critical
      } finally {
        setIsLoading(false);
      }
    };
    if (projectId) fetchFiles();
  }, [projectId, token]);

  // Set preview URL
  useEffect(() => {
    setPreviewUrl(`${API_BASE}/preview/${projectId}/html?token=${token}`);
  }, [projectId, token]);

  // Load file content when selected
  const loadFileContent = useCallback(async (filePath: string) => {
    try {
      const response = await fetch(`${API_BASE}/preview/${projectId}/file/${filePath.replace(/^\//, '')}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const text = await response.text();
        setFileContent(text);
      }
    } catch {
      // Failed to load file - non-critical
      setFileContent('Erreur lors du chargement du fichier');
    }
  }, [projectId, token]);

  useEffect(() => {
    if (selectedFile) loadFileContent(selectedFile);
  }, [selectedFile, loadFileContent]);

  // Syntax highlighting (basic)
  const highlightCode = (code: string, type: string): string => {
    let highlighted = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    if (type === 'html') {
      highlighted = highlighted
        .replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="syn-tag">$2</span>')
        .replace(/([\w-]+)(=)/g, '<span class="syn-attr">$1</span>$2')
        .replace(/(["'])(.*?)\1/g, '<span class="syn-string">$1$2$1</span>')
        .replace(/(&lt;!--.*?--&gt;)/gs, '<span class="syn-comment">$1</span>');
    } else if (type === 'css') {
      highlighted = highlighted
        .replace(/([.#][\w-]+)(?=\s*[{,:])/g, '<span class="syn-selector">$1</span>')
        .replace(/([\w-]+)(?=\s*:)/g, '<span class="syn-prop">$1</span>')
        .replace(/(#[0-9a-fA-F]{3,8})/g, '<span class="syn-value">$1</span>')
        .replace(/(\d+\.?\d*)(px|em|rem|%|vh|vw|s|ms|deg)/g, '<span class="syn-value">$1$2</span>')
        .replace(/(\/\*.*?\*\/)/gs, '<span class="syn-comment">$1</span>');
    } else if (type === 'js') {
      highlighted = highlighted
        .replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this|try|catch|throw|switch|case|break|default|typeof|instanceof)\b/g, '<span class="syn-keyword">$1</span>')
        .replace(/\b(true|false|null|undefined|NaN|Infinity)\b/g, '<span class="syn-value">$1</span>')
        .replace(/(["'`])(.*?)\1/g, '<span class="syn-string">$1$2$1</span>')
        .replace(/(\/\/.*$)/gm, '<span class="syn-comment">$1</span>')
        .replace(/(\/\*.*?\*\/)/gs, '<span class="syn-comment">$1</span>')
        .replace(/\b(\d+\.?\d*)\b/g, '<span class="syn-value">$1</span>');
    }
    return highlighted;
  };

  const getFileType = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const typeMap: Record<string, string> = { html: 'html', htm: 'html', css: 'css', js: 'js', json: 'json', ts: 'js', tsx: 'js' };
    return typeMap[ext] || 'other';
  };

  const getFileIcon = (path: string): string => {
    const type = getFileType(path);
    const icons: Record<string, string> = { html: '\U0001f310', css: '\U0001f3a8', js: '\u26a1', json: '\U0001f4cb', other: '\U0001f4c4' };
    return icons[type] || '\U0001f4c4';
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  const filteredFiles = files.filter(f =>
    !searchQuery || f.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const previewWidths: Record<string, string> = {
    desktop: '100%',
    tablet: '768px',
    mobile: '375px'
  };

  return (
    <div className="ppd-container">
      {/* Header */}
      <div className="ppd-header">
        <div className="ppd-header-left">
          <div className="ppd-logo">\U0001f3d7\ufe0f</div>
          <div>
            <h2 className="ppd-title">{projectName || 'Projet'}</h2>
            <span className="ppd-subtitle">{files.length} fichiers \u00b7 {formatSize(totalSize)}</span>
          </div>
        </div>
        <div className="ppd-header-right">
          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="ppd-btn ppd-btn-outline">
            \U0001f517 Ouvrir dans un nouvel onglet
          </a>
          {onClose && (
            <button onClick={onClose} className="ppd-btn ppd-btn-ghost">\u2715</button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="ppd-nav">
        <button
          className={`ppd-nav-tab ${activeView === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveView('preview')}
        >
          <span className="ppd-nav-icon">\U0001f441\ufe0f</span> Pr\u00e9visualisation
        </button>
        <button
          className={`ppd-nav-tab ${activeView === 'code' ? 'active' : ''}`}
          onClick={() => setActiveView('code')}
        >
          <span className="ppd-nav-icon">\U0001f4bb</span> Code Source
        </button>
        <button
          className={`ppd-nav-tab ${activeView === 'files' ? 'active' : ''}`}
          onClick={() => setActiveView('files')}
        >
          <span className="ppd-nav-icon">\U0001f4c1</span> Fichiers
        </button>
        <button
          className={`ppd-nav-tab ${activeView === 'info' ? 'active' : ''}`}
          onClick={() => setActiveView('info')}
        >
          <span className="ppd-nav-icon">\u2139\ufe0f</span> D\u00e9tails
        </button>
      </div>

      {/* Content Area */}
      <div className="ppd-content">
        {/* PREVIEW VIEW */}
        {activeView === 'preview' && (
          <div className="ppd-preview-view">
            <div className="ppd-preview-toolbar">
              <span className="ppd-preview-label">Rendu en direct</span>
              <div className="ppd-responsive-toggles">
                <button
                  className={`ppd-res-btn ${previewMode === 'desktop' ? 'active' : ''}`}
                  onClick={() => setPreviewMode('desktop')}
                  title="Desktop"
                >\U0001f5a5\ufe0f</button>
                <button
                  className={`ppd-res-btn ${previewMode === 'tablet' ? 'active' : ''}`}
                  onClick={() => setPreviewMode('tablet')}
                  title="Tablette"
                >\U0001f4f1</button>
                <button
                  className={`ppd-res-btn ${previewMode === 'mobile' ? 'active' : ''}`}
                  onClick={() => setPreviewMode('mobile')}
                  title="Mobile"
                >\U0001f4f2</button>
              </div>
              <button
                className="ppd-btn ppd-btn-ghost ppd-refresh"
                onClick={() => {
                  const iframe = document.querySelector('.ppd-preview-frame') as HTMLIFrameElement;
                  if (iframe) iframe.src = previewUrl;
                }}
              >\U0001f504 Actualiser</button>
            </div>
            <div className="ppd-preview-frame-wrapper">
              <iframe
                className="ppd-preview-frame"
                src={previewUrl}
                style={{ width: previewWidths[previewMode], maxWidth: '100%' }}
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                title="Aper\u00e7u du projet"
              />
            </div>
          </div>
        )}

        {/* CODE VIEW */}
        {activeView === 'code' && (
          <div className="ppd-code-view">
            <div className="ppd-code-sidebar">
              <div className="ppd-code-search">
                <input
                  type="text"
                  placeholder="\U0001f50d Rechercher un fichier..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="ppd-search-input"
                />
              </div>
              <div className="ppd-file-tree">
                {filteredFiles.map(file => (
                  <button
                    key={file.path}
                    className={`ppd-file-item ${selectedFile === file.path ? 'active' : ''}`}
                    onClick={() => setSelectedFile(file.path)}
                  >
                    <span className="ppd-file-icon">{getFileIcon(file.path)}</span>
                    <span className="ppd-file-name">{file.path.split('/').pop()}</span>
                    <span className="ppd-file-size">{formatSize(file.size)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="ppd-code-main">
              {selectedFile ? (
                <>
                  <div className="ppd-code-header">
                    <span className="ppd-code-filename">{selectedFile}</span>
                    <span className="ppd-code-type-badge">{getFileType(selectedFile).toUpperCase()}</span>
                    <button
                      className="ppd-btn ppd-btn-ghost ppd-copy-btn"
                      onClick={() => navigator.clipboard.writeText(fileContent)}
                    >\U0001f4cb Copier</button>
                  </div>
                  <div className="ppd-code-body">
                    <pre className="ppd-code-pre">
                      <code dangerouslySetInnerHTML={{
                        __html: highlightCode(fileContent, getFileType(selectedFile))
                      }} />
                    </pre>
                  </div>
                </>
              ) : (
                <div className="ppd-empty-state">
                  <span className="ppd-empty-icon">\U0001f4c2</span>
                  <p>S\u00e9lectionnez un fichier pour voir son contenu</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FILES VIEW */}
        {activeView === 'files' && (
          <div className="ppd-files-view">
            <div className="ppd-files-grid">
              {files.map(file => (
                <div
                  key={file.path}
                  className="ppd-file-card"
                  onClick={() => { setSelectedFile(file.path); setActiveView('code'); }}
                >
                  <div className="ppd-file-card-icon">{getFileIcon(file.path)}</div>
                  <div className="ppd-file-card-info">
                    <span className="ppd-file-card-name">{file.path.split('/').pop()}</span>
                    <span className="ppd-file-card-path">{file.path}</span>
                  </div>
                  <div className="ppd-file-card-meta">
                    <span className="ppd-file-card-size">{formatSize(file.size)}</span>
                    <span className="ppd-file-card-type">{getFileType(file.path).toUpperCase()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* INFO VIEW */}
        {activeView === 'info' && (
          <div className="ppd-info-view">
            <div className="ppd-info-grid">
              <div className="ppd-info-card">
                <h3>\U0001f4ca Statistiques</h3>
                <div className="ppd-info-row">
                  <span>Total fichiers</span><strong>{files.length}</strong>
                </div>
                <div className="ppd-info-row">
                  <span>Taille totale</span><strong>{formatSize(totalSize)}</strong>
                </div>
                <div className="ppd-info-row">
                  <span>Fichiers HTML</span><strong>{files.filter(f => f.path.endsWith('.html')).length}</strong>
                </div>
                <div className="ppd-info-row">
                  <span>Fichiers CSS</span><strong>{files.filter(f => f.path.endsWith('.css')).length}</strong>
                </div>
                <div className="ppd-info-row">
                  <span>Fichiers JS</span><strong>{files.filter(f => f.path.endsWith('.js')).length}</strong>
                </div>
              </div>
              <div className="ppd-info-card">
                <h3>\U0001f6e0\ufe0f Technologies</h3>
                <div className="ppd-tech-tags">
                  {files.some(f => f.path.endsWith('.html')) && <span className="ppd-tag ppd-tag-html">HTML5</span>}
                  {files.some(f => f.path.endsWith('.css')) && <span className="ppd-tag ppd-tag-css">CSS3</span>}
                  {files.some(f => f.path.endsWith('.js')) && <span className="ppd-tag ppd-tag-js">JavaScript</span>}
                  {files.some(f => f.path.endsWith('.json')) && <span className="ppd-tag ppd-tag-json">JSON</span>}
                </div>
              </div>
              <div className="ppd-info-card ppd-info-card-wide">
                <h3>\U0001f4c1 Structure des fichiers</h3>
                <div className="ppd-tree">
                  {files.map(file => (
                    <div key={file.path} className="ppd-tree-item">
                      <span className="ppd-tree-icon">{getFileIcon(file.path)}</span>
                      <span className="ppd-tree-path">{file.path}</span>
                      <span className="ppd-tree-size">{formatSize(file.size)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="ppd-loading">
          <div className="ppd-spinner"></div>
          <p>Chargement du projet...</p>
        </div>
      )}
    </div>
  );
};

export default ProjectPreviewDashboard;
