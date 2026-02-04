// Webhook Destination
// Sends events to user-defined HTTP endpoints

import type { WebhookDestination } from '@tada/shared';
import * as crypto from 'crypto';

/**
 * Send event to a webhook endpoint
 */
export async function sendToWebhook(
  destination: WebhookDestination,
  data: Record<string, any>,
  metadata: { pipelineId: string; eventId: string; timestamp: number }
): Promise<boolean> {
  if (!destination.enabled || !destination.url) {
    return false;
  }

  const payload = JSON.stringify({
    ...data,
    _meta: metadata,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Tada/1.0',
    'X-Tada-Pipeline-Id': metadata.pipelineId,
    'X-Tada-Event-Id': metadata.eventId,
    'X-Tada-Timestamp': String(metadata.timestamp),
    ...destination.headers,
  };

  // Add signature if configured
  if (destination.signing?.secret) {
    const signature = signPayload(payload, destination.signing.secret);
    const headerName = destination.signing.header || 'X-Tada-Signature';
    headers[headerName] = signature;
  }

  // Retry logic
  const maxAttempts = destination.retry?.attempts ?? 3;
  const backoffType = destination.retry?.backoff ?? 'exponential';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(destination.url, {
        method: destination.method || 'POST',
        headers,
        body: payload,
      });

      if (response.ok) {
        return true;
      }

      // Don't retry 4xx errors (client error)
      if (response.status >= 400 && response.status < 500) {
        console.error(`[Webhook] Client error ${response.status}, not retrying`);
        return false;
      }

      // Log server error and retry
      console.error(`[Webhook] Attempt ${attempt}/${maxAttempts} failed: ${response.status}`);

    } catch (error) {
      console.error(`[Webhook] Attempt ${attempt}/${maxAttempts} error:`, error);
    }

    // Wait before retry (if not last attempt)
    if (attempt < maxAttempts) {
      const delay = calculateBackoff(attempt, backoffType);
      await sleep(delay);
    }
  }

  console.error(`[Webhook] All ${maxAttempts} attempts failed for ${destination.url}`);
  return false;
}

/**
 * Sign payload with HMAC-SHA256
 */
function signPayload(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Calculate backoff delay
 */
function calculateBackoff(attempt: number, type: 'exponential' | 'linear'): number {
  if (type === 'linear') {
    return attempt * 1000; // 1s, 2s, 3s...
  }
  // Exponential: 1s, 2s, 4s, 8s...
  return Math.pow(2, attempt - 1) * 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
