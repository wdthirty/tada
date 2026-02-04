# Tada MCP Server

MCP (Model Context Protocol) server for AI agents to manage Tada pipelines.

## Tools

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
  'tada.stream_logs',             // Real-time logs
  'tada.get_metrics',             // Pipeline metrics
]
```

## Usage with Claude Code

Add to your MCP config:

```json
{
  "mcpServers": {
    "tada": {
      "command": "npx",
      "args": ["@tada/mcp"],
      "env": {
        "TADA_API_KEY": "your-api-key"
      }
    }
  }
}
```

Then just ask Claude:

> "Create a pipeline for pump.fun whale trades over 10 SOL, send to my Discord"

## Development

```bash
cd apps/mcp
npm install
npm run dev
```
