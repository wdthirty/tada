# Tada

**Real-time Solana data. Your way.**

Deceptively simple. Infinitely powerful.

---

## What is Tada?

Tada is the fastest way to get real-time Solana data anywhere.

A Discord mod can set up whale alerts in 30 seconds. A trading firm can build sub-100ms pipelines with custom filters and Kafka delivery. Same product.

```
"I want pump.fun buys over 10 SOL sent to my Discord"
     ↓
Tada creates a pipeline
     ↓
Your Discord lights up with real-time trades
```

---

## How It Works

You describe what you want → Tada handles the rest.

```
"I want pump.fun buys over 10 SOL"  →  Filter
"Send to my Discord"                →  Destination
"Show token name and SOL amount"    →  Transform
```

### Architecture

```
Helius Laserstream (gRPC)
│
│  Instruction-level filtering (8-byte discriminators)
│  Only receives swaps, token creations, migrations
│
├─────────────────────────────────────────────────────────┐
│                                                         │
▼                                                         ▼
Ingestion Service                                   Pipeline Service
│                                                         │
│  Parses raw transactions                                │  User-defined filters
│  Extracts structured events                             │  Custom transforms
│  Normalizes across programs                             │  Code sandbox (isolated-vm)
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
▼                                                         ▼
Supabase                                            Delivery Service
│                                                         │
│  PostgreSQL (pipelines, users)                          │  Fan-out to destinations
│  Event history                                          │  Discord, Telegram, Webhooks
│                                                         │  WebSocket (Ably)
│                                                         │  Kafka, S3, Postgres
```

---

## For Everyone

### Non-Technical Users

Talk to Tada in plain English:

> "Send me new pump.fun tokens to my Discord"
> 
> "Alert me when there's a trade over 10 SOL"
> 
> "Track this wallet's activity on Telegram"

No code. No config files. No CLI.

### Developers

Full control when you want it:

```typescript
import { Tada } from '@tada/sdk';

const tada = new Tada({ apiKey: 'xxx' });

const pipeline = await tada.pipelines.create({
  programs: ['PUMP_BONDING_CURVE'],
  filter: {
    instructions: ['buy'],
    conditions: [{ field: 'args.amount', op: 'gt', value: tada.sol(10) }]
  },
  transform: { mode: 'template', template: 'trade' },
  destinations: {
    discord: { enabled: true, webhookUrl: '...' },
    websocket: { enabled: true }
  }
});

pipeline.subscribe((trade) => console.log(trade));
```

### AI Agents

Full MCP server for Claude Code, Cursor, and any MCP client:

```
> Create a pipeline for pump.fun migrations, send to my webhook

[Claude calls tada.create_pipeline]

Done. Pipeline "pump-migrations" is live.
```

---

## Features

### Pipelines
- **Lightweight** — Create hundreds, costs nothing
- **Granular** — One pipeline per use case
- **Fast** — Sub-100ms from chain to destination

### Filters
- **Simple**: `{ instructions: ['buy'] }`
- **Complex**: Nested conditions, multiple programs
- **Code**: Full JavaScript escape hatch for unlimited logic

### Transforms
- **Templates**: Pre-built formatters (trade, transfer, migration)
- **Fields**: Pick and rename fields
- **Code**: Full control over output shape

### Destinations
| Destination | Setup |
|-------------|-------|
| Discord | Paste webhook URL |
| Telegram | Bot token + chat ID |
| WebSocket | Auto-generated channel |
| Webhook | Any URL, with signing |
| Postgres | Connection string |
| Kafka | Broker config |
| S3 | Bucket config |
| Tada Storage | One click |

---

## Supported Programs

| Program | Description |
|---------|-------------|
| Pump.fun Bonding Curve | Pre-migration trades |
| Meteora DBC | Dynamic Bonding Curve |
| PumpSwap | Pump.fun AMM |
| Meteora DAMM v1 | Dynamic AMM |
| Meteora DAMM v2 | Dynamic AMM |
| Meteora DLMM | Dynamic Liquidity Market Maker |

More coming. Architecture supports any Solana program.

---

## Quick Start

### Option 1: Chat (Easiest)
Go to [tada.build](https://tada.build) and describe what you want.

### Option 2: Dashboard
Create and manage pipelines visually at [tada.build/dashboard](https://tada.build/dashboard).

### Option 3: SDK
```bash
npm install @tada/sdk
```

```typescript
import { Tada } from '@tada/sdk';

const tada = new Tada({ apiKey: 'your-api-key' });

// List programs
const programs = await tada.programs.list();

// Create pipeline
const pipeline = await tada.pipelines.create({
  programs: ['PUMP_BONDING_CURVE'],
  filter: { instructions: ['buy', 'sell'] },
  destinations: { websocket: { enabled: true } }
});

// Subscribe
pipeline.subscribe((event) => {
  console.log('New event:', event);
});
```

### Option 4: MCP (AI Agents)
Add Tada MCP server to Claude Code or Cursor, then just ask for what you want.

---

## Project Structure

```
tada/
├── apps/
│   ├── ingestion/        # Helius Laserstream → parsed events
│   ├── pipeline/         # User filters & transforms
│   ├── delivery/         # Fan-out to destinations
│   ├── api/              # REST API (Fastify)
│   ├── web/              # Dashboard + AI Chat (Next.js)
│   └── mcp/              # MCP server for AI agents
├── packages/
│   └── shared/           # Shared types & IDLs
└── ARCHITECTURE.md       # System design
```

---

## Documentation

See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design, pipeline schema, and API reference.

---

## Tech Stack

- **Runtime**: Node.js (TypeScript)
- **API**: Fastify
- **Web**: Next.js
- **Database**: Supabase (Postgres)
- **Solana Data**: Helius Laserstream (gRPC)
- **WebSockets**: Ably
- **Hosting**: Vercel (web) + AWS EC2 (services)

---

## Status

🚧 In development. Building fast.

---

## License

MIT
