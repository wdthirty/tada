# Tada Dashboard

Next.js web app for managing Tada pipelines.

## Setup

```bash
npm install
npm run dev
```

Opens at http://localhost:3000

## Pages

| Route | Purpose |
|-------|---------|
| `/` | Landing / API key setup |
| `/pipelines` | List user's pipelines |
| `/pipelines/new` | Create pipeline (step-by-step wizard) |
| `/pipelines/[id]` | Pipeline detail and editing |
| `/programs` | Browse supported Solana programs |

## Environment Variables

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001  # Tada API URL
```

## Features

- Clean, minimal UI
- Step-by-step pipeline creation wizard
- Program selection with categories
- Event filtering
- Transform template selection
- Multiple destination configuration (Discord, Telegram, Webhook, WebSocket)
- Pipeline status management (pause/resume)
- Dark mode support
