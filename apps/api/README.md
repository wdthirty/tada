# Tada API

RESTful API for pipeline management.

## Setup

```bash
npm install
npm run dev
```

## Environment Variables

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
PORT=3001  # Optional, defaults to 3001
```

## Endpoints

### Public

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /programs | List supported programs |
| POST | /api-keys | Create new API key |

### Authenticated (requires `Authorization: Bearer <api_key>`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /pipelines | List pipelines |
| POST | /pipelines | Create pipeline |
| GET | /pipelines/:id | Get pipeline |
| PATCH | /pipelines/:id | Update pipeline |
| DELETE | /pipelines/:id | Delete pipeline |
| POST | /pipelines/:id/pause | Pause pipeline |
| POST | /pipelines/:id/resume | Resume pipeline |

## Example Usage

```bash
# Create an API key
curl -X POST http://localhost:3001/api-keys \
  -H "Content-Type: application/json" \
  -d '{"name": "My App"}'

# Create a pipeline
curl -X POST http://localhost:3001/pipelines \
  -H "Authorization: Bearer tada_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Trade Tracker",
    "programs": ["PUMPSWAP", "PUMP_BONDING_CURVE"],
    "filter": {
      "instructions": ["TradeEvent", "BuyEvent", "SellEvent"]
    },
    "transform": {
      "mode": "template",
      "template": "trade"
    },
    "destinations": {
      "discord": {
        "enabled": true,
        "webhookUrl": "https://discord.com/api/webhooks/..."
      }
    }
  }'

# List pipelines
curl http://localhost:3001/pipelines \
  -H "Authorization: Bearer tada_abc123..."
```

## Architecture

See [ARCHITECTURE.md](/ARCHITECTURE.md) for the full system design and database schema.
