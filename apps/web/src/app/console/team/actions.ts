'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { ROLE_LABELS, isRole, type Role } from '@/lib/auth/roles';
import { recordAudit } from '@/lib/audit/record';
import { notifyUser } from '@/lib/notifications';
import {
  countOtherActiveAdmins,
  getMember,
  listMembers,
  softDeleteMember,
  updateMemberRole,
  updateMemberStatus,
} from '@/lib/team/members';
import {
  createInvitation,
  findPendingInvitation,
  invitationLink,
  revokeInvitation,
  sendInvitationEmail,
} from '@/lib/team/invitations';

/**
 * Team administration.
 *
 * Two rules run through all of it. An admin cannot act on their own row — the
 * only mistake on this screen that support cannot undo from the product is an
 * admin demoting or removing themselves — and the workspace must always keep
 * one active brand admin.
 */

export interface TeamState {
  error?: string;
  ok?: string;
  /** Present exactly once, right after an invite is created. Never stored. */
  inviteLink?: string;
  inviteEmail?: string;
}

async function requireAdmin() {
  const session = await getSession();
  if (!session?.tenantId || session.role !== 'BRAND_ADMIN') return null;
  return session;
}

function refresh() {
  revalidatePath('/console/team');
}

const inviteSchema = z.object({
  email: z.email('Enter a valid email address.'),
  role: z.string().refine(isRole, 'Choose a role.'),
  message: z.string().max(1000).optional(),
});

export async function inviteMember(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const session = await requireAdmin();
  if (!session?.tenantId) return { error: 'Only a brand admin can invite people.' };

  const parsed = inviteSchema.safeParse({
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    role: String(formData.get('role') ?? ''),
    message: String(formData.get('message') ?? ''),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }

  const { email, role, message } = parsed.data;

  const members = await listMembers(session.tenantId);
  if (members.some((member) => member.email === email)) {
    return { error: `${email} is already in this workspace.` };
  }

  if (await findPendingInvitation(session.tenantId, email)) {
    return {
      error: `${email} already has an invitation waiting. Revoke it first if you want to change the role.`,
    };
  }

  try {
    const invitation = await createInvitation({
      tenantId: session.tenantId,
      email,
      role: role as Role,
      invitedBy: session.userId,
      message,
    });

    await recordAudit({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorLabel: session.name,
      action: 'user.invited',
      subjectType: 'invitation',
      subjectId: invitation.id,
      metadata: { email, role, expiresAt: invitation.expiresAt.toISOString() },
    });

    const link = invitationLink(invitation.token);
    const emailed = await sendInvitationEmail({
      tenantId: session.tenantId,
      email,
      role: role as Role,
      link,
      invitedByName: session.name,
      expiresAt: invitation.expiresAt,
      message,
    });

    refresh();
    return {
      ok: emailed
        ? `Invitation emailed to ${email}. The link below is the same one, if you'd rather send it yourself.`
        : `Invitation created for ${email}, but the email could not be sent — share the link below yourself.`,
      inviteLink: link,
      inviteEmail: email,
    };
  } catch (error) {
    console.error('[team] invite failed', error);
    return { error: 'The invitation could not be created. Try again.' };
  }
}

/**
 * Resending mints a new token and retires the old one, because we store only
 * the hash and genuinely cannot reproduce the original link.
 */
export async function resendInvitation(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const session = await requireAdmin();
  if (!session?.tenantId) return { error: 'Only a brand admin can manage invitations.' };

  const id = String(formData.get('invitationId') ?? '');
  const revoked = await revokeInvitation(session.tenantId, id);
  if (!revoked) return { error: 'That invitation has already been used or withdrawn.' };

  const invitation = await createInvitation({
    tenantId: session.tenantId,
    email: revoked.email,
    role: revoked.role,
    invitedBy: session.userId,
  });

  await recordAudit({
    tenantId: session.tenantId,
    actorId: session.userId,
    actorLabel: session.name,
    action: 'user.invited',
    subjectType: 'invitation',
    subjectId: invitation.id,
    metadata: { email: revoked.email, role: revoked.role, replaces: id },
  });

  const link = invitationLink(invitation.token);
  const emailed = await sendInvitationEmail({
    tenantId: session.tenantId,
    email: revoked.email,
    role: revoked.role,
    link,
    invitedByName: session.name,
    expiresAt: invitation.expiresAt,
  });

  refresh();
  return {
    ok: emailed
      ? `New link emailed to ${revoked.email}. The previous one no longer works.`
      : `New link for ${revoked.email} — the email could not be sent, so share it yourself. The previous one no longer works.`,
    inviteLink: link,
    inviteEmail: revoked.email,
  };
}

export async function withdrawInvitation(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const session = await requireAdmin();
  if (!session?.tenantId) return { error: 'Only a brand admin can manage invitations.' };

  const id = String(formData.get('invitationId') ?? '');
  const revoked = await revokeInvitation(session.tenantId, id);
  if (!revoked) return { error: 'That invitation has already been used or withdrawn.' };

  await recordAudit({
    tenantId: session.tenantId,
    actorId: session.userId,
    actorLabel: session.name,
    action: 'user.removed',
    subjectType: 'invitation',
    subjectId: id,
    metadata: { email: revoked.email, role: revoked.role, outcome: 'revoked' },
  });

  refresh();
  return { ok: `Invitation for ${revoked.email} withdrawn.` };
}

export async function changeMemberRole(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const session = await requireAdmin();
  if (!session?.tenantId) return { error: 'Only a brand admin can change roles.' };

  const userId = String(formData.get('userId') ?? '');
  const role = String(formData.get('role') ?? '');
  if (!isRole(role)) return { error: 'Choose a role.' };

  if (userId === session.userId) {
    return { error: 'You cannot change your own role. Ask another admin to do it.' };
  }

  const member = await getMember(session.tenantId, userId);
  if (!member) return { error: 'That person is no longer in this workspace.' };
  if (member.role === role) return { ok: 'No change.' };

  if (member.role === 'BRAND_ADMIN' && (await countOtherActiveAdmins(session.tenantId, userId)) === 0) {
    return { error: 'This is the last brand admin. Promote someone else first.' };
  }

  await updateMemberRole(session.tenantId, userId, role);
  await recordAudit({
    tenantId: session.tenantId,
    actorId: session.userId,
    actorLabel: session.name,
    action: 'user.role_changed',
    subjectType: 'user',
    subjectId: userId,
    metadata: { email: member.email, from: member.role, to: role },
  });

  // The person whose permissions just changed hears it from the product, not
  // from a failed action three days later.
  await notifyUser(userId, {
    tenantId: session.tenantId,
    kind: 'team.role_changed',
    title: `Your role is now ${ROLE_LABELS[role]}`,
    body: `${session.name} changed your role from ${ROLE_LABELS[member.role as Role]} to ${ROLE_LABELS[role]}.`,
    severity: 'info',
  });

  refresh();
  return { ok: `${member.name} is now a ${role.toLowerCase().replace(/_/g, ' ')}.` };
}

export async function setMemberSuspended(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const session = await requireAdmin();
  if (!session?.tenantId) return { error: 'Only a brand admin can suspend people.' };

  const userId = String(formData.get('userId') ?? '');
  const suspend = String(formData.get('suspend') ?? '') === 'true';

  if (userId === session.userId) {
    return { error: 'You cannot suspend your own account.' };
  }

  const member = await getMember(session.tenantId, userId);
  if (!member) return { error: 'That person is no longer in this workspace.' };

  if (
    suspend &&
    member.role === 'BRAND_ADMIN' &&
    (await countOtherActiveAdmins(session.tenantId, userId)) === 0
  ) {
    return { error: 'This is the last active brand admin. The workspace would lock itself out.' };
  }

  await updateMemberStatus(session.tenantId, userId, suspend ? 'suspended' : 'active');
  await recordAudit({
    tenantId: session.tenantId,
    actorId: session.userId,
    actorLabel: session.name,
    action: 'user.role_changed',
    subjectType: 'user',
    subjectId: userId,
    metadata: {
      email: member.email,
      field: 'status',
      from: member.status,
      to: suspend ? 'suspended' : 'active',
    },
  });

  // Restoration is announced; suspension is not, because a suspended account
  // cannot sign in to read it and the audit log already carries the fact.
  if (!suspend) {
    await notifyUser(userId, {
      tenantId: session.tenantId,
      kind: 'team.access_restored',
      title: 'Your access has been restored',
      body: `${session.name} reactivated your account in this workspace.`,
      severity: 'info',
    });
  }

  refresh();
  return {
    ok: suspend
      ? `${member.name} can no longer sign in.`
      : `${member.name} can sign in again.`,
  };
}

export async function removeMember(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const session = await requireAdmin();
  if (!session?.tenantId) return { error: 'Only a brand admin can remove people.' };

  const userId = String(formData.get('userId') ?? '');
  if (userId === session.userId) {
    return { error: 'You cannot remove your own account.' };
  }

  const member = await getMember(session.tenantId, userId);
  if (!member) return { error: 'That person is no longer in this workspace.' };

  if (member.role === 'BRAND_ADMIN' && (await countOtherActiveAdmins(session.tenantId, userId)) === 0) {
    return { error: 'This is the last brand admin. Promote someone else first.' };
  }

  await softDeleteMember(session.tenantId, userId);
  await recordAudit({
    tenantId: session.tenantId,
    actorId: session.userId,
    actorLabel: session.name,
    action: 'user.removed',
    subjectType: 'user',
    subjectId: userId,
    metadata: { email: member.email, role: member.role },
  });

  refresh();
  return {
    ok: `${member.name} has been removed. Their name stays on the passports and audit entries they touched.`,
  };
}
