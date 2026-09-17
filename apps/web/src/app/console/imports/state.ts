/**
 * Form state for the import screens.
 *
 * Outside `actions.ts` because a `'use server'` module may only export async
 * functions. Types are erased and would be tolerated; the idle-state constant
 * is a real object and fails the production build.
 */
export interface UploadState {
  status: 'idle' | 'error';
  message?: string;
}

export const IDLE_UPLOAD_STATE: UploadState = { status: 'idle' };
