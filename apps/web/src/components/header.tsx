'use client';

import { useState, useEffect } from 'react';
import { isAuthenticated, clearApiKey } from '@/lib/api';

interface HeaderProps {
  title: string;
  action?: React.ReactNode;
}

export function Header({ title, action }: HeaderProps) {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    setAuthenticated(isAuthenticated());
  }, []);

  return (
    <header className="h-14 border-b border-[var(--border)] bg-[var(--background)] flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-3">
        {action}
        {authenticated && (
          <button
            onClick={() => {
              clearApiKey();
              window.location.href = '/';
            }}
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
          >
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}
