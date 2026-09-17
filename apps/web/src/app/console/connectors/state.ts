import type { TestResult } from '@/lib/connectors/types';

/**
 * Form state shapes for the connector screens.
 *
 * These live outside `actions.ts` because a `'use server'` module may only
 * export async functions — a plain object export there fails the production
 * build with an error that does not name the offending symbol. Types alone are
 * erased and would be fine; the idle-state constant is not.
 */
export interface ConnectorFormState {
  status: 'idle' | 'error';
  message?: string;
  errors?: Record<string, string[]>;
}

export const IDLE_CONNECTOR_STATE: ConnectorFormState = { status: 'idle' };

export interface TestState {
  ran: boolean;
  result?: TestResult;
  message?: string;
}

export interface PullState {
  ok: boolean;
  message?: string;
  jobId?: string;
  rows?: number;
}
