'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The link is rendered as selectable text by the server; this only adds a
 * one-click copy. With scripting off the text is still there to select, which
 * matters because this link is the only way the supplier gets in.
 */
export function CopyLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard access is blocked in some embedded browsers; the text is
          // on screen either way, so there is nothing useful to report.
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  );
}
