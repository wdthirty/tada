// Pipeline Loader
// Loads pipelines from Supabase and keeps them in sync with Pipeline Engine
// Polls for changes every 30 seconds

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Pipeline, ProgramId } from '@tada/shared';

// Supabase client
let supabase: SupabaseClient | null = null;

// Pipeline engine reference
let pipelineEngine: any = null;

// Polling interval
const POLL_INTERVAL_MS = 30_000; // 30 seconds
let pollTimer: NodeJS.Timeout | null = null;

// Track loaded pipelines for change detection
let loadedPipelineIds = new Set<string>();

interface DbPipeline {
  id: string;
  api_key: string;
  name: string | null;
  programs: string[];
  filter: Record<string, any>;
  transform: Record<string, any>;
  destinations: Record<string, any>;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Convert DB row to Pipeline type
 */
function toPipeline(row: DbPipeline): Pipeline {
  return {
    id: row.id,
    name: row.name || `Pipeline ${row.id.slice(0, 8)}`,
    apiKey: row.api_key,
    programs: row.programs as ProgramId[],
    filter: row.filter as Pipeline['filter'],
    transform: row.transform as Pipeline['transform'],
    destinations: row.destinations as Pipeline['destinations'],
    status: row.status as Pipeline['status'],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Initialize Supabase client
 */
function initSupabase(): SupabaseClient | null {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn('[PipelineLoader] SUPABASE_URL and SUPABASE_ANON_KEY not set');
    return null;
  }

  supabase = createClient(url, key);
  return supabase;
}

/**
 * Load all active pipelines from Supabase
 */
async function loadPipelinesFromDb(): Promise<Pipeline[]> {
  const db = initSupabase();
  if (!db) return [];

  const { data, error } = await db
    .from('pipelines')
    .select('*')
    .eq('status', 'active');

  if (error) {
    console.error('[PipelineLoader] Failed to load pipelines:', error);
    return [];
  }

  return (data || []).map(toPipeline);
}

/**
 * Sync pipelines from database to engine
 */
async function syncPipelines(): Promise<void> {
  if (!pipelineEngine) return;

  const dbPipelines = await loadPipelinesFromDb();
  const dbPipelineIds = new Set(dbPipelines.map(p => p.id));

  // Add/update pipelines
  for (const pipeline of dbPipelines) {
    pipelineEngine.upsertPipeline(pipeline);
  }

  // Remove pipelines that no longer exist or are no longer active
  for (const id of loadedPipelineIds) {
    if (!dbPipelineIds.has(id)) {
      pipelineEngine.removePipeline(id);
      console.log(`[PipelineLoader] Removed pipeline: ${id}`);
    }
  }

  loadedPipelineIds = dbPipelineIds;

  if (dbPipelines.length > 0) {
    console.log(`[PipelineLoader] Synced ${dbPipelines.length} active pipelines`);
  }
}

/**
 * Start periodic polling for pipeline changes
 */
function startPolling(): void {
  if (pollTimer) return;

  pollTimer = setInterval(async () => {
    await syncPipelines();
  }, POLL_INTERVAL_MS);

  console.log(`[PipelineLoader] Polling for changes every ${POLL_INTERVAL_MS / 1000}s`);
}

/**
 * Stop polling
 */
function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/**
 * Initialize pipeline loader
 * - Connects to Supabase
 * - Loads initial pipelines
 * - Starts polling for changes
 */
export async function initPipelineLoader(engine: any): Promise<number> {
  pipelineEngine = engine;

  const db = initSupabase();
  if (!db) {
    console.warn('[PipelineLoader] Supabase not configured, no pipelines will be loaded');
    return 0;
  }

  // Load initial pipelines
  await syncPipelines();

  // Start polling for changes
  startPolling();

  return loadedPipelineIds.size;
}

/**
 * Shutdown pipeline loader
 */
export function shutdownPipelineLoader(): void {
  stopPolling();
  console.log('[PipelineLoader] Shutdown');
}

/**
 * Force refresh pipelines
 */
export async function refreshPipelines(): Promise<number> {
  await syncPipelines();
  return loadedPipelineIds.size;
}

/**
 * Get loaded pipeline count
 */
export function getLoadedPipelineCount(): number {
  return loadedPipelineIds.size;
}
