'use client';

import { useEffect, useRef, useState } from 'react';
import { autosave } from './actions';

/**
 * Autosave, as an enhancement and nothing more.
 *
 * The form works perfectly without this component: there is a Save button, and
 * submitting saves too. This exists because a supplier filling in thirty
 * fields on a phone will lose the tab at least once, and losing the typing is
 * what turns "I will do it later" into never.
 *
 * It reads the form with `new FormData(form)` rather than mirroring the inputs
 * into React state, so the fields stay uncontrolled and the page keeps
 * rendering correctly with scripting off.
 */
export function AutoSave({ token }: { token: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const form = marker.current?.closest('form');
    if (!form) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;

    async function save() {
      if (inFlight || !form) return;
      inFlight = true;
      setStatus('saving');
      try {
        const result = await autosave(token, new FormData(form));
        setSavedAt(result.savedAt);
        setStatus(result.savedAt ? 'saved' : 'failed');
      } catch {
        setStatus('failed');
      } finally {
        inFlight = false;
      }
    }

    function schedule() {
      clearTimeout(timer);
      // Long enough that typing a paragraph is one save, short enough that a
      // dropped connection costs at most a few sentences.
      timer = setTimeout(save, 4000);
    }

    // `pagehide` rather than `beforeunload`: mobile browsers routinely skip
    // `beforeunload` when a tab is swiped away or backgrounded.
    function onLeave() {
      clearTimeout(timer);
      void save();
    }

    form.addEventListener('input', schedule);
    form.addEventListener('change', schedule);
    window.addEventListener('pagehide', onLeave);

    return () => {
      clearTimeout(timer);
      form.removeEventListener('input', schedule);
      form.removeEventListener('change', schedule);
      window.removeEventListener('pagehide', onLeave);
    };
  }, [token]);

  return (
    <span ref={marker} className="text-xs text-ink-subtle" aria-live="polite">
      {status === 'saving' ? 'Saving…' : null}
      {status === 'saved' && savedAt
        ? `Saved at ${new Date(savedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
        : null}
      {status === 'failed' ? 'Could not save just now — your Save button still works.' : null}
    </span>
  );
}
