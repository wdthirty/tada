'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/button';
import { createApiKey, setApiKey, isAuthenticated } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [existingKey, setExistingKey] = useState('');

  useEffect(() => {
    if (isAuthenticated()) {
      router.push('/pipelines');
    }
  }, [router]);

  const handleCreateKey = async () => {
    setLoading(true);
    setError('');
    try {
      const { key } = await createApiKey('Dashboard');
      setApiKey(key);
      router.push('/pipelines');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setLoading(false);
    }
  };

  const handleUseExistingKey = () => {
    if (!existingKey.trim()) {
      setError('Please enter an API key');
      return;
    }
    setApiKey(existingKey.trim());
    router.push('/pipelines');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--accent)] mb-6">
            <span className="text-white font-bold text-3xl">T</span>
          </div>
          <h1 className="text-3xl font-bold">Tada</h1>
          <p className="text-[var(--muted)] mt-2">
            Real-time Solana data, anywhere
          </p>
        </div>

        {/* Auth options */}
        <div className="space-y-4">
          <div className="border border-[var(--border)] rounded-xl p-6 space-y-4">
            <h2 className="font-medium">Get Started</h2>
            <Button
              onClick={handleCreateKey}
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Creating...' : 'Create New API Key'}
            </Button>
            <p className="text-xs text-[var(--muted)] text-center">
              Creates a new API key for your pipelines
            </p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border)]"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-[var(--background)] text-[var(--muted)]">or</span>
            </div>
          </div>

          <div className="border border-[var(--border)] rounded-xl p-6 space-y-4">
            <h2 className="font-medium">Use Existing Key</h2>
            <input
              type="text"
              value={existingKey}
              onChange={(e) => setExistingKey(e.target.value)}
              placeholder="tada_..."
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
            />
            <Button
              onClick={handleUseExistingKey}
              variant="secondary"
              className="w-full"
            >
              Continue
            </Button>
          </div>

          {error && (
            <p className="text-sm text-[var(--error)] text-center">{error}</p>
          )}
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-4 pt-4">
          <div className="text-center">
            <div className="text-2xl mb-1">6</div>
            <div className="text-xs text-[var(--muted)]">Programs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl mb-1">4</div>
            <div className="text-xs text-[var(--muted)]">Destinations</div>
          </div>
          <div className="text-center">
            <div className="text-2xl mb-1">&lt;100ms</div>
            <div className="text-xs text-[var(--muted)]">Latency</div>
          </div>
        </div>
      </div>
    </div>
  );
}
