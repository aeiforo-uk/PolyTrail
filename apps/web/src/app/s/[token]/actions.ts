'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { saveDraft, submitAnswers } from '@/lib/data-requests/portal';
import { clientKey, rateLimit } from '@/lib/security/rate-limit';

/**
 * The two things a supplier can do, as one server action.
 *
 * `<form action={answer}>` submits without JavaScript, so the button carries
 * the intent. Everything ends in a redirect rather than a returned state
 * object, because a returned state needs `useActionState`, and that needs a
 * client component, and the whole point of this page is that it works on a
 * seven-year-old Android handset on a shared 3G connection.
 */
export async function answer(token: string, form: FormData): Promise<void> {
  const requestHeaders = await headers();
  const key = clientKey(new Request('http://portal.local', { headers: requestHeaders }), 'portal:write');

  if (!rateLimit(key, 30, 60_000).ok) {
    redirect(`/s/${token}?busy=1`);
  }

  const submitting = String(form.get('intent') ?? '') === 'submit';

  if (!submitting) {
    const saved = await saveDraft(token, form);
    redirect(saved.ok ? `/s/${token}?saved=1` : `/s/${token}`);
  }

  const result = await submitAnswers(token, form, {
    ip: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: requestHeaders.get('user-agent'),
  });

  // Invalid answers are already saved by `submitAnswers`, so bouncing back
  // costs the supplier nothing they typed. The page recomputes which fields
  // are wrong from the stored values.
  redirect(result.ok ? `/s/${token}?done=1` : `/s/${token}?invalid=1`);
}

/** Autosave. Called by the client island; silent on failure by design. */
export async function autosave(token: string, form: FormData): Promise<{ savedAt: string | null }> {
  const requestHeaders = await headers();
  const key = clientKey(
    new Request('http://portal.local', { headers: requestHeaders }),
    'portal:autosave',
  );
  if (!rateLimit(key, 60, 60_000).ok) return { savedAt: null };

  const result = await saveDraft(token, form);
  return { savedAt: result.savedAt ?? null };
}
