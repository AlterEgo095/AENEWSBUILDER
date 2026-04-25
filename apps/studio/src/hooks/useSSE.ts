import { useState, useEffect, useRef } from 'react';

export interface SSEEvent {
  type: string;
  data: any;
  timestamp: Date;
}

export function useSSE(url: string | null) {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!url) {
      setConnectionStatus('disconnected');
      return;
    }

    setConnectionStatus('connecting');

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('SSE connection opened');
      setConnectionStatus('connected');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const sseEvent: SSEEvent = {
          type: data.type || 'message',
          data: data.data || data,
          timestamp: new Date(),
        };

        setEvents((prev) => [...prev, sseEvent]);
      } catch (error) {
        console.error('Failed to parse SSE event:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      setConnectionStatus('disconnected');
      eventSource.close();
    };

    return () => {
      eventSource.close();
      setConnectionStatus('disconnected');
    };
  }, [url]);

  const clearEvents = () => {
    setEvents([]);
  };

  return {
    events,
    connectionStatus,
    clearEvents,
  };
}
