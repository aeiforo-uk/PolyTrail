import { basisFor, entryFor } from './registry';

/** What a section save reports back through `useActionState`. */
export interface SaveState {
  status: 'idle' | 'saved' | 'unchanged' | 'error';
  message?: string;
  /** Field-level issues keyed by payload path, straight off `ApiError.errors`. */
  errors?: Record<string, string[]>;
  version?: number;
  /** Changes on every save so the confirmation re-announces itself. */
  at?: number;
}

export const IDLE_SAVE_STATE: SaveState = { status: 'idle' };

export type SectionAction = (state: SaveState, formData: FormData) => Promise<SaveState>;

/**
 * Everything a field needs to render itself, derived once per section.
 *
 * Passing this rather than a dozen props per input is what keeps a section
 * file readable: a field states its path, and its current value, its error, its
 * regulatory basis and its label all follow from that.
 */
export interface FieldHelpers {
  value: (path: string) => unknown;
  error: (path: string) => string | null;
  /** Why publication would currently be refused on this field. */
  gate: (path: string) => string | null;
  basis: (path: string) => string | undefined;
  required: (path: string) => boolean;
  readOnly: boolean;
}

export function valueAt(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cursor, key) => {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    return (cursor as Record<string, unknown>)[key];
  }, source);
}

export function createHelpers(options: {
  payload: unknown;
  errors?: Record<string, string[]>;
  gate?: Record<string, string[]>;
  readOnly: boolean;
}): FieldHelpers {
  const { payload, errors, gate, readOnly } = options;
  return {
    value: (path) => valueAt(payload, path),
    error: (path) => errors?.[path]?.[0] ?? null,
    gate: (path) => gate?.[path]?.[0] ?? null,
    basis: basisFor,
    required: (path) => entryFor(path)?.required ?? false,
    readOnly,
  };
}
