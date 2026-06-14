import { useState, useEffect, useRef, useCallback } from 'react';

export interface SSEEvent {
  type: string;
  data: any;
  timestamp: Date;
  raw?: any;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export function useSSE(url: string | null, token?: string) {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (!url) {
      setConnectionStatus('disconnected');
      return;
    }

    setConnectionStatus(reconnectAttempts.current > 0 ? 'reconnecting' : 'connecting');

    // Append token to URL for SSE authentication (EventSource cannot send headers)
    let sseUrl = url;
    if (token && !url.includes('token=')) {
      sseUrl = `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
    }
    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnectionStatus('connected');
      reconnectAttempts.current = 0;
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const sseEvent: SSEEvent = {
          type: data.type || data.event || 'message',
          data: data.data || data,
          timestamp: new Date(),
          raw: data,
        };

        setLastEvent(sseEvent);
        setEvents((prev) => [...prev.slice(-200), sseEvent]); // Keep last 200 events
      } catch {
        // Silently ignore unparseable SSE events
      }
    };

    // Handle named events (history, etc.)
    eventSource.addEventListener('history', (event: any) => {
      try {
        const data = JSON.parse(event.data);
        if (data.events && Array.isArray(data.events)) {
          const historyEvents = data.events.map((e: any) => ({
            type: e.type || e.event || 'history',
            data: e.data || e,
            timestamp: new Date(e.timestamp || Date.now()),
            raw: e,
          }));
          setEvents((prev) => [...historyEvents, ...prev]);
        }
      } catch {
        // Silently ignore unparseable SSE history events
      }
    });

    eventSource.onerror = () => {
      eventSource.close();

      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        setConnectionStatus('reconnecting');
        reconnectTimeoutRef.current = setTimeout(() => connect(), delay);
      } else {
        setConnectionStatus('disconnected');
      }
    };
  }, [url, token]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      setConnectionStatus('disconnected');
    };
  }, [connect]);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setLastEvent(null);
  }, []);

  return {
    events,
    lastEvent,
    connectionStatus,
    clearEvents,
  };
}