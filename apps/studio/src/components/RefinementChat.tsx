import React, { useState, useRef, useEffect } from 'react';
import './RefinementChat.css';

interface RefinementChatProps {
  projectId: string;
  token: string;
  filesModified?: (files: Record<string, string>) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  filesModified?: string[];
  isStreaming?: boolean;
}

export function RefinementChat({ projectId, token, filesModified }: RefinementChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content: 'Je suis votre assistant de raffinement. Dites-moi ce que vous voulez modifier dans le projet généré. Par exemple :\n• "Change la couleur primaire en bleu"\n• "Ajoute une section témoignage"\n• "Rends le design plus moderne"\n• "Corrige le bug dans le formulaire"',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Add streaming assistant message
    const assistantId = `assistant-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    }]);

    try {
      const response = await fetch(`/api/refine/${projectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: userMessage.content,
          history: messages
            .filter(m => m.role !== 'system')
            .slice(-10)
            .map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await response.json();

      if (data.success) {
        const modifiedFilesList = data.filesModified || [];
        const explanation = data.explanation || 'Fichiers modifiés avec succès.';

        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content: explanation,
                isStreaming: false,
                filesModified: modifiedFilesList,
              }
            : m
        ));

        // Notify parent of file changes
        if (data.modifiedFiles && filesModified) {
          filesModified(data.modifiedFiles);
        }
      } else {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content: `❌ Erreur: ${data.error || data.details || 'Échec du raffinement'}`,
                isStreaming: false,
              }
            : m
        ));
      }
    } catch (error: any) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? {
              ...m,
              content: `❌ Erreur réseau: ${error.message}`,
              isStreaming: false,
            }
          : m
      ));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const quickActions = [
    { label: '🎨 Moderniser le design', message: 'Modernise le design avec un style plus contemporain, des animations subtiles et un meilleur espacement' },
    { label: '📱 Améliorer mobile', message: 'Améliore la responsivité mobile, ajoute des breakpoints et assure que tout fonctionne sur petit écran' },
    { label: '♿ Accessibilité', message: 'Améliore l\'accessibilité: ajoute des aria-labels, assure le contraste suffisant, navigation clavier' },
    { label: '⚡ Performance', message: 'Optimise les performances: lazy loading, minification, optimisation des images et du CSS' },
  ];

  return (
    <div className="refinement-chat">
      <div className="rc-header">
        <span className="rc-title">💬 Raffinement IA</span>
        <span className="rc-subtitle">Itérez sur votre projet en langage naturel</span>
      </div>

      <div className="rc-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`rc-message rc-${msg.role}`}>
            <div className="rc-avatar">
              {msg.role === 'user' ? '👤' : msg.role === 'system' ? '💡' : '🤖'}
            </div>
            <div className="rc-content">
              <div className="rc-text">{msg.content}</div>
              {msg.isStreaming && <span className="rc-cursor">▊</span>}
              {msg.filesModified && msg.filesModified.length > 0 && (
                <div className="rc-files-modified">
                  <span className="rc-files-label">Fichiers modifiés:</span>
                  {msg.filesModified.map(f => (
                    <span key={f} className="rc-file-badge">{f}</span>
                  ))}
                </div>
              )}
              <span className="rc-time">{msg.timestamp.toLocaleTimeString()}</span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      {messages.length <= 2 && (
        <div className="rc-quick-actions">
          {quickActions.map((action) => (
            <button
              key={action.label}
              className="rc-quick-btn"
              onClick={() => { setInput(action.message); }}
              disabled={isLoading}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      <div className="rc-input-area">
        <textarea
          ref={inputRef}
          className="rc-input"
          placeholder="Décrivez vos modifications... (Enter pour envoyer, Shift+Enter pour nouvelle ligne)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={isLoading}
        />
        <button
          className="rc-send-btn"
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
        >
          {isLoading ? '⏳' : '➤'}
        </button>
      </div>
    </div>
  );
}
