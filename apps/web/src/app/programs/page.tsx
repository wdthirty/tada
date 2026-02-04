'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/header';
import { Card, CardContent } from '@/components/card';
import { Badge } from '@/components/badge';
import { getPrograms, type Program } from '@/lib/api';

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPrograms();
  }, []);

  const loadPrograms = async () => {
    try {
      const data = await getPrograms();
      setPrograms(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load programs');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'Pre-migration':
        return <Badge variant="warning">Pre-migration</Badge>;
      case 'Post-migration':
        return <Badge variant="success">Post-migration</Badge>;
      default:
        return <Badge>{category}</Badge>;
    }
  };

  return (
    <>
      <Header title="Programs" />

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
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {programs.map((program) => (
              <Card key={program.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold">{program.name}</h3>
                      <p className="text-xs text-[var(--muted)] mt-1">{program.id}</p>
                    </div>
                    {getCategoryBadge(program.category)}
                  </div>
                  <div className="mt-4">
                    <div className="text-xs text-[var(--muted)] mb-1">Program Address</div>
                    <code className="text-xs bg-[var(--border)]/50 px-2 py-1 rounded block truncate">
                      {program.address}
                    </code>
                  </div>
                  <a
                    href={`https://solscan.io/account/${program.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                  >
                    View on Solscan
                    <ExternalLinkIcon className="w-3 h-3" />
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Info */}
        <div className="mt-8 p-4 bg-[var(--border)]/30 rounded-xl">
          <h3 className="font-medium mb-2">About Programs</h3>
          <p className="text-sm text-[var(--muted)]">
            Tada monitors these Solana programs in real-time. <strong>Pre-migration</strong> programs
            are bonding curve protocols where tokens are created and traded until they reach a threshold.
            <strong> Post-migration</strong> programs are AMMs where tokens trade after graduating from
            the bonding curve.
          </p>
        </div>
      </div>
    </>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}
