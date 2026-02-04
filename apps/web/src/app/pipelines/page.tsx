'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Header } from '@/components/header';
import { Button } from '@/components/button';
import { Card, CardContent } from '@/components/card';
import { Badge } from '@/components/badge';
import { getPipelines, pausePipeline, resumePipeline, deletePipeline, type Pipeline } from '@/lib/api';

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPipelines();
  }, []);

  const loadPipelines = async () => {
    try {
      const data = await getPipelines();
      setPipelines(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pipelines');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (pipeline: Pipeline) => {
    try {
      const updated = pipeline.status === 'active'
        ? await pausePipeline(pipeline.id)
        : await resumePipeline(pipeline.id);
      setPipelines(pipelines.map(p => p.id === updated.id ? updated : p));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update pipeline');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this pipeline?')) return;
    try {
      await deletePipeline(id);
      setPipelines(pipelines.filter(p => p.id !== id));
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

  const getDestinationIcons = (destinations: Record<string, unknown>) => {
    const icons: string[] = [];
    if (destinations.discord && (destinations.discord as { enabled?: boolean }).enabled) icons.push('Discord');
    if (destinations.telegram && (destinations.telegram as { enabled?: boolean }).enabled) icons.push('Telegram');
    if (destinations.webhook && (destinations.webhook as { enabled?: boolean }).enabled) icons.push('Webhook');
    if (destinations.websocket && (destinations.websocket as { enabled?: boolean }).enabled) icons.push('WebSocket');
    return icons;
  };

  return (
    <>
      <Header
        title="Pipelines"
        action={
          <Link href="/pipelines/new">
            <Button size="sm">
              <PlusIcon className="w-4 h-4" />
              New Pipeline
            </Button>
          </Link>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4 p-3 bg-[var(--error)]/10 text-[var(--error)] rounded-lg text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-[var(--muted)]">Loading...</div>
          </div>
        ) : pipelines.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="text-[var(--muted)] mb-4">No pipelines yet</div>
              <Link href="/pipelines/new">
                <Button>Create your first pipeline</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pipelines.map((pipeline) => (
              <Card key={pipeline.id}>
                <CardContent className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <Link
                        href={`/pipelines/${pipeline.id}`}
                        className="font-medium hover:text-[var(--accent)] transition-colors"
                      >
                        {pipeline.name}
                      </Link>
                      {getStatusBadge(pipeline.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-[var(--muted)]">
                      <span>{pipeline.programs.length} program{pipeline.programs.length !== 1 ? 's' : ''}</span>
                      <span>{getDestinationIcons(pipeline.destinations).join(', ') || 'No destinations'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleStatus(pipeline)}
                    >
                      {pipeline.status === 'active' ? 'Pause' : 'Resume'}
                    </Button>
                    <Link href={`/pipelines/${pipeline.id}`}>
                      <Button variant="ghost" size="sm">Edit</Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(pipeline.id)}
                      className="text-[var(--error)] hover:text-[var(--error)]"
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}
