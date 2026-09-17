'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { setSessionCookie } from '@/lib/auth/session';
import { recordAuditSafe } from '@/lib/audit/record';
import { acceptInvitation } from '@/lib/team/invitations';

export interface AcceptState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const schema = z
  .object({
    token: z.string().min(1),
    name: z.string().trim().min(2, 'Enter your name as colleagues would write it.').max(255),
    password: z
      .string()
      .min(12, 'Use at least 12 characters. Length beats complexity.')
      .max(256, 'That is longer than we can hash sensibly.'),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    path: ['confirm'],
    message: 'The two passwords do not match.',
  });

/**
 * Redeem an invitation.
 *
 * Signs the person in on success rather than sending them to the login form,
 * because they have just proved they hold the token and typed a password —
 * asking them to type it again immediately is friction with no security value.
 */
export async function acceptInvite(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const parsed = schema.safeParse({
    token: String(formData.get('token') ?? ''),
    name: String(formData.get('name') ?? ''),
    password: String(formData.get('password') ?? ''),
    confirm: String(formData.get('confirm') ?? ''),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join('.')] = issue.message;
    }
    return { fieldErrors };
  }

  let account: Awaited<ReturnType<typeof acceptInvitation>>;
  try {
    account = await acceptInvitation(parsed.data);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'That invitation could not be accepted.',
    };
  }

  await recordAuditSafe({
    tenantId: account.tenantId,
    actorId: account.userId,
    actorLabel: account.name,
    action: 'user.invited',
    subjectType: 'user',
    subjectId: account.userId,
    metadata: { email: account.email, role: account.role, outcome: 'accepted' },
  });

  await setSessionCookie({
    userId: account.userId,
    tenantId: account.tenantId,
    role: account.role,
    email: account.email,
    name: account.name,
  });

  redirect('/console');
}
