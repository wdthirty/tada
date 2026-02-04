import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from './index.js';

let apiKey: string;
let pipelineId: string;

describe('API Endpoints', () => {
  // Public endpoints
  describe('GET /health', () => {
    it('returns ok status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('GET /programs', () => {
    it('returns list of 6 programs', async () => {
      const res = await request(app).get('/programs');
      expect(res.status).toBe(200);
      expect(res.body.programs).toHaveLength(6);
      expect(res.body.programs[0]).toHaveProperty('id');
      expect(res.body.programs[0]).toHaveProperty('name');
      expect(res.body.programs[0]).toHaveProperty('address');
    });
  });

  describe('POST /api-keys', () => {
    it('creates a new API key', async () => {
      const res = await request(app).post('/api-keys');
      expect(res.status).toBe(201);
      expect(res.body.key).toMatch(/^tada_/);
      expect(res.body.message).toContain('Store this key');
      apiKey = res.body.key;
    });
  });

  // Auth-protected endpoints
  describe('GET /pipelines', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/pipelines');
      expect(res.status).toBe(401);
    });

    it('returns pipelines with auth', async () => {
      const res = await request(app)
        .get('/pipelines')
        .set('Authorization', `Bearer ${apiKey}`);
      expect(res.status).toBe(200);
      expect(res.body.pipelines).toBeDefined();
    });
  });

  describe('POST /pipelines', () => {
    it('creates a pipeline', async () => {
      const res = await request(app)
        .post('/pipelines')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          name: 'Test Pipeline',
          programs: ['PUMP_BONDING_CURVE'],
          filter: { instructions: ['TradeEvent'] },
          transform: { mode: 'template', template: 'trade' },
          destinations: { websocket: { enabled: true } }
        });
      expect(res.status).toBe(201);
      expect(res.body.pipeline.id).toBeDefined();
      expect(res.body.pipeline.name).toBe('Test Pipeline');
      expect(res.body.pipeline.status).toBe('active');
      pipelineId = res.body.pipeline.id;
    });

    it('returns 400 without programs', async () => {
      const res = await request(app)
        .post('/pipelines')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'Bad Pipeline' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /pipelines/:id', () => {
    it('returns a specific pipeline', async () => {
      const res = await request(app)
        .get(`/pipelines/${pipelineId}`)
        .set('Authorization', `Bearer ${apiKey}`);
      expect(res.status).toBe(200);
      expect(res.body.pipeline.id).toBe(pipelineId);
    });

    it('returns 404 for non-existent pipeline', async () => {
      const res = await request(app)
        .get('/pipelines/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${apiKey}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /pipelines/:id', () => {
    it('updates a pipeline', async () => {
      const res = await request(app)
        .patch(`/pipelines/${pipelineId}`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ name: 'Updated Pipeline' });
      expect(res.status).toBe(200);
      expect(res.body.pipeline.name).toBe('Updated Pipeline');
    });
  });

  describe('POST /pipelines/:id/pause', () => {
    it('pauses a pipeline', async () => {
      const res = await request(app)
        .post(`/pipelines/${pipelineId}/pause`)
        .set('Authorization', `Bearer ${apiKey}`);
      expect(res.status).toBe(200);
      expect(res.body.pipeline.status).toBe('paused');
    });
  });

  describe('POST /pipelines/:id/resume', () => {
    it('resumes a pipeline', async () => {
      const res = await request(app)
        .post(`/pipelines/${pipelineId}/resume`)
        .set('Authorization', `Bearer ${apiKey}`);
      expect(res.status).toBe(200);
      expect(res.body.pipeline.status).toBe('active');
    });
  });

  describe('DELETE /pipelines/:id', () => {
    it('deletes a pipeline', async () => {
      const res = await request(app)
        .delete(`/pipelines/${pipelineId}`)
        .set('Authorization', `Bearer ${apiKey}`);
      expect(res.status).toBe(204);
    });

    it('returns 404 after deletion', async () => {
      const res = await request(app)
        .get(`/pipelines/${pipelineId}`)
        .set('Authorization', `Bearer ${apiKey}`);
      expect(res.status).toBe(404);
    });
  });

  describe('404 handling', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await request(app).get('/unknown-route');
      expect(res.status).toBe(404);
    });
  });
});
