/**
 * The create form's action state.
 *
 * Kept out of `actions.ts` because a `'use server'` module may only export
 * async functions — anything else in there becomes a server reference.
 */
export interface CreateState {
  status: 'idle' | 'error';
  message?: string;
  errors?: Record<string, string[]>;
}

export const IDLE_CREATE_STATE: CreateState = { status: 'idle' };
