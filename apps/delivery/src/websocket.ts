// WebSocket Destination (Socket.IO)
// Self-hosted WebSocket server for real-time event delivery
// No rate limits, no batching needed - direct push to clients

import type { WebSocketDestination } from '@tada/shared';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';

// Socket.IO server (singleton)
let io: SocketIOServer | null = null;
let httpServer: ReturnType<typeof createServer> | null = null;

// Stats
let publishedCount = 0;
let connectedClients = 0;

/**
 * Initialize Socket.IO server
 */
export function initWebSocket(port: number = 5001): void {
  if (io) {
    return;
  }

  httpServer = createServer();
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
    },
  });

  io.on('connection', (socket) => {
    connectedClients++;
    console.log(`[WS] Client connected (${connectedClients} total)`);

    // Client joins a pipeline room
    socket.on('subscribe', (pipelineId: string) => {
      const room = `pipeline:${pipelineId}`;
      socket.join(room);
      console.log(`[WS] Client subscribed to ${room}`);
    });

    socket.on('unsubscribe', (pipelineId: string) => {
      const room = `pipeline:${pipelineId}`;
      socket.leave(room);
      console.log(`[WS] Client unsubscribed from ${room}`);
    });

    socket.on('disconnect', () => {
      connectedClients--;
      console.log(`[WS] Client disconnected (${connectedClients} total)`);
    });
  });

  httpServer.listen(port, () => {
    console.log(`[WS] Socket.IO server listening on port ${port}`);
  });
}

/**
 * Send event to all clients subscribed to a pipeline
 */
export async function sendToWebSocket(
  destination: WebSocketDestination,
  event: any,
  pipelineId: string
): Promise<boolean> {
  if (!destination.enabled) {
    return false;
  }

  if (!io) {
    console.error('[WS] Server not initialized. Call initWebSocket() first.');
    return false;
  }

  const room = `pipeline:${pipelineId}`;

  // Include metadata + transformed data
  const payload = {
    id: event.id,
    signature: event.signature,
    timestamp: event.timestamp,
    program: event.program,
    pipelineId: event.pipelineId,
    ...event.data,
  };

  // Direct push - no batching needed
  io.to(room).emit('event', payload);
  publishedCount++;

  return true;
}

/**
 * Close Socket.IO server
 */
export async function closeWebSocket(): Promise<void> {
  if (io) {
    io.close();
    io = null;
    console.log(`[WS] Server closed. Total published: ${publishedCount}`);
  }
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
}

/**
 * Get connection status
 */
export function getWebSocketStatus(): string {
  if (!io) {
    return 'not_initialized';
  }
  return 'running';
}

/**
 * Get stats
 */
export function getWebSocketStats(): { published: number; clients: number } {
  return {
    published: publishedCount,
    clients: connectedClients,
  };
}
