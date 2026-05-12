import React, { useState, useEffect, useCallback } from 'react';
import { AuthForm } from './components/AuthForm';
import { Dashboard } from './components/Dashboard';
import { AIChat } from './components/AIChat';
import { ProjectGenerator } from './components/ProjectGenerator';
import './App.css';

interface User {
  id: string;
  email: string;
  name: string;
}

export type ActiveTab = 'dashboard' | 'ai-chat' | 'create';

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('aenews:token'));
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('aenews:user');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleAuthSuccess = useCallback((newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('aenews:token', newToken);
    localStorage.setItem('aenews:user', JSON.stringify(newUser));
  }, []);

  const handleLogout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('aenews:token');
    localStorage.removeItem('aenews:user');
  }, []);

  if (!token || !user) {
    return <AuthForm onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="studio-app">
      {/* Sidebar */}
      <aside className={`studio-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">&#x26A1;</span>
            {sidebarOpen && <span className="logo-text">AENEWS STUDIO</span>}
          </div>
          <button className="toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? '\u25C0' : '\u25B6'}
          </button>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <span className="nav-icon">&#x1F4CA;</span>
            {sidebarOpen && <span className="nav-label">Dashboard</span>}
          </button>
          <button
            className={`nav-item ${activeTab === 'ai-chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai-chat')}
          >
            <span className="nav-icon">&#x1F916;</span>
            {sidebarOpen && <span className="nav-label">AI Assistant</span>}
          </button>
          <button
            className={`nav-item ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => setActiveTab('create')}
          >
            <span className="nav-icon">&#x1F680;</span>
            {sidebarOpen && <span className="nav-label">New Project</span>}
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <span className="user-avatar">{user.name?.[0]?.toUpperCase() || 'U'}</span>
            {sidebarOpen && (
              <div className="user-details">
                <span className="user-name">{user.name}</span>
                <span className="user-email">{user.email}</span>
              </div>
            )}
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Logout">
            &#x1F6AA;
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="studio-main">
        {activeTab === 'dashboard' && <Dashboard token={token} />}
        {activeTab === 'ai-chat' && <AIChat token={token} user={user} />}
        {activeTab === 'create' && <ProjectGenerator token={token} />}
      </main>
    </div>
  );
}

export default App;
