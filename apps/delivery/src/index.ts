// Delivery Service
// Fans out transformed events to all enabled destinations
// MVP: Direct integration with Pipeline Engine (no Kinesis yet)

import type { Pipeline, Destinations } from '@tada/shared';
import { sendToDiscord } from './discord.js';
import { sendToTelegram } from './telegram.js';
import { sendToWebhook } from './webhook.js';
import { sendToWebSocket, initWebSocket, closeWebSocket, getWebSocketStatus } from './websocket.js';

/**
 * Transformed event from Pipeline Engine
 */
export interface TransformedEvent {
  id: string;
  pipelineId: string;
  program: string;
  timestamp: number;
  signature: string;
  data: Record<string, any>;
}

/**
 * Delivery result
 */
export interface DeliveryResult {
  destination: string;
  success: boolean;
  error?: string;
}

// Stats
const stats = {
  delivered: 0,
  failed: 0,
  byDestination: {
    discord: { success: 0, failed: 0 },
    telegram: { success: 0, failed: 0 },
    webhook: { success: 0, failed: 0 },
    websocket: { success: 0, failed: 0 },
  } as Record<string, { success: number; failed: number }>,
};

/**
 * Initialize the Delivery Service
 */
export function initDeliveryService(): void {
  const port = parseInt(process.env.SOCKETIO_PORT || '5001', 10);
  initWebSocket(port);
  console.log('[Delivery] Socket.IO server initialized');
}

/**
 * Deliver an event to all enabled destinations for a pipeline
 */
export async function deliverEvent(
  event: TransformedEvent,
  destinations: Destinations
): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];
  const metadata = {
    pipelineId: event.pipelineId,
    eventId: event.id,
    timestamp: event.timestamp,
  };

  // Deliver to all enabled destinations in parallel
  const promises: Promise<void>[] = [];

  // Discord
  if (destinations.discord?.enabled) {
    promises.push(
      sendToDiscord(destinations.discord, event.data)
        .then(success => {
          results.push({ destination: 'discord', success });
          updateStats('discord', success);
        })
        .catch(error => {
          results.push({ destination: 'discord', success: false, error: String(error) });
          updateStats('discord', false);
        })
    );
  }

  // Telegram
  if (destinations.telegram?.enabled) {
    promises.push(
      sendToTelegram(destinations.telegram, event.data)
        .then(success => {
          results.push({ destination: 'telegram', success });
          updateStats('telegram', success);
        })
        .catch(error => {
          results.push({ destination: 'telegram', success: false, error: String(error) });
          updateStats('telegram', false);
        })
    );
  }

  // Webhook
  if (destinations.webhook?.enabled) {
    promises.push(
      sendToWebhook(destinations.webhook, event.data, metadata)
        .then(success => {
          results.push({ destination: 'webhook', success });
          updateStats('webhook', success);
        })
        .catch(error => {
          results.push({ destination: 'webhook', success: false, error: String(error) });
          updateStats('webhook', false);
        })
    );
  }

  // WebSocket (Socket.IO)
  if (destinations.websocket?.enabled) {
    promises.push(
      sendToWebSocket(destinations.websocket, event, event.pipelineId)
        .then(success => {
          results.push({ destination: 'websocket', success });
          updateStats('websocket', success);
        })
        .catch(error => {
          results.push({ destination: 'websocket', success: false, error: String(error) });
          updateStats('websocket', false);
        })
    );
  }

  // Wait for all deliveries to complete
  await Promise.all(promises);

  return results;
}

/**
 * Deliver event with pipeline info
 */
export async function deliverEventForPipeline(
  event: TransformedEvent,
  pipeline: Pipeline
): Promise<DeliveryResult[]> {
  return deliverEvent(event, pipeline.destinations);
}

/**
 * Update delivery stats
 */
function updateStats(destination: string, success: boolean): void {
  if (success) {
    stats.delivered++;
    if (stats.byDestination[destination]) {
      stats.byDestination[destination].success++;
    }
  } else {
    stats.failed++;
    if (stats.byDestination[destination]) {
      stats.byDestination[destination].failed++;
    }
  }
}

/**
 * Get delivery stats
 */
export function getDeliveryStats() {
  return {
    ...stats,
    wsStatus: getWebSocketStatus(),
  };
}

/**
 * Reset stats
 */
export function resetStats() {
  stats.delivered = 0;
  stats.failed = 0;
  for (const dest of Object.keys(stats.byDestination)) {
    stats.byDestination[dest] = { success: 0, failed: 0 };
  }
}

/**
 * Shutdown the Delivery Service
 */
export function shutdownDeliveryService(): void {
  closeWebSocket();
  console.log('[Delivery] Service shut down');
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

export { sendToDiscord } from './discord.js';
export { sendToTelegram } from './telegram.js';
export { sendToWebhook } from './webhook.js';
export { sendToWebSocket, initWebSocket, closeWebSocket } from './websocket.js';

// ─────────────────────────────────────────────────────────────
// STANDALONE MODE (for testing)
// ─────────────────────────────────────────────────────────────

if (process.argv[1].includes('delivery')) {
  console.log('[Delivery] Service started in standalone mode');

  initDeliveryService();

  console.log('[Delivery] WS status:', getWebSocketStatus());
  console.log('[Delivery] Waiting for events from Pipeline Engine...');

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[Delivery] Shutting down...');
    shutdownDeliveryService();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[Delivery] Shutting down...');
    shutdownDeliveryService();
    process.exit(0);
  });
}
