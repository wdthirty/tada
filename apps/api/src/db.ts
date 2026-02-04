// Database Client (Supabase)
// Simple wrapper for pipeline CRUD operations

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Pipeline, CreatePipelineRequest, UpdatePipelineRequest, ProgramId } from '@tada/shared';

// Supabase client (singleton)
let supabase: SupabaseClient | null = null;

/**
 * Initialize Supabase client
 */
export function initDb(): SupabaseClient {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
  }

  supabase = createClient(url, key);
  return supabase;
}

/**
 * Get database client
 */
export function getDb(): SupabaseClient {
  if (!supabase) {
    return initDb();
  }
  return supabase;
}

// ─────────────────────────────────────────────────────────────
// API KEY OPERATIONS
// ─────────────────────────────────────────────────────────────

export interface ApiKey {
  key: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
}

/**
 * Validate an API key
 */
export async function validateApiKey(key: string): Promise<boolean> {
  const db = getDb();
  const { data, error } = await db
    .from('api_keys')
    .select('key')
    .eq('key', key)
    .single();

  if (error || !data) return false;

  // Update last used timestamp
  await db
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('key', key);

  return true;
}

/**
 * Create a new API key
 */
export async function createApiKey(name?: string): Promise<ApiKey | null> {
  const db = getDb();
  const key = generateApiKey();

  const { data, error } = await db
    .from('api_keys')
    .insert({ key, name })
    .select()
    .single();

  if (error) {
    console.error('[DB] Failed to create API key:', error);
    return null;
  }

  return data;
}

/**
 * Generate a random API key
 */
function generateApiKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'tada_';
  for (let i = 0; i < 32; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

// ─────────────────────────────────────────────────────────────
// PIPELINE OPERATIONS
// ─────────────────────────────────────────────────────────────

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
 * Get all pipelines for an API key
 */
export async function getPipelines(apiKey: string): Promise<Pipeline[]> {
  const db = getDb();
  const { data, error } = await db
    .from('pipelines')
    .select('*')
    .eq('api_key', apiKey)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[DB] Failed to get pipelines:', error);
    return [];
  }

  return (data || []).map(toPipeline);
}

/**
 * Get a single pipeline by ID
 */
export async function getPipeline(id: string, apiKey: string): Promise<Pipeline | null> {
  const db = getDb();
  const { data, error } = await db
    .from('pipelines')
    .select('*')
    .eq('id', id)
    .eq('api_key', apiKey)
    .single();

  if (error || !data) return null;

  return toPipeline(data);
}

/**
 * Create a new pipeline
 */
export async function createPipeline(
  apiKey: string,
  request: CreatePipelineRequest
): Promise<Pipeline | null> {
  const db = getDb();

  const { data, error } = await db
    .from('pipelines')
    .insert({
      api_key: apiKey,
      name: request.name || null,
      programs: request.programs,
      filter: request.filter || {},
      transform: request.transform || { mode: 'template', template: 'raw' },
      destinations: request.destinations,
      status: 'active',
    })
    .select()
    .single();

  if (error) {
    console.error('[DB] Failed to create pipeline:', error);
    return null;
  }

  return toPipeline(data);
}

/**
 * Update a pipeline
 */
export async function updatePipeline(
  id: string,
  apiKey: string,
  request: UpdatePipelineRequest
): Promise<Pipeline | null> {
  const db = getDb();

  const update: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (request.name !== undefined) update.name = request.name;
  if (request.programs !== undefined) update.programs = request.programs;
  if (request.filter !== undefined) update.filter = request.filter;
  if (request.transform !== undefined) update.transform = request.transform;
  if (request.destinations !== undefined) update.destinations = request.destinations;

  const { data, error } = await db
    .from('pipelines')
    .update(update)
    .eq('id', id)
    .eq('api_key', apiKey)
    .select()
    .single();

  if (error) {
    console.error('[DB] Failed to update pipeline:', error);
    return null;
  }

  return toPipeline(data);
}

/**
 * Delete a pipeline
 */
export async function deletePipeline(id: string, apiKey: string): Promise<boolean> {
  const db = getDb();

  const { error } = await db
    .from('pipelines')
    .delete()
    .eq('id', id)
    .eq('api_key', apiKey);

  if (error) {
    console.error('[DB] Failed to delete pipeline:', error);
    return false;
  }

  return true;
}

/**
 * Pause/resume a pipeline
 */
export async function setPipelineStatus(
  id: string,
  apiKey: string,
  status: 'active' | 'paused'
): Promise<Pipeline | null> {
  const db = getDb();

  const { data, error } = await db
    .from('pipelines')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('api_key', apiKey)
    .select()
    .single();

  if (error) {
    console.error('[DB] Failed to update pipeline status:', error);
    return null;
  }

  return toPipeline(data);
}

/**
 * Get all active pipelines (for Pipeline Engine sync)
 */
export async function getAllActivePipelines(): Promise<Pipeline[]> {
  const db = getDb();
  const { data, error } = await db
    .from('pipelines')
    .select('*')
    .eq('status', 'active');

  if (error) {
    console.error('[DB] Failed to get active pipelines:', error);
    return [];
  }

  return (data || []).map(toPipeline);
}
