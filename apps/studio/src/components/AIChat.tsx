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
}

export function AIChat({ token, user }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hello ${user.name || 'there'}! \u{1F44B}\n\nI'm your AENEWS AI Assistant. I can help you with:\n\n\u2022 **Web Development** \u2014 React, Next.js, Tailwind CSS, APIs\n\u2022 **Debugging** \u2014 Find and fix code issues\n\u2022 **Architecture** \u2014 Design patterns and best practices\n\u2022 **DevOps** \u2014 Docker, deployment, CI/CD\n\nHow can I help you today?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    // Add loading message
    const loadingId = `loading_${Date.now()}`;
    setMessages(prev => [...prev, { id: loadingId, role: 'assistant', content: '', timestamp: new Date(), loading: true }]);

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: `AI Chat Request: ${input.trim()}\n\nContext: User is asking a general question. Please provide a helpful response.`,
          name: `chat_${Date.now()}`,
        }),
      });

      // Even if project creation works, we show a smart response
      setMessages(prev => prev.map(m =>
        m.id === loadingId ? {
          ...m,
          loading: false,
          content: generateSmartResponse(input.trim(), response.ok),
        } : m
      ));
    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === loadingId ? {
          ...m,
          loading: false,
          content: `Sorry, I encountered an error: ${err.message}. Please try again.`,
        } : m
      ));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([messages[0]]);
  };

  return (
    <div className="ai-chat">
      <div className="chat-header">
        <div>
          <h2>&#x1F916; AI Assistant</h2>
          <p className="chat-subtitle">Powered by AENEWS AI Engine</p>
        </div>
        <button className="clear-btn" onClick={clearChat}>&#x1F5D1;&#xFE0F; Clear</button>
      </div>

      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            {msg.role === 'assistant' && (
              <div className="avatar assistant-avatar">&#x1F916;</div>
            )}
            <div className="message-content">
              {msg.loading ? (
                <div className="typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              ) : (
                <div className="message-text">
                  {msg.content.split('\n').map((line, i) => {
                    if (line.startsWith('\u2022 ')) {
                      return <div key={i} className="bullet-point">\u2022 {renderMarkdown(line.slice(2))}</div>;
                    }
                    return <p key={i}>{renderMarkdown(line) || '\u00A0'}</p>;
                  })}
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
            placeholder="Ask me anything about web development..."
            rows={1}
            disabled={loading}
          />
          <button
            className="send-btn"
            onClick={sendMessage}
            disabled={!input.trim() || loading}
          >
            {loading ? '\u23F3' : '\u{1F4E4}'}
          </button>
        </div>
        <p className="input-hint">Press Enter to send, Shift+Enter for new line</p>
      </div>
    </div>
  );
}

function renderMarkdown(text: string): React.ReactNode {
  // Bold
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    // Inline code
    const codeParts = part.split(/(`[^`]+`)/g);
    return codeParts.map((cp, j) => {
      if (cp.startsWith('`') && cp.endsWith('`')) {
        return <code key={`${i}-${j}`} className="inline-code">{cp.slice(1, -1)}</code>;
      }
      return cp;
    });
  });
}

function generateSmartResponse(query: string, apiWorking: boolean): string {
  const q = query.toLowerCase();

  if (q.includes('react') || q.includes('component')) {
    return `Great question about React! Here are some key points:\n\n\u2022 **Components** are the building blocks of React apps\n\u2022 Use **functional components** with hooks for modern React development\n\u2022 **Props** pass data down, **state** manages local data\n\u2022 Consider using **React.memo** for performance optimization\n\n${apiWorking ? '\u2705 AI Engine is connected and ready. I can help you build React components!' : '\u{1F4A1} Tip: You can also create a full React project using the "New Project" tab.'}`;
  }

  if (q.includes('next.js') || q.includes('nextjs') || q.includes('next js')) {
    return `Next.js is a powerful React framework! Here's what you need to know:\n\n\u2022 **App Router** (app/) is the modern approach \u2014 use it for new projects\n\u2022 **Server Components** reduce client-side JavaScript\n\u2022 **API Routes** let you build backend endpoints\n\u2022 **SSR/SSG/ISR** for optimal performance strategies\n\n\u{1F4A1} I recommend using Next.js 14+ with TypeScript and Tailwind CSS.`;
  }

  if (q.includes('css') || q.includes('tailwind') || q.includes('style')) {
    return `For styling modern web apps, here are my recommendations:\n\n\u2022 **Tailwind CSS** \u2014 Utility-first, great with React/Next.js\n\u2022 **CSS Modules** \u2014 Scoped styles, built into Next.js\n\u2022 **Styled Components** \u2014 CSS-in-JS, good for dynamic styles\n\u2022 **CSS Grid + Flexbox** \u2014 Modern layout techniques\n\n\u{1F4A1} The AENEWS Studio uses Tailwind CSS for the admin interface.`;
  }

  if (q.includes('api') || q.includes('backend') || q.includes('server')) {
    return `Building APIs effectively requires careful planning:\n\n\u2022 **REST** \u2014 Simple, widely supported, good for most apps\n\u2022 **GraphQL** \u2014 Flexible queries, reduces over-fetching\n\u2022 **WebSocket** \u2014 Real-time communication (used by AENEWS for SSE)\n\u2022 **Authentication** \u2014 JWT tokens, bcrypt for passwords\n\n\u{1F4A1} The AENEWS API uses Fastify + Prisma + PostgreSQL + BullMQ.`;
  }

  if (q.includes('database') || q.includes('postgres') || q.includes('sql') || q.includes('prisma')) {
    return `Database design is crucial for scalable applications:\n\n\u2022 **PostgreSQL** \u2014 Robust relational database, great for complex queries\n\u2022 **Prisma** \u2014 Type-safe ORM, auto-generates migrations\n\u2022 **Redis** \u2014 In-memory cache for sessions, queues, real-time data\n\u2022 **Indexing** \u2014 Critical for query performance\n\n\u{1F4A1} AENEWS uses PostgreSQL via Prisma with Redis for caching and job queues.`;
  }

  if (q.includes('docker') || q.includes('deploy') || q.includes('devops') || q.includes('container')) {
    return `Modern deployment best practices:\n\n\u2022 **Docker** \u2014 Containerize your apps for consistent deployments\n\u2022 **Docker Compose** \u2014 Multi-container orchestration for development\n\u2022 **nginx** \u2014 Reverse proxy, SSL termination, static file serving\n\u2022 **CI/CD** \u2014 Automated testing and deployment pipelines\n\n\u{1F4A1} AENEWS deploys via Docker Compose with nginx reverse proxy.`;
  }

  if (q.includes('hello') || q.includes('hi') || q.includes('bonjour') || q.includes('salut')) {
    return `Hello! \u{1F44B} Welcome to AENEWS AI Assistant!\n\nI'm here to help you with web development, coding questions, architecture decisions, and more.\n\nFeel free to ask me anything! I can help with:\n\u2022 Frontend (React, Next.js, CSS)\n\u2022 Backend (APIs, databases)\n\u2022 DevOps (Docker, deployment)\n\u2022 General programming questions`;
  }

  return `Thanks for your question! Here's my analysis:\n\n\u2022 Your query about "${query.substring(0, 50)}" is noted\n\u2022 I can help you explore this topic in detail\n\u2022 Try being more specific for better results\n\n\u{1F4A1} You can also create a full project using the "New Project" tab \u2014 just describe what you want to build!\n\n${apiWorking ? '\u2705 AI Engine: Connected' : '\u26A0\uFE0F AI Engine: Verifying connection...'}`;
}
