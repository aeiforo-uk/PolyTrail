import type { PassportStatus } from '@/lib/passport/state';

/**
 * The status bar's action state. Separate from `actions.ts` because a
 * `'use server'` module may only export async functions.
 */
export interface TransitionState {
  status: 'idle' | 'done' | 'error';
  message?: string;
  /** Publication-gate failures, keyed by payload path. */
  errors?: Record<string, string[]>;
  to?: PassportStatus;
  at?: number;
}

export const IDLE_TRANSITION_STATE: TransitionState = { status: 'idle' };
