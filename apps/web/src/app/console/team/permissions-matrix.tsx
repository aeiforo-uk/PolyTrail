import { Check, PenLine, ShieldCheck } from 'lucide-react';
import { ROLE_LABELS, type Role } from '@/lib/auth/roles';
import { buildPermissionMatrix, type PermissionRow } from '@/lib/team/permissions';
import { statusTone } from '@/components/viz/status-colour';
import type { PassportStatus } from '@/lib/passport/state';

/** Column headings have to fit. The full label stays on the cell's title. */
const SHORT: Record<Role, string> = {
  PLATFORM_ADMIN: 'Platform',
  BRAND_ADMIN: 'Admin',
  PRODUCT_MANAGER: 'Product',
  COMPLIANCE_OFFICER: 'Compliance',
  SUPPLIER: 'Supplier',
  CERTIFIER: 'Certifier',
  REPAIRER: 'Repairer',
  RECYCLER: 'Recycler',
  AUTHORITY: 'Authority',
};

/**
 * What each role may do to a passport.
 *
 * Read straight out of `TRANSITIONS`, so it cannot disagree with the state
 * machine that actually enforces it. If someone adds a transition, a row
 * appears here on the next deploy without anyone remembering to update a table.
 *
 * Drawn as a real matrix rather than as a list with badges: the question an
 * admin brings to this table is a comparison — "who else can publish if she is
 * away" — and a comparison down a column is the one thing a list cannot do.
 * Rows are grouped by the state the passport is in, because that is the order
 * the work happens in, and each group carries the state's own tone on its rail
 * so the pipeline is legible sideways as well as down.
 */
export function PermissionsMatrix() {
  const { roles, rows } = buildPermissionMatrix();

  const groups: Array<{ from: PassportStatus; label: string; rows: PermissionRow[] }> = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last && last.from === row.from) last.rows.push(row);
    else groups.push({ from: row.from, label: row.fromLabel, rows: [row] });
  }

  const totals = roles.map((role) => rows.filter((row) => row.roles.includes(role)).length);

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-ink">What each role can do</h2>
      <p className="mb-4 max-w-prose text-sm leading-relaxed text-ink-muted">
        Generated from the passport lifecycle itself, not written by hand, so it always matches what
        the system will actually allow. Rows are grouped by the state the passport is in when the
        action becomes available.
      </p>

      <ul className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-2xs text-ink-muted">
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="flex size-4 items-center justify-center rounded-xs bg-accent text-on-accent"
          >
            <Check className="size-2.5" />
          </span>
          Permitted
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-full bg-line-strong" />
          Refused
        </li>
        <li className="flex items-center gap-1.5">
          <PenLine className="size-3 text-ink-subtle" aria-hidden />
          Written reason required
        </li>
        <li className="flex items-center gap-1.5">
          <ShieldCheck className="size-3 text-ink-subtle" aria-hidden />
          Publication check runs first
        </li>
      </ul>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-3xl border-collapse text-left text-sm">
          <caption className="sr-only">
            Passport lifecycle actions by role. Each cell says whether that role may take that
            action.
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-surface px-4 py-3 text-xs font-medium text-ink-subtle"
              >
                Action
              </th>
              {roles.map((role) => (
                <th
                  key={role}
                  scope="col"
                  title={ROLE_LABELS[role]}
                  className="border-l border-line px-3 py-3 text-center text-xs font-medium whitespace-nowrap text-ink"
                >
                  {SHORT[role]}
                </th>
              ))}
            </tr>
          </thead>

          {groups.map((group) => (
            <tbody key={group.from} className="divide-y divide-line border-b border-line">
              <tr>
                <th
                  scope="colgroup"
                  colSpan={roles.length + 1}
                  className="sticky left-0 bg-surface-sunken/60 px-4 py-2 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-3 w-0.5 shrink-0 rounded-full"
                      style={{ background: statusTone(group.from) }}
                    />
                    <span className="eyebrow">While {group.label.toLowerCase()}</span>
                  </span>
                </th>
              </tr>

              {group.rows.map((row) => (
                <tr key={row.key} className="transition-colors duration-[140ms] hover:bg-surface-sunken/50 motion-reduce:transition-none">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-80 bg-surface px-4 py-3 text-left font-normal"
                  >
                    <span className="block text-sm font-medium text-ink">{row.action}</span>
                    <span className="block text-2xs text-ink-subtle">
                      {row.fromLabel} → {row.toLabel}
                    </span>
                    {row.requiresReason || row.validates ? (
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-ink-muted">
                        {row.requiresReason ? (
                          <span className="flex items-center gap-1">
                            <PenLine className="size-3 shrink-0" aria-hidden />
                            Written reason
                          </span>
                        ) : null}
                        {row.validates ? (
                          <span className="flex items-center gap-1">
                            <ShieldCheck className="size-3 shrink-0" aria-hidden />
                            Publication check first
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </th>

                  {roles.map((role) => {
                    const allowed = row.roles.includes(role);
                    return (
                      <td
                        key={role}
                        className="border-l border-line px-3 py-3 text-center align-middle"
                      >
                        {allowed ? (
                          <span className="inline-flex size-5 items-center justify-center rounded-xs bg-accent text-on-accent">
                            <Check className="size-3" aria-hidden />
                            <span className="sr-only">
                              {ROLE_LABELS[role]} may {row.action.toLowerCase()}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex size-5 items-center justify-center">
                            <span aria-hidden className="size-1.5 rounded-full bg-line-strong" />
                            <span className="sr-only">
                              {ROLE_LABELS[role]} may not {row.action.toLowerCase()}
                            </span>
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}

          <tfoot>
            <tr>
              <th
                scope="row"
                className="sticky left-0 z-10 bg-surface px-4 py-3 text-left text-2xs font-medium text-ink-subtle"
              >
                Actions available
              </th>
              {totals.map((total, index) => (
                <td
                  key={roles[index]}
                  className="border-l border-line px-3 py-3 text-center text-2xs tabular-nums text-ink-muted"
                >
                  {total} of {rows.length}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
