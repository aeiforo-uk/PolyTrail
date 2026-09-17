'use client';

import { Toaster as Sonner } from 'sonner';
import { useTheme } from 'next-themes';

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'bg-surface text-ink border border-line shadow-md rounded-md font-sans text-sm',
          description: 'text-ink-muted',
        },
      }}
    />
  );
}
