// Tada API Service
// RESTful API for pipeline management
// Connects to Supabase for persistence

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import express from 'express';
import cors from 'cors';
import routes from './routes.js';
import { initDb, getAllActivePipelines } from './db.js';
import { initPipelineEngine, registerPipeline } from './pipeline-sync.js';

const PORT = process.env.PORT || 4000;

export const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/', routes);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[API] Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
async function main() {
  // Initialize database connection
  try {
    initDb();
    console.log('[API] Database connected');
  } catch (error) {
    console.error('[API] Failed to connect to database:', error);
    console.log('[API] Starting without database (endpoints will fail)');
  }

  // Initialize Pipeline Engine and load existing pipelines
  const engineConnected = await initPipelineEngine();
  if (engineConnected) {
    try {
      const pipelines = await getAllActivePipelines();
      console.log(`[API] Loading ${pipelines.length} active pipelines into engine...`);
      for (const pipeline of pipelines) {
        registerPipeline(pipeline);
      }
    } catch (error) {
      console.error('[API] Failed to load pipelines into engine:', error);
    }
  }

  app.listen(PORT, () => {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                     TADA API SERVICE                           ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`Listening on http://localhost:${PORT}`);
    console.log('\nEndpoints:');
    console.log('  GET  /health              - Health check');
    console.log('  GET  /programs            - List supported programs');
    console.log('  POST /api-keys            - Create new API key');
    console.log('  GET  /pipelines           - List pipelines (auth required)');
    console.log('  POST /pipelines           - Create pipeline (auth required)');
    console.log('  GET  /pipelines/:id       - Get pipeline (auth required)');
    console.log('  PATCH /pipelines/:id      - Update pipeline (auth required)');
    console.log('  DELETE /pipelines/:id     - Delete pipeline (auth required)');
    console.log('  POST /pipelines/:id/pause - Pause pipeline (auth required)');
    console.log('  POST /pipelines/:id/resume - Resume pipeline (auth required)');
    console.log('\nAuthentication:');
    console.log('  Authorization: Bearer <api_key>');
  });
}

main().catch((error) => {
  console.error('[API] Fatal error:', error);
  process.exit(1);
});
