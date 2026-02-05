'use client';

import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Card, CardHeader, CardContent } from './card';
import { Badge } from './badge';

interface LiveEventsProps {
  pipelineId: string;
  enabled: boolean;
}

interface EventMessage {
  id: string;
  timestamp: number;
  data: Record<string, unknown>;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:5001';

export function LiveEvents({ pipelineId, enabled }: LiveEventsProps) {
  const [events, setEvents] = useState<EventMessage[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [isListening, setIsListening] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const pausedRef = useRef(false);
  const bufferRef = useRef<EventMessage[]>([]);
  const [paused, setPaused] = useState(false);

  const roomName = `pipeline:${pipelineId}`;

  const connect = () => {
    if (socketRef.current) {
      return;
    }

    setStatus('connecting');

    const socket = io(WS_URL, {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      setStatus('connected');
      // Join the pipeline room
      socket.emit('subscribe', pipelineId);
    });

    socket.on('event', (payload: Record<string, unknown>) => {
      const newEvent: EventMessage = {
        id: (payload.id as string) || `${Date.now()}-${Math.random()}`,
        timestamp: (payload.timestamp as number) || Date.now(),
        data: payload,
      };

      if (pausedRef.current) {
        bufferRef.current.push(newEvent);
        return;
      }

      setEvents((prev) => {
        const updated = [newEvent, ...prev];
        return updated.slice(0, 500);
      });
    });

    socket.on('connect_error', () => {
      setStatus('error');
    });

    socket.on('disconnect', () => {
      setStatus('disconnected');
    });

    socketRef.current = socket;
    setIsListening(true);
  };

  const disconnect = () => {
    if (socketRef.current) {
      socketRef.current.emit('unsubscribe', pipelineId);
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsListening(false);
    setStatus('disconnected');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  const getStatusBadge = () => {
    switch (status) {
      case 'connected':
        return <Badge variant="success">Connected</Badge>;
      case 'connecting':
        return <Badge variant="warning">Connecting...</Badge>;
      case 'error':
        return <Badge variant="error">Error</Badge>;
      default:
        return <Badge>Disconnected</Badge>;
    }
  };

  const handlePause = () => {
    pausedRef.current = true;
    setPaused(true);
  };

  const handleResume = () => {
    pausedRef.current = false;
    // Flush buffered events
    if (bufferRef.current.length > 0) {
      setEvents((prev) => {
        const updated = [...bufferRef.current.reverse(), ...prev];
        return updated.slice(0, 500);
      });
      bufferRef.current = [];
    }
    setPaused(false);
  };

  const clearEvents = () => {
    setEvents([]);
  };

  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Live Events</h2>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-[var(--muted)]">
            WebSocket destination is not enabled for this pipeline.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">Live Events</h2>
          {getStatusBadge()}
          {paused && <Badge variant="warning">Paused</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {events.length > 0 && (
            <button
              onClick={clearEvents}
              className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
            >
              Clear
            </button>
          )}
          {isListening ? (
            <button
              onClick={disconnect}
              className="px-3 py-1 text-sm bg-[var(--error)]/10 text-[var(--error)] rounded-lg hover:bg-[var(--error)]/20 cursor-pointer"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={connect}
              className="px-3 py-1 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 cursor-pointer"
            >
              Start Listening
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-xs text-[var(--muted)] mb-3">
          Room: <code className="bg-[var(--border)]/30 px-1 rounded">{roomName}</code>
        </div>

        {events.length === 0 ? (
          <div className="text-sm text-[var(--muted)] text-center py-8">
            {isListening ? 'Waiting for events...' : 'Click "Start Listening" to receive live events'}
          </div>
        ) : (
          <div
            className="space-y-2 max-h-96 overflow-y-auto"
            onMouseEnter={handlePause}
            onMouseLeave={handleResume}
          >
            {events.map((event) => (
              <div
                key={event.id}
                className="bg-[var(--border)]/30 rounded-lg p-3 text-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--muted)]">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                    {typeof event.data.signature === 'string' && (
                      <a
                        href={`https://solscan.io/tx/${event.data.signature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[var(--accent)] hover:underline font-mono"
                        title="View on Solscan"
                      >
                        {(event.data.signature as string).slice(0, 8)}...
                      </a>
                    )}
                  </div>
                  {typeof event.data.eventName === 'string' && (
                    <Badge variant="default">{event.data.eventName}</Badge>
                  )}
                </div>
                <pre className="text-xs overflow-x-auto">
                  {JSON.stringify(event.data, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
