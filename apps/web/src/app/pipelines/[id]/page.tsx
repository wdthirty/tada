'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { Button } from '@/components/button';
import { Card, CardHeader, CardContent } from '@/components/card';
import { Badge } from '@/components/badge';
import { LiveEvents } from '@/components/live-events';
import { getPipeline, updatePipeline, deletePipeline, pausePipeline, resumePipeline, type Pipeline } from '@/lib/api';

export default function PipelineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    loadPipeline();
  }, [id]);

  const loadPipeline = async () => {
    try {
      const data = await getPipeline(id);
      setPipeline(data);
      setName(data.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!pipeline) return;
    setSaving(true);
    try {
      const updated = await updatePipeline(id, { name });
      setPipeline(updated);
      setEditMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save pipeline');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!pipeline) return;
    try {
      const updated = pipeline.status === 'active'
        ? await pausePipeline(id)
        : await resumePipeline(id);
      setPipeline(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update pipeline');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this pipeline?')) return;
    try {
      await deletePipeline(id);
      router.push('/pipelines');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete pipeline');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Active</Badge>;
      case 'paused':
        return <Badge variant="warning">Paused</Badge>;
      case 'error':
        return <Badge variant="error">Error</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <>
        <Header title="Pipeline" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[var(--muted)]">Loading...</div>
        </div>
      </>
    );
  }

  if (!pipeline) {
    return (
      <>
        <Header title="Pipeline" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[var(--error)]">{error || 'Pipeline not found'}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title={pipeline.name}
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleToggleStatus}>
              {pipeline.status === 'active' ? 'Pause' : 'Resume'}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDelete} className="text-[var(--error)]">
              Delete
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {error && (
            <div className="p-3 bg-[var(--error)]/10 text-[var(--error)] rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Overview */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h2 className="font-semibold">Overview</h2>
              {getStatusBadge(pipeline.status)}
            </CardHeader>
            <CardContent className="space-y-4">
              {editMode ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                  />
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditMode(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-[var(--muted)]">Name</div>
                    <div className="font-medium">{pipeline.name}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setEditMode(true)}>
                    Edit
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[var(--border)]">
                <div>
                  <div className="text-sm text-[var(--muted)]">Created</div>
                  <div className="text-sm">{new Date(pipeline.createdAt).toLocaleDateString()}</div>
                </div>
                <div>
                  <div className="text-sm text-[var(--muted)]">Updated</div>
                  <div className="text-sm">{new Date(pipeline.updatedAt).toLocaleDateString()}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Programs */}
          <Card>
            <CardHeader>
              <h2 className="font-semibold">Programs</h2>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {pipeline.programs.map((program) => (
                  <Badge key={program}>{program}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Filter */}
          <Card>
            <CardHeader>
              <h2 className="font-semibold">Filter</h2>
            </CardHeader>
            <CardContent>
              <pre className="text-sm bg-[var(--border)]/30 p-4 rounded-lg overflow-auto">
                {JSON.stringify(pipeline.filter, null, 2) || '{}'}
              </pre>
            </CardContent>
          </Card>

          {/* Transform */}
          <Card>
            <CardHeader>
              <h2 className="font-semibold">Transform</h2>
            </CardHeader>
            <CardContent>
              <pre className="text-sm bg-[var(--border)]/30 p-4 rounded-lg overflow-auto">
                {JSON.stringify(pipeline.transform, null, 2)}
              </pre>
            </CardContent>
          </Card>

          {/* Destinations */}
          <Card>
            <CardHeader>
              <h2 className="font-semibold">Destinations</h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(pipeline.destinations).map(([key, value]) => {
                  const dest = value as { enabled?: boolean };
                  return (
                    <div key={key} className="flex items-center justify-between p-3 bg-[var(--border)]/30 rounded-lg">
                      <div className="font-medium text-sm capitalize">{key}</div>
                      <Badge variant={dest?.enabled ? 'success' : 'default'}>
                        {dest?.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Live Events */}
          <LiveEvents
            pipelineId={pipeline.id}
            enabled={!!(pipeline.destinations.websocket as { enabled?: boolean })?.enabled}
          />

          {/* API Key */}
          <Card>
            <CardHeader>
              <h2 className="font-semibold">Pipeline ID</h2>
            </CardHeader>
            <CardContent>
              <code className="text-sm bg-[var(--border)]/30 px-3 py-2 rounded-lg block">
                {pipeline.id}
              </code>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
