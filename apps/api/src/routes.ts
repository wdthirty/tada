// API Routes
// RESTful endpoints for pipeline management

import { Router, Request, Response, NextFunction } from 'express';
import type { CreatePipelineRequest, UpdatePipelineRequest } from '@tada/shared';
import { PROGRAMS } from '@tada/shared';
import {
  validateApiKey,
  createApiKey,
  getPipelines,
  getPipeline,
  createPipeline,
  updatePipeline,
  deletePipeline,
  setPipelineStatus,
} from './db.js';
import {
  registerPipeline,
  updatePipelineInEngine,
  removePipelineFromEngine,
} from './pipeline-sync.js';

const router = Router();

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────────────────────

interface AuthenticatedRequest extends Request {
  apiKey?: string;
}

/**
 * API key authentication middleware
 */
async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing API key. Use: Authorization: Bearer <api_key>' });
    return;
  }

  const apiKey = authHeader.substring(7);

  const valid = await validateApiKey(apiKey);
  if (!valid) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  req.apiKey = apiKey;
  next();
}

// ─────────────────────────────────────────────────────────────
// PUBLIC ROUTES
// ─────────────────────────────────────────────────────────────

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /programs
 * List all supported programs
 */
router.get('/programs', (_req, res) => {
  const programs = Object.entries(PROGRAMS).map(([id, program]) => ({
    id,
    name: program.name,
    address: program.address,
    category: program.category,
  }));
  res.json({ programs });
});

/**
 * POST /api-keys
 * Create a new API key
 */
router.post('/api-keys', async (req, res) => {
  const { name } = req.body || {};

  const apiKey = await createApiKey(name);
  if (!apiKey) {
    res.status(500).json({ error: 'Failed to create API key' });
    return;
  }

  res.status(201).json({
    key: apiKey.key,
    name: apiKey.name,
    createdAt: apiKey.created_at,
    message: 'Store this key securely. It cannot be retrieved later.',
  });
});

// ─────────────────────────────────────────────────────────────
// AUTHENTICATED ROUTES
// ─────────────────────────────────────────────────────────────

/**
 * GET /pipelines
 * List all pipelines for the authenticated user
 */
router.get('/pipelines', authenticate, async (req: AuthenticatedRequest, res) => {
  const pipelines = await getPipelines(req.apiKey!);
  res.json({ pipelines });
});

/**
 * POST /pipelines
 * Create a new pipeline
 */
router.post('/pipelines', authenticate, async (req: AuthenticatedRequest, res) => {
  const body = req.body as CreatePipelineRequest;

  // Validate required fields
  if (!body.programs || !Array.isArray(body.programs) || body.programs.length === 0) {
    res.status(400).json({ error: 'programs is required and must be a non-empty array' });
    return;
  }

  if (!body.destinations || Object.keys(body.destinations).length === 0) {
    res.status(400).json({ error: 'At least one destination is required' });
    return;
  }

  // Validate program IDs
  for (const programId of body.programs) {
    if (!PROGRAMS[programId as keyof typeof PROGRAMS]) {
      res.status(400).json({ error: `Invalid program: ${programId}` });
      return;
    }
  }

  const pipeline = await createPipeline(req.apiKey!, body);
  if (!pipeline) {
    res.status(500).json({ error: 'Failed to create pipeline' });
    return;
  }

  // Register with Pipeline Engine for real-time processing
  registerPipeline(pipeline);

  res.status(201).json({ pipeline });
});

/**
 * GET /pipelines/:id
 * Get a single pipeline by ID
 */
router.get('/pipelines/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;

  const pipeline = await getPipeline(id, req.apiKey!);
  if (!pipeline) {
    res.status(404).json({ error: 'Pipeline not found' });
    return;
  }

  res.json({ pipeline });
});

/**
 * PATCH /pipelines/:id
 * Update a pipeline
 */
router.patch('/pipelines/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const body = req.body as UpdatePipelineRequest;

  // Validate program IDs if provided
  if (body.programs) {
    for (const programId of body.programs) {
      if (!PROGRAMS[programId as keyof typeof PROGRAMS]) {
        res.status(400).json({ error: `Invalid program: ${programId}` });
        return;
      }
    }
  }

  const pipeline = await updatePipeline(id, req.apiKey!, body);
  if (!pipeline) {
    res.status(404).json({ error: 'Pipeline not found' });
    return;
  }

  // Update in Pipeline Engine
  updatePipelineInEngine(pipeline);

  res.json({ pipeline });
});

/**
 * DELETE /pipelines/:id
 * Delete a pipeline
 */
router.delete('/pipelines/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;

  const success = await deletePipeline(id, req.apiKey!);
  if (!success) {
    res.status(404).json({ error: 'Pipeline not found' });
    return;
  }

  // Remove from Pipeline Engine
  removePipelineFromEngine(id);

  res.status(204).send();
});

/**
 * POST /pipelines/:id/pause
 * Pause a pipeline
 */
router.post('/pipelines/:id/pause', authenticate, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;

  const pipeline = await setPipelineStatus(id, req.apiKey!, 'paused');
  if (!pipeline) {
    res.status(404).json({ error: 'Pipeline not found' });
    return;
  }

  // Update in Pipeline Engine (paused pipelines won't process events)
  updatePipelineInEngine(pipeline);

  res.json({ pipeline });
});

/**
 * POST /pipelines/:id/resume
 * Resume a paused pipeline
 */
router.post('/pipelines/:id/resume', authenticate, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;

  const pipeline = await setPipelineStatus(id, req.apiKey!, 'active');
  if (!pipeline) {
    res.status(404).json({ error: 'Pipeline not found' });
    return;
  }

  // Update in Pipeline Engine
  updatePipelineInEngine(pipeline);

  res.json({ pipeline });
});

export default router;
