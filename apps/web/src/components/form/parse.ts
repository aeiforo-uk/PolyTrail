/**
 * Form data → passport payload.
 *
 * The editor posts ordinary HTML forms, so the browser hands the server a flat
 * list of strings and the nesting has to be reconstructed. Rather than keep a
 * second description of the payload shape on the server, every input names the
 * path it writes and the kind it should be read back as — a field cannot drift
 * away from the schema without its `name` changing with it.
 */

export type FieldKind = 'text' | 'upper' | 'num' | 'bool' | 'multi' | 'list';

/** The `name` attribute for an input that writes `path`. */
export function fieldName(path: string, kind: FieldKind = 'text'): string {
  return kind === 'text' ? path : `${path}:${kind}`;
}

/**
 * Keys beginning with an underscore are form machinery — the change reason,
 * the list of sections this form owns — and never passport content.
 */
export function parseFormPayload(formData: FormData): Record<string, unknown> {
  const root: Record<string, unknown> = {};

  for (const [rawKey, rawValue] of formData.entries()) {
    if (rawKey.startsWith('_') || typeof rawValue !== 'string') continue;

    const marker = rawKey.lastIndexOf(':');
    const path = marker === -1 ? rawKey : rawKey.slice(0, marker);
    const kind = (marker === -1 ? 'text' : rawKey.slice(marker + 1)) as FieldKind;

    const value = coerce(rawValue, kind);
    if (value === undefined) continue;

    assign(root, path.split('.'), value, kind === 'multi');
  }

  return (prune(root) as Record<string, unknown> | undefined) ?? {};
}

function coerce(raw: string, kind: FieldKind): unknown {
  const value = raw.trim();

  switch (kind) {
    case 'bool':
      return value === 'true' || value === 'on';
    case 'num': {
      if (value === '') return undefined;
      const parsed = Number(value);
      // A value that is not a number goes through as typed so Zod reports it
      // on the field. Swallowing it would lose the user's work silently.
      return Number.isFinite(parsed) ? parsed : raw;
    }
    case 'list': {
      const items = value.split(',').map((part) => part.trim()).filter(Boolean);
      return items.length ? items : undefined;
    }
    case 'upper':
      return value === '' ? undefined : value.toUpperCase();
    default:
      return value === '' ? undefined : value;
  }
}

function assign(root: Record<string, unknown>, segments: string[], value: unknown, accumulate: boolean) {
  let cursor: Record<string, unknown> = root;

  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i]!;
    const childIsIndexed = /^\d+$/.test(segments[i + 1]!);
    if (cursor[key] == null) cursor[key] = childIsIndexed ? [] : {};
    cursor = cursor[key] as Record<string, unknown>;
  }

  const leaf = segments[segments.length - 1]!;
  if (accumulate) {
    const existing = cursor[leaf];
    cursor[leaf] = Array.isArray(existing) ? [...existing, value] : [value];
  } else {
    // Last write wins, which is what makes the hidden `false` sitting in front
    // of a checkbox work: an unticked box leaves the false in place.
    cursor[leaf] = value;
  }
}

/**
 * Drop everything the user left blank.
 *
 * Without this, a section the user opened and did not fill would post empty
 * objects — `{ repair: {} }`, `{ pef: {} }` — and Zod would reject the save for
 * fields nobody asked them for. Removing a row client-side also leaves a hole
 * in the index sequence, which is pruned here rather than renumbered in the
 * browser.
 */
function prune(value: unknown): unknown {
  if (Array.isArray(value)) {
    const rows = value.map(prune).filter((row) => row !== undefined);
    return rows.length ? rows : undefined;
  }

  if (value && typeof value === 'object') {
    const kept: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const pruned = prune(child);
      if (pruned !== undefined) kept[key] = pruned;
    }
    return Object.keys(kept).length ? kept : undefined;
  }

  return value === '' ? undefined : value;
}
