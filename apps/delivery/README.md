# Delivery Service

Fans out transformed events to all enabled destinations.

## Usage

```bash
# Install dependencies
npm install

# Build
npm run build

# Run standalone (for testing)
npm run dev
```

## Environment Variables

```bash
ABLY_API_KEY=your-ably-api-key  # For WebSocket delivery
```

## Destinations

### Discord
Sends formatted messages to Discord webhooks.
- Supports embed and text formats
- Trade events show direction, amounts, price
- Migration events highlighted with special formatting

### Telegram
Sends messages via Telegram Bot API.
- Supports markdown, HTML, and plain text formats
- Trade and migration event formatting

### Webhook
Sends JSON payloads to HTTP endpoints.
- Configurable method (POST/PUT)
- Custom headers
- HMAC-SHA256 signing
- Retry with exponential/linear backoff

### WebSocket (Ably)
Publishes events to Ably channels.
- Real-time delivery
- Channel per pipeline or custom channel ID

## Integration

```typescript
import { initDeliveryService, deliverEvent } from '@tada/delivery';

// Initialize (call once at startup)
initDeliveryService();

// Deliver an event
const results = await deliverEvent(transformedEvent, {
  discord: { enabled: true, webhookUrl: '...' },
  telegram: { enabled: true, botToken: '...', chatId: '...' },
  webhook: { enabled: true, url: '...' },
  websocket: { enabled: true },
});

console.log('Delivery results:', results);
```
