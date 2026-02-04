// Pipeline Service Entry Point
// Processes events from Ingestion → Filter → Transform → Delivery
// MVP: Direct integration with Ingestion (no Kinesis yet)

import { engine, PipelineEngine } from './engine.js';
import { evaluateFilter } from './filter.js';
import { applyTransform, TransformedEvent } from './transform.js';
import type { Pipeline, DecodedEvent } from '@tada/shared';

// Delivery integration (optional - enable with ENABLE_DELIVERY=true)
let deliveryService: any = null;
const ENABLE_DELIVERY = process.env.ENABLE_DELIVERY === 'true';

// Initialize Delivery Service if enabled
async function initDelivery() {
  if (ENABLE_DELIVERY) {
    try {
      const delivery = await import('@tada/delivery');
      deliveryService = delivery;
      delivery.initDeliveryService();
      console.log('[Pipeline] Delivery Service: ENABLED');
    } catch (error) {
      console.warn('[Pipeline] Delivery Service: Failed to load, using console output');
    }
  }
}

// Set up event handler
engine.setEventHandler(async (event: TransformedEvent, pipeline: Pipeline) => {
  if (deliveryService) {
    // Debug: log every event being delivered
    console.log(`[Pipeline:${pipeline.name}] Delivering ${event.data.eventName || 'unknown'} to ${Object.keys(pipeline.destinations).filter(k => (pipeline.destinations as any)[k]?.enabled).join(', ')}`);

    // Deliver to all enabled destinations
    const results = await deliveryService.deliverEventForPipeline(event, pipeline);
    const successful = results.filter((r: any) => r.success).length;
    const failed = results.filter((r: any) => !r.success).length;
    console.log(`[Pipeline:${pipeline.name}] Delivery result: ${successful} success, ${failed} failed`);
  } else {
    // Log to console
    console.log(`[Pipeline:${pipeline.name}] Event (no delivery):`, JSON.stringify(event.data, null, 2));
  }
});

// Only auto-init delivery when running from ingestion (not API)
// API imports @tada/pipeline for engine only, doesn't need Socket.IO
if (!process.argv[1]?.includes('api')) {
  initDelivery();
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

export { engine, PipelineEngine, evaluateFilter, applyTransform };
export type { TransformedEvent };

// ─────────────────────────────────────────────────────────────
// STANDALONE MODE (for testing)
// ─────────────────────────────────────────────────────────────

if (process.argv[1].includes('pipeline')) {
  console.log('[Pipeline] Service started in standalone mode');
  console.log('[Pipeline] Registered pipelines:', engine.getAllPipelines().map(p => p.name));
  console.log('[Pipeline] Waiting for events...');
  console.log('[Pipeline] (In production, events come from Kinesis. For testing, import and call engine.processEvent())');
}
