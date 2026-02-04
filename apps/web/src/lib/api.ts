// API Client for Tada backend

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface Pipeline {
  id: string;
  name: string;
  apiKey: string;
  programs: string[];
  filter: Record<string, unknown>;
  transform: Record<string, unknown>;
  destinations: Record<string, unknown>;
  status: 'active' | 'paused' | 'error';
  createdAt: string;
  updatedAt: string;
}

export interface Program {
  id: string;
  name: string;
  address: string;
  category: string;
}

// Get API key from localStorage
function getApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('tada_api_key');
}

// Set API key in localStorage
export function setApiKey(key: string): void {
  localStorage.setItem('tada_api_key', key);
}

// Clear API key
export function clearApiKey(): void {
  localStorage.removeItem('tada_api_key');
}

// Check if authenticated
export function isAuthenticated(): boolean {
  return !!getApiKey();
}

// Fetch with auth
async function fetchWithAuth(path: string, options: RequestInit = {}) {
  const apiKey = getApiKey();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────
// PUBLIC ENDPOINTS
// ─────────────────────────────────────────────────────────────

export async function getPrograms(): Promise<Program[]> {
  const data = await fetchWithAuth('/programs');
  return data.programs;
}

export async function createApiKey(name?: string): Promise<{ key: string; name: string }> {
  const data = await fetchWithAuth('/api-keys', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return data;
}

// ─────────────────────────────────────────────────────────────
// AUTHENTICATED ENDPOINTS
// ─────────────────────────────────────────────────────────────

export async function getPipelines(): Promise<Pipeline[]> {
  const data = await fetchWithAuth('/pipelines');
  return data.pipelines;
}

export async function getPipeline(id: string): Promise<Pipeline> {
  const data = await fetchWithAuth(`/pipelines/${id}`);
  return data.pipeline;
}

export async function createPipeline(pipeline: {
  name?: string;
  programs: string[];
  filter?: Record<string, unknown>;
  transform?: Record<string, unknown>;
  destinations: Record<string, unknown>;
}): Promise<Pipeline> {
  const data = await fetchWithAuth('/pipelines', {
    method: 'POST',
    body: JSON.stringify(pipeline),
  });
  return data.pipeline;
}

export async function updatePipeline(
  id: string,
  updates: Partial<{
    name: string;
    programs: string[];
    filter: Record<string, unknown>;
    transform: Record<string, unknown>;
    destinations: Record<string, unknown>;
  }>
): Promise<Pipeline> {
  const data = await fetchWithAuth(`/pipelines/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return data.pipeline;
}

export async function deletePipeline(id: string): Promise<void> {
  await fetchWithAuth(`/pipelines/${id}`, { method: 'DELETE' });
}

export async function pausePipeline(id: string): Promise<Pipeline> {
  const data = await fetchWithAuth(`/pipelines/${id}/pause`, { method: 'POST' });
  return data.pipeline;
}

export async function resumePipeline(id: string): Promise<Pipeline> {
  const data = await fetchWithAuth(`/pipelines/${id}/resume`, { method: 'POST' });
  return data.pipeline;
}
