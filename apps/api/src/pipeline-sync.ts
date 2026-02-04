// Pipeline Sync
// Syncs pipelines between API (Supabase) and Pipeline Engine
// Enables real-time event delivery to user pipelines

import type { Pipeline } from '@tada/shared';

// Pipeline engine reference (loaded dynamically)
let pipelineEngine: any = null;

/**
 * Initialize the pipeline engine integration
 * Returns true if successfully connected
 */
export async function initPipelineEngine(): Promise<boolean> {
  try {
    const { engine } = await import('@tada/pipeline');
    pipelineEngine = engine;
    console.log('[PipelineSync] Pipeline Engine connected');
    return true;
  } catch (error) {
    console.warn('[PipelineSync] Pipeline Engine not available:', error);
    return false;
  }
}

/**
 * Register a pipeline with the engine
 */
export function registerPipeline(pipeline: Pipeline): void {
  if (!pipelineEngine) {
    console.warn('[PipelineSync] Engine not initialized, skipping registration');
    return;
  }

  pipelineEngine.upsertPipeline(pipeline);
  console.log(`[PipelineSync] Registered pipeline: ${pipeline.id} (${pipeline.name})`);
}

/**
 * Update a pipeline in the engine
 */
export function updatePipelineInEngine(pipeline: Pipeline): void {
  if (!pipelineEngine) return;
  pipelineEngine.upsertPipeline(pipeline);
}

/**
 * Remove a pipeline from the engine
 */
export function removePipelineFromEngine(pipelineId: string): void {
  if (!pipelineEngine) return;
  pipelineEngine.removePipeline(pipelineId);
  console.log(`[PipelineSync] Removed pipeline: ${pipelineId}`);
}

/**
 * Get engine status
 */
export function getEngineStatus(): { connected: boolean; pipelineCount: number } {
  if (!pipelineEngine) {
    return { connected: false, pipelineCount: 0 };
  }
  return {
    connected: true,
    pipelineCount: pipelineEngine.getAllPipelines().length,
  };
}
