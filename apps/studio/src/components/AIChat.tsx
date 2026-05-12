import React, { useState, useRef, useEffect, useCallback } from 'react';

interface AIChatProps {
  token: string;
  user: { id: string; email: string; name: string };
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  loading?: boolean;
  error?: boolean;
}

const WELCOME_MESSAGE = `Bonjour ${'USER_NAME'}. Je suis votre assistant IA de developpement AENEWS.

Je peux vous aider avec :

- **Developpement Web** - React, Next.js, TypeScript, TailwindCSS, APIs
- **Debug** - Identification et correction de problemes de code
- **Architecture** - Conception de systemes et bonnes pratiques
- **DevOps** - Docker, deploiement, CI/CD, monitoring
- **Bases de donnees** - PostgreSQL, Prisma, Redis, schemas

Pour creer un projet complet avec generation IA, utilisez l'onglet "Nouveau projet".

Comment puis-je vous aider ?`;

export function AIChat({ token, user }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: WELCOME_MESSAGE.replace('USER_NAME', user.name || 'developpeur'),
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    const loadingId = `loading_${Date.now()}`;

    setMessages(prev => [...prev, userMessage, {
      id: loadingId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      loading: true,
    }]);
    setInput('');
    setLoading(true);

    try {
      // Build conversation history (exclude welcome and loading messages)
      const history = messages
        .filter(m => m.id !== 'welcome' && !m.loading && !m.error)
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: trimmed,
          history,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erreur de communication avec l\'IA');
      }

      setMessages(prev => prev.map(m =>
        m.id === loadingId ? {
          ...m,
          loading: false,
          content: data.content,
          timestamp: new Date(),
        } : m
      ));
    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === loadingId ? {
          ...m,
          loading: false,
          error: true,
          content: `Erreur : ${err.message || 'Service IA indisponible. Veuillez reessayer.'}`,
          timestamp: new Date(),
        } : m
      ));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: WELCOME_MESSAGE.replace('USER_NAME', user.name || 'developpeur'),
      timestamp: new Date(),
    }]);
  };

  return (
    <div className="ai-chat">
      <div className="chat-header">
        <div>
          <h2>Assistant IA</h2>
          <p className="chat-subtitle">Moteur IA AENEWS &mdash; Multi-modele avec failover</p>
        </div>
        <div className="chat-header-actions">
          <button className="clear-btn" onClick={clearChat}>
            <span className="clear-icon">&#x21BB;</span> Nouvelle conversation
          </button>
        </div>
      </div>

      <div className="chat-messages" ref={chatContainerRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role} ${msg.error ? 'error' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="avatar assistant-avatar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/>
                  <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
                  <circle cx="9" cy="10" r="0.5" fill="currentColor"/>
                  <circle cx="15" cy="10" r="0.5" fill="currentColor"/>
                </svg>
              </div>
            )}
            <div className="message-content">
              {msg.loading ? (
                <div className="typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              ) : (
                <div className="message-text">
                  <MarkdownRenderer content={msg.content} />
                </div>
              )}
              <span className="message-time">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {msg.role === 'user' && (
              <div className="avatar user-avatar">{user.name?.[0]?.toUpperCase() || 'U'}</div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <div className="input-wrapper">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Decrivez votre besoin technique..."
            rows={1}
            disabled={loading}
          />
          <button
            className="send-btn"
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            title="Envoyer (Entree)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <p className="input-hint">
          Entree pour envoyer &middot; Shift+Entree pour un saut de ligne
        </p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Markdown Renderer — supports code blocks, bold, italic, inline code, lists
   ────────────────────────────────────────────── */
function MarkdownRenderer({ content }: { content: string }) {
  if (!content) return null;

  const elements: React.ReactNode[] = [];
  const lines = content.split('\n');
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block (```lang ... ```)
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim() || 'text';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <div key={key++} className="code-block">
          <div className="code-header">
            <span className="code-lang">{lang}</span>
            <CopyButton text={codeLines.join('\n')} />
          </div>
          <pre className="code-body">
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>
      );
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={key++} style={{ height: '0.5rem' }} />);
      i++;
      continue;
    }

    // Heading
    if (line.startsWith('### ')) {
      elements.push(<h4 key={key++} className="md-h4">{renderInline(line.slice(4))}</h4>);
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<h3 key={key++} className="md-h3">{renderInline(line.slice(3))}</h3>);
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(<h2 key={key++} className="md-h2">{renderInline(line.slice(2))}</h2>);
      i++;
      continue;
    }

    // Bullet list
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ') || line.trim().match(/^\d+\.\s/)) {
      const listItems: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* ') || lines[i].trim().match(/^\d+\.\s/))) {
        listItems.push(lines[i].trim().replace(/^[-*]\s|^\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ul key={key++} className="md-list">
          {listItems.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (line.trim().match(/^\d+\.\s/)) {
      const numItems: string[] = [];
      while (i < lines.length && lines[i].trim().match(/^\d+\.\s/)) {
        numItems.push(lines[i].trim().replace(/^\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ol key={key++} className="md-list">
          {numItems.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Regular paragraph
    elements.push(<p key={key++} className="md-p">{renderInline(line)}</p>);
    i++;
  }

  return <>{elements}</>;
}

/* Inline markdown: bold, italic, inline code, links */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Bold + italic + code pattern
  const regex = /(\*\*\*.*?\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];

    if (token.startsWith('```') || token.startsWith('***')) {
      parts.push(<strong key={parts.length}><em>{token.slice(3, -3)}</em></strong>);
    } else if (token.startsWith('**')) {
      parts.push(<strong key={parts.length}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      parts.push(<em key={parts.length}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`')) {
      parts.push(<code key={parts.length} className="inline-code">{token.slice(1, -1)}</code>);
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        parts.push(
          <a key={parts.length} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="md-link">
            {linkMatch[1]}
          </a>
        );
      }
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

/* Copy to clipboard button */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button className="copy-btn" onClick={handleCopy} title="Copier">
      {copied ? 'Copie !' : 'Copier'}
    </button>
  );
}

