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
  const [confirmModal, setConfirmModal] = useState<{ pipeline: Pipeline; action: 'pause' | 'delete' } | null>(null);
  const [confirmText, setConfirmText] = useState('');

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
    console.log('handleToggleStatus called', pipeline.status);
    if (pipeline.status === 'active') {
      // Require confirmation to pause
      console.log('Setting confirmModal');
      setConfirmModal({ pipeline, action: 'pause' });
      setConfirmText('');
      return;
    }
    // Resume doesn't need confirmation
    try {
      const updated = await resumePipeline(pipeline.id);
      setPipelines(pipelines.map(p => p.id === updated.id ? updated : p));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume pipeline');
    }
  };

  const handleDelete = async (pipeline: Pipeline) => {
    setConfirmModal({ pipeline, action: 'delete' });
    setConfirmText('');
  };

  const handleConfirmAction = async () => {
    if (!confirmModal || confirmText !== 'yes i do') return;

    try {
      if (confirmModal.action === 'pause') {
        const updated = await pausePipeline(confirmModal.pipeline.id);
        setPipelines(pipelines.map(p => p.id === updated.id ? updated : p));
      } else {
        await deletePipeline(confirmModal.pipeline.id);
        setPipelines(pipelines.filter(p => p.id !== confirmModal.pipeline.id));
      }
      setConfirmModal(null);
      setConfirmText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${confirmModal.action} pipeline`);
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
                      onClick={() => handleDelete(pipeline)}
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

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">
              {confirmModal.action === 'pause' ? 'Stop Pipeline?' : 'Delete Pipeline?'}
            </h3>
            <p className="text-[var(--muted)] mb-4">
              Are you sure you want to {confirmModal.action === 'pause' ? 'stop' : 'delete'}{' '}
              <span className="text-[var(--foreground)] font-medium">{confirmModal.pipeline.name}</span>?
              {confirmModal.action === 'delete' && ' This action cannot be undone.'}
            </p>
            <p className="text-sm text-[var(--muted)] mb-3">
              Type <span className="font-mono text-[var(--foreground)]">yes i do</span> to confirm:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="yes i do"
              className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirmModal(null);
                  setConfirmText('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant={confirmModal.action === 'delete' ? 'primary' : 'primary'}
                onClick={handleConfirmAction}
                disabled={confirmText !== 'yes i do'}
                className={confirmModal.action === 'delete' ? 'bg-[var(--error)] hover:bg-[var(--error)]/90' : ''}
              >
                {confirmModal.action === 'pause' ? 'Stop Pipeline' : 'Delete Pipeline'}
              </Button>
            </div>
          </div>
        </div>
      )}
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
