# Architecture

> Single source of truth for Tada's system design. Update this file when architecture changes.

**Tagline:** "Deceptively simple. Infinitely powerful."

**Vision:** The fastest way to get real-time Solana data anywhere. A Discord mod can set up alerts in 30 seconds. A trading firm can build a sub-100ms pipeline with custom filters and Kafka delivery. Same product.

---

## Design Principles

1. **Wide net** — Serve non-technical users AND elite developers equally well
2. **No ceiling** — Simple by default, unlimited complexity available
3. **Zero friction** — API key → data flowing in minutes, not days
4. **AI-native** — Every feature expressible in natural language and via MCP

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                      TADA                                            │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ENTRY POINTS (All Equal Citizens)                                                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐        │
│  │    Chat    │ │ Dashboard  │ │    SDK     │ │    API     │ │    MCP     │        │
│  │  (AI NL)   │ │   (Web)    │ │   (npm)    │ │   (REST)   │ │  (Agents)  │        │
│  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘        │
│        │              │              │              │              │                │
│        └──────────────┴──────────────┴──────────────┴──────────────┘                │
│                                      │                                               │
│                                      ▼                                               │
│  ┌────────────────────────────────────────────────────────────────────────────────┐ │
│  │                         AWS INFRASTRUCTURE (us-east-1)                          │ │
│  │                                                                                  │ │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐   │ │
│  │  │ EC2: INGESTION SERVICE (t3.medium)                                       │   │ │
│  │  │ Helius Laserstream (gRPC) → Parse & Route → Kinesis                      │   │ │
│  │  └──────────────────────────────────┬──────────────────────────────────────┘   │ │
│  │                                     │                                           │ │
│  │                                     ▼                                           │ │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐   │ │
│  │  │ KINESIS: RAW TRANSACTIONS STREAM                                         │   │ │
│  │  │ Decouples ingestion from processing, handles backpressure                │   │ │
│  │  └──────────────────────────────────┬──────────────────────────────────────┘   │ │
│  │                                     │                                           │ │
│  │                                     ▼                                           │ │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐   │ │
│  │  │ EC2: PIPELINE ENGINE (c6i.large) ← CPU-intensive                         │   │ │
│  │  │ Filter (declarative + code) → Transform (template + code) → Kinesis      │   │ │
│  │  │ Uses isolated-vm for sandboxed user code execution                       │   │ │
│  │  └──────────────────────────────────┬──────────────────────────────────────┘   │ │
│  │                                     │                                           │ │
│  │                                     ▼                                           │ │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐   │ │
│  │  │ KINESIS: PROCESSED EVENTS STREAM                                         │   │ │
│  │  │ Decouples processing from delivery, enables fan-out                      │   │ │
│  │  └──────────────────────────────────┬──────────────────────────────────────┘   │ │
│  │                                     │                                           │ │
│  │                                     ▼                                           │ │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐   │ │
│  │  │ EC2: DELIVERY SERVICE (t3.small) ← I/O-bound                             │   │ │
│  │  │ Fan-out to all enabled destinations per pipeline                         │   │ │
│  │  └──────────────────────────────────┬──────────────────────────────────────┘   │ │
│  │                                     │                                           │ │
│  └─────────────────────────────────────┼──────────────────────────────────────────┘ │
│                                        │                                             │
│                                        ▼                                             │
│  ┌────────────────────────────────────────────────────────────────────────────────┐ │
│  │                           DELIVERY DESTINATIONS                                 │ │
│  │                                                                                  │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │ │
│  │  │ Discord │ │Telegram │ │WebSocket│ │ Webhook │ │Postgres │ │  Kafka  │       │ │
│  │  │         │ │         │ │ (Ably)  │ │         │ │         │ │         │       │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘       │ │
│  │  ┌─────────┐ ┌─────────┐                                                        │ │
│  │  │   S3    │ │  Tada   │  ... more destinations                                 │ │
│  │  │         │ │ Storage │                                                        │ │
│  │  └─────────┘ └─────────┘                                                        │ │
│  │                                                                                  │ │
│  └────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│  ┌────────────────────────────────────────────────────────────────────────────────┐ │
│  │                              DATA LAYER                                         │ │
│  │                                                                                  │ │
│  │  Supabase (Postgres): pipelines, api_keys, logs, metrics                        │ │
│  │  Upstash (Redis): pipeline config cache, rate limiting, coordination            │ │
│  │  Tada Storage: optional managed storage for users who want it                   │ │
│  │                                                                                  │ │
│  └────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│  ┌────────────────────────────────────────────────────────────────────────────────┐ │
│  │                              WEB LAYER                                          │ │
│  │                                                                                  │ │
│  │  Vercel: Next.js dashboard, AI chat, landing page                               │ │
│  │                                                                                  │ │
│  └────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Entry Points

All entry points are equal citizens. They all create the same underlying pipelines.

| Entry Point | Who It's For | How It Works |
|-------------|--------------|--------------|
| **Chat (AI)** | Non-technical users, quick setup | Natural language → pipeline config |
| **Dashboard** | Visual users, exploration | Click-to-configure UI |
| **SDK** | Developers, programmatic control | `npm install @tada/sdk` |
| **API** | Backend integration, automation | REST endpoints |
| **MCP** | AI agents, Claude Code, Cursor | Tool calls for pipeline management |

---

## Data Flow

```
1. Helius Laserstream (gRPC) streams all transactions from subscribed programs
                │
                ▼
2. Ingestion Service (EC2 t3.medium) parses transactions, writes to Kinesis
                │
                ▼
3. Kinesis Raw Transactions Stream buffers and distributes
                │
                ▼
4. Pipeline Engine (EC2 c6i.large) consumes from Kinesis:
   a. Route transaction to matching pipelines (by program)
   b. Apply filter (declarative or code via isolated-vm)
   c. If passes: run transform
   d. Write processed event to Kinesis
                │
                ▼
5. Kinesis Processed Events Stream buffers for delivery
                │
                ▼
6. Delivery Service (EC2 t3.small) fans out to all enabled destinations
                │
                ▼
7. Discord, Telegram, WebSocket (Ably), Webhook, Postgres, Kafka, S3, etc.
```

---

## AWS Infrastructure

### Region
- **us-east-1** — Closest to Helius/Solana infrastructure

### EC2 Instances

| Service | Instance Type | Purpose | Scaling |
|---------|---------------|---------|---------|
| Ingestion | t3.medium | Helius gRPC connection, Kinesis producer | Single instance (can add ASG later) |
| Pipeline Engine | c6i.large | CPU-intensive filter/transform with isolated-vm | Auto-scaling group when needed |
| Delivery | t3.small | I/O-bound HTTP calls to destinations | Single instance (can add ASG later) |

### Kinesis Streams

| Stream | Purpose | Shards |
|--------|---------|--------|
| `tada-raw-transactions` | Buffer between Ingestion and Pipeline Engine | 1 (scale as needed) |
| `tada-processed-events` | Buffer between Pipeline Engine and Delivery | 1 (scale as needed) |

### Estimated Monthly Cost

| Resource | Cost |
|----------|------|
| EC2 t3.medium (Ingestion) | ~$30 |
| EC2 c6i.large (Pipeline) | ~$60 |
| EC2 t3.small (Delivery) | ~$15 |
| Kinesis (2 streams, 1 shard each) | ~$30 |
| **AWS Subtotal** | **~$135** |
| Upstash Redis | ~$10 |
| Supabase (Free tier) | $0 |
| Vercel (Free tier) | $0 |
| Ably (Free tier) | $0 |
| **Total** | **~$145/mo** |

---

## Ingestion Layer

### Helius Laserstream (gRPC)

Single gRPC connection subscribing to all supported programs. Handles:
- Auto-reconnection
- Historical replay (up to 3000 slots / ~20 min)
- Multi-region failover

### Supported Programs

| ID | Program | Address | Category |
|----|---------|---------|----------|
| PUMP_BONDING_CURVE | Pump.fun Bonding Curve | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | Pre-migration |
| METEORA_DBC | Meteora DBC | `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` | Pre-migration |
| PUMPSWAP | PumpSwap AMM | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` | Post-migration |
| METEORA_DAMM_V1 | Meteora DAMM v1 | `Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB` | Post-migration |
| METEORA_DAMM_V2 | Meteora DAMM v2 | `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG` | Post-migration |
| METEORA_DLMM | Meteora DLMM | `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo` | Post-migration |

More programs can be added. The architecture supports any Solana program.

---

## Pipeline Schema

A pipeline is the core unit. Lightweight, cheap to create, one per use case.

```typescript
interface Pipeline {
  id: string;
  name: string;
  apiKey: string;
  
  // ─────────────────────────────────────────────────────────────
  // SOURCE: Which program(s) to listen to
  // ─────────────────────────────────────────────────────────────
  programs: ProgramId[];  // One or more programs
  
  // ─────────────────────────────────────────────────────────────
  // FILTER: What transactions to keep (declarative + code escape hatch)
  // ─────────────────────────────────────────────────────────────
  filter: {
    // Declarative filters (AI-friendly, easy to generate)
    instructions?: string[];              // ['buy', 'sell']
    accounts?: {
      include?: string[];                 // Only txs involving these accounts
      exclude?: string[];                 // Skip txs involving these accounts
    };
    conditions?: Array<{
      field: string;                      // 'args.amount', 'meta.slot', etc.
      op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
      value: any;
    }>;
    
    // Code escape hatch (unlimited complexity)
    code?: string;  // (tx: Transaction) => boolean
  };
  
  // ─────────────────────────────────────────────────────────────
  // TRANSFORM: Shape the output (field mapping + code escape hatch)
  // ─────────────────────────────────────────────────────────────
  transform: {
    mode: 'template' | 'fields' | 'code';
    
    // Template mode: pre-built formatters
    template?: 'trade' | 'transfer' | 'migration' | 'raw';
    
    // Fields mode: pick and rename fields
    fields?: Array<{
      source: string;                     // 'instruction.args.amount'
      target: string;                     // 'amount'
      pipe?: 'lamportsToSol' | 'base58' | 'timestamp' | 'shorten';
    }>;
    
    // Code mode: full control
    code?: string;  // (tx: Transaction) => any
  };
  
  // ─────────────────────────────────────────────────────────────
  // DESTINATIONS: Where to send the data (enable any combination)
  // ─────────────────────────────────────────────────────────────
  destinations: {
    discord?: {
      enabled: boolean;
      webhookUrl: string;
      format?: 'embed' | 'text';          // Default: embed
    };
    telegram?: {
      enabled: boolean;
      botToken: string;
      chatId: string;
      format?: 'markdown' | 'html' | 'text';
    };
    websocket?: {
      enabled: boolean;
      channelId?: string;                 // Auto-generated if not provided
    };
    webhook?: {
      enabled: boolean;
      url: string;
      method?: 'POST' | 'PUT';            // Default: POST
      headers?: Record<string, string>;
      signing?: {
        secret: string;
        header?: string;                  // Default: x-tada-signature
      };
      retry?: {
        attempts?: number;                // Default: 3
        backoff?: 'exponential' | 'linear';
      };
    };
    postgres?: {
      enabled: boolean;
      connectionString: string;
      table: string;
      onConflict?: 'ignore' | 'update';   // For upserts
    };
    kafka?: {
      enabled: boolean;
      brokers: string[];
      topic: string;
      auth?: { username: string; password: string };
    };
    s3?: {
      enabled: boolean;
      bucket: string;
      region: string;
      prefix?: string;
      credentials: { accessKeyId: string; secretAccessKey: string };
    };
    tadaStorage?: {
      enabled: boolean;                   // We store it, they query via API
    };
  };
  
  // ─────────────────────────────────────────────────────────────
  // METADATA
  // ─────────────────────────────────────────────────────────────
  status: 'active' | 'paused' | 'error';
  createdAt: Date;
  updatedAt: Date;
  
  // ─────────────────────────────────────────────────────────────
  // METRICS (read-only, computed)
  // ─────────────────────────────────────────────────────────────
  metrics?: {
    eventsPerSecond: number;
    totalEvents: number;
    errorCount: number;
    lastEventAt: Date;
    p99LatencyMs: number;
  };
}
```

---

## Filter System

Progressive complexity. Start simple, go deep when needed.

### Level 1: Instruction Filter
```typescript
filter: { instructions: ['buy', 'sell'] }
```

### Level 2: Add Conditions
```typescript
filter: {
  instructions: ['buy'],
  conditions: [
    { field: 'args.amount', op: 'gt', value: 1_000_000_000 }  // > 1 SOL
  ]
}
```

### Level 3: Complex Logic
```typescript
filter: {
  $or: [
    { instructions: ['buy'], conditions: [{ field: 'args.amount', op: 'gt', value: 10_000_000_000 }] },
    { instructions: ['sell'], conditions: [{ field: 'args.amount', op: 'gt', value: 50_000_000_000 }] }
  ],
  accounts: { include: ['token_mint_address'] }
}
```

### Level 4: Code Escape Hatch
```typescript
filter: {
  code: `(tx) => {
    // Unlimited complexity
    const dominance = calculateMarketDominance(tx);
    const isWhale = tx.args.amount > 10_000_000_000;
    const notBot = !KNOWN_BOTS.includes(tx.accounts.user);
    return isWhale && notBot && dominance > 0.1;
  }`
}
```

---

## Transform System

Same progressive complexity.

### Template Mode (Easiest)
```typescript
transform: { mode: 'template', template: 'trade' }
// Outputs: { type, user, amount, token, price, timestamp, txSignature }
```

### Fields Mode
```typescript
transform: {
  mode: 'fields',
  fields: [
    { source: 'accounts.user', target: 'trader' },
    { source: 'args.amount', target: 'amount', pipe: 'lamportsToSol' },
    { source: 'accounts.mint', target: 'token' },
    { source: 'meta.blockTime', target: 'time', pipe: 'timestamp' }
  ]
}
```

### Code Mode (Full Control)
```typescript
transform: {
  mode: 'code',
  code: `(tx) => ({
    ...extractTradeInfo(tx),
    sentiment: analyzeSentiment(tx),
    marketCap: fetchMarketCap(tx.accounts.mint),
    alert: tx.args.amount > WHALE_THRESHOLD ? '🐋 WHALE ALERT' : null
  })`
}
```

---

## Destinations

| Destination | Setup Complexity | Best For |
|-------------|------------------|----------|
| **Discord** | Paste webhook URL | Community alerts, notifications |
| **Telegram** | Bot token + chat ID | Personal/group alerts |
| **WebSocket** | Auto-generated channel | Real-time frontends |
| **Webhook** | Any URL | Backend integration |
| **Postgres** | Connection string | Persistent storage, analytics |
| **Kafka** | Broker config | Event streaming, microservices |
| **S3** | Bucket config | Data lake, archival |
| **Tada Storage** | One click | Simplest persistence option |

Multiple destinations per pipeline. Same transformed output goes everywhere.

---

## Database Schema

### pipelines
```sql
CREATE TABLE pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key VARCHAR(64) NOT NULL REFERENCES api_keys(key),
  name VARCHAR(255),
  programs TEXT[] NOT NULL,
  filter JSONB NOT NULL DEFAULT '{}',
  transform JSONB NOT NULL DEFAULT '{"mode": "template", "template": "raw"}',
  destinations JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pipelines_api_key ON pipelines(api_key);
CREATE INDEX idx_pipelines_programs ON pipelines USING GIN(programs);
CREATE INDEX idx_pipelines_status ON pipelines(status);
```

### api_keys
```sql
CREATE TABLE api_keys (
  key VARCHAR(64) PRIMARY KEY,
  user_id UUID,  -- Optional, for multi-user support later
  name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
```

### pipeline_logs (capped, recent only)
```sql
CREATE TABLE pipeline_logs (
  id BIGSERIAL PRIMARY KEY,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE,
  event_type VARCHAR(50),  -- 'processed', 'filtered', 'delivered', 'error'
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-delete old logs (keep last 1000 per pipeline)
```

### pipeline_metrics
```sql
CREATE TABLE pipeline_metrics (
  pipeline_id UUID PRIMARY KEY REFERENCES pipelines(id) ON DELETE CASCADE,
  events_total BIGINT DEFAULT 0,
  events_last_hour INT DEFAULT 0,
  errors_total BIGINT DEFAULT 0,
  last_event_at TIMESTAMPTZ,
  p99_latency_ms INT
);
```

---

## Service Architecture

| Service | Responsibility | Technology | Infrastructure |
|---------|---------------|------------|----------------|
| **Ingestion** | Helius gRPC connection, Kinesis producer | Node.js, helius-laserstream SDK | EC2 t3.medium |
| **Pipeline Engine** | Route txs, run filters/transforms | Node.js, isolated-vm, Kinesis consumer/producer | EC2 c6i.large |
| **Delivery** | Fan-out to destinations with retries | Node.js, per-destination adapters | EC2 t3.small |
| **API** | CRUD for pipelines, auth, metrics | Fastify | Runs on Pipeline Engine EC2 |
| **Dashboard** | Web UI for all users | Next.js | Vercel |
| **AI Chat** | Natural language → pipeline config | Next.js + Claude API | Vercel |
| **MCP Server** | Tool interface for AI agents | Node.js MCP server | npm package |

### CI/CD

- **GitHub Actions** for all deployments
- **Docker** containers on EC2
- **Deploy time target**: < 1 minute

```
git push → GitHub Actions → Build Docker image → Push to ECR → SSH to EC2 → Pull & restart
```

---

## SDK Interface

```typescript
import { Tada } from '@tada/sdk';

const tada = new Tada({ apiKey: 'xxx' });

// Create a pipeline
const pipeline = await tada.pipelines.create({
  name: 'whale-tracker',
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

// Subscribe to WebSocket
pipeline.subscribe((event) => {
  console.log('Trade:', event);
});

// Update filter on the fly
await pipeline.update({
  filter: {
    conditions: [{ field: 'args.amount', op: 'gt', value: tada.sol(20) }]
  }
});

// Get metrics
const stats = await pipeline.metrics();
// { eventsPerSecond: 12.4, totalEvents: 84923, p99LatencyMs: 45 }

// List all pipelines
const all = await tada.pipelines.list();

// Pause/resume
await pipeline.pause();
await pipeline.resume();

// Delete
await pipeline.delete();
```

---

## MCP Tools

Exposed for AI agents (Claude Code, Cursor, etc.):

```typescript
tools: [
  // Discovery
  'tada.list_programs',           // What programs can I track?
  'tada.list_templates',          // What transform templates exist?
  
  // Pipeline CRUD
  'tada.create_pipeline',         // Create new pipeline
  'tada.list_pipelines',          // List user's pipelines
  'tada.get_pipeline',            // Get pipeline details
  'tada.update_pipeline',         // Modify pipeline
  'tada.delete_pipeline',         // Delete pipeline
  'tada.pause_pipeline',          // Pause without deleting
  'tada.resume_pipeline',         // Resume paused pipeline
  
  // Testing & Debugging
  'tada.test_filter',             // Test filter against recent txs
  'tada.preview_transform',       // See transform output shape
  'tada.stream_logs',             // Real-time logs (last N events)
  'tada.get_metrics',             // Pipeline metrics
  
  // Utilities
  'tada.sol_to_lamports',         // Convert SOL to lamports
  'tada.lamports_to_sol',         // Convert lamports to SOL
]
```

---

## API Endpoints

### Pipelines
```
POST   /api/pipelines              Create pipeline
GET    /api/pipelines              List user's pipelines
GET    /api/pipelines/:id          Get pipeline details
PATCH  /api/pipelines/:id          Update pipeline
DELETE /api/pipelines/:id          Delete pipeline
POST   /api/pipelines/:id/pause    Pause pipeline
POST   /api/pipelines/:id/resume   Resume pipeline
```

### Testing
```
POST   /api/test/filter            Test filter against sample txs
POST   /api/test/transform         Preview transform output
```

### Logs & Metrics
```
GET    /api/pipelines/:id/logs     Get recent logs
GET    /api/pipelines/:id/metrics  Get metrics
GET    /api/pipelines/:id/stream   SSE stream of events
```

### Programs
```
GET    /api/programs               List supported programs
GET    /api/programs/:id           Get program details
```

### WebSocket
```
WSS    /ws/:channelId              Subscribe to pipeline output
```

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Chain → Destination latency | < 100ms p50, < 500ms p99 |
| Pipelines per account | Unlimited |
| Events per second (system) | 10,000+ |
| Concurrent WebSocket connections | 10,000+ |
| Webhook retry attempts | 3 with exponential backoff |
| Filter execution time | < 10ms |
| Transform execution time | < 50ms |

---

## Security

- **API keys**: Scoped per user, rotatable
- **Code execution**: Sandboxed via isolated-vm, no network/filesystem access
- **Webhook signing**: HMAC-SHA256 signature in header
- **Connection strings**: Encrypted at rest
- **Rate limiting**: Per API key, configurable

---

## Scaling Strategy (Future)

Current architecture handles ~500 pipelines, ~50k events/sec. For scale:

1. **Kinesis shards**: Add shards to increase throughput (each shard = 1MB/sec in, 2MB/sec out)
2. **Pipeline Engine ASG**: Auto-scaling group for c6i.large instances
3. **Delivery ASG**: Auto-scaling group if fan-out becomes bottleneck
4. **Multi-AZ**: Deploy across availability zones for resilience
5. **Fargate migration**: Move to Fargate for production once dev velocity matters less

Not implementing until needed.

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2025-01-07 | Initial architecture with single Helius connection | - |
| 2025-01-07 | Expanded to full vision: multiple entry points, destinations, filter/transform system | - |
| 2025-01-07 | Migrated to AWS: EC2 (3 instances) + Kinesis (2 streams) + Upstash Redis | - |
