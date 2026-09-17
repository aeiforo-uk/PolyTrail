'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { AlertCircle, ChevronRight, ListChecks, Mail, Sparkles } from 'lucide-react';
import type { RequestFormState } from '@/lib/data-requests/actions';
import { renderRequestEmail } from '@/lib/data-requests/email';
import type { FieldSection } from '@/lib/data-requests/fields';
import { TIER_LABEL, type SupplyTier } from '@/lib/partners/vocab';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { StackedBar } from '@/components/viz/bar-chart';
import { cn } from '@/lib/utils';

export interface ComposerPartner {
  id: string;
  name: string;
  tier: string;
  contactName: string | null;
  contactEmail: string | null;
  suggestedSections: string[];
}

export interface ComposerPassport {
  id: string;
  dppId: string;
  name: string;
}

/**
 * Building a request.
 *
 * The picker is the whole screen, so it has to be readable rather than merely
 * complete: two hundred registry paths in one list is a document nobody reads,
 * and a brand that cannot see what it is asking for ends up asking a spinner
 * about packaging. So the fields are grouped by passport section, the sections
 * a facility of that tier can plausibly answer are open by default and marked,
 * and the rail shows the questionnaire as the supplier will actually meet it.
 *
 * The email preview is rendered from the same pure function that builds the
 * message, so what is shown is what is sent rather than an approximation.
 */
export function RequestComposer({
  action,
  partners,
  passports,
  sections,
  brandName,
  initialPartnerId,
}: {
  action: (state: RequestFormState, form: FormData) => Promise<RequestFormState>;
  partners: ComposerPartner[];
  passports: ComposerPassport[];
  sections: FieldSection[];
  brandName: string;
  initialPartnerId?: string;
}) {
  const [state, submit, pending] = useActionState<RequestFormState, FormData>(action, {});
  const errors = state.fieldErrors ?? {};

  const [partnerId, setPartnerId] = useState(initialPartnerId ?? partners[0]?.id ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [dueAt, setDueAt] = useState('');

  const partner = partners.find((p) => p.id === partnerId) ?? null;
  const suggested = useMemo(
    () => new Set(partner?.suggestedSections ?? sections.map((s) => s.section)),
    [partner, sections],
  );

  const chosen = useMemo(
    () =>
      sections
        .map((section) => ({
          section,
          fields: section.fields.filter((field) => selected.has(field.path)),
        }))
        .filter((entry) => entry.fields.length > 0),
    [sections, selected],
  );

  const chosenSectionLabels = useMemo(() => chosen.map((entry) => entry.section.label), [chosen]);
  const requiredCount = useMemo(
    () => chosen.reduce((sum, entry) => sum + entry.fields.filter((f) => f.required).length, 0),
    [chosen],
  );

  const preview = useMemo(
    () =>
      renderRequestEmail({
        brandName,
        partnerName: partner?.name ?? 'your supplier',
        contactName: partner?.contactName ?? null,
        title: title || 'Data request',
        message,
        fieldCount: selected.size,
        sectionLabels: chosenSectionLabels,
        dueAt: dueAt ? new Date(`${dueAt}T23:59:59Z`) : null,
        link: 'https://polytrail.eu/s/…',
      }),
    [brandName, partner, title, message, selected.size, chosenSectionLabels, dueAt],
  );

  function toggle(path: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function setSection(section: FieldSection, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const field of section.fields) {
        if (on) next.add(field.path);
        else next.delete(field.path);
      }
      return next;
    });
  }

  function selectLikely() {
    setSelected(() => {
      const next = new Set<string>();
      for (const section of sections) {
        if (!suggested.has(section.section)) continue;
        for (const field of section.fields) if (field.required) next.add(field.path);
      }
      return next;
    });
  }

  return (
    <form action={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex min-w-0 flex-col gap-6">
        {state.error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-3 py-2.5 text-sm text-critical"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {state.error}
          </p>
        ) : null}

        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">Who, and what for</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Supplier" htmlFor="partnerId" required error={errors.partnerId}>
              <NativeSelect
                id="partnerId"
                name="partnerId"
                value={partnerId}
                onChange={(event) => setPartnerId(event.target.value)}
                required
              >
                <option value="" disabled>
                  Choose a supplier
                </option>
                {partners.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} — {TIER_LABEL[option.tier as SupplyTier] ?? option.tier}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field
              label="Deadline"
              htmlFor="dueAt"
              hint="The link stops working two weeks after this."
              error={errors.dueAt}
            >
              <Input
                id="dueAt"
                name="dueAt"
                type="date"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </Field>

            <Field
              label="Title"
              htmlFor="title"
              required
              error={errors.title}
              className="sm:col-span-2"
            >
              <Input
                id="title"
                name="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Dye-house data for AW26 poplin"
                required
              />
            </Field>

            <Field
              label="Message"
              htmlFor="message"
              hint="Short and specific. Say why you need it and who to ask internally if they are stuck."
              error={errors.message}
              className="sm:col-span-2"
            >
              <Textarea
                id="message"
                name="message"
                rows={3}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </Field>

            {partner && !partner.contactEmail ? (
              <p className="flex items-start gap-2 rounded-md border border-caution-border bg-caution-soft px-3 py-2.5 text-xs leading-relaxed text-caution sm:col-span-2">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {partner.name} has no contact email on file. You can still create the request and
                copy the link, but nothing will be sent automatically.
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">Which passports it covers</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Answers are merged into every passport ticked here. A request with none attached
            collects data that has nowhere to land.
          </p>
          {passports.length === 0 ? (
            <p className="mt-3 text-sm text-caution">
              No passports yet. Create one first — answers have to land somewhere.
            </p>
          ) : (
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {passports.map((passport) => (
                <li key={passport.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm text-ink transition-colors duration-[140ms] hover:bg-surface-sunken has-checked:bg-accent-soft/50">
                    <input
                      type="checkbox"
                      name="passportIds"
                      value={passport.id}
                      className="size-4 shrink-0 rounded-xs border-line-strong accent-accent"
                    />
                    <span className="min-w-0 truncate">
                      {passport.name}
                      <span className="mono ml-1.5 text-2xs text-ink-subtle">{passport.dppId}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="overflow-hidden rounded-lg border border-line bg-surface">
          <header className="border-b border-line px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-sm font-semibold text-ink">What you are asking for</h2>
              <p className="text-xs text-ink-muted tabular-nums">
                {selected.size} {selected.size === 1 ? 'field' : 'fields'} in {chosen.length}{' '}
                {chosen.length === 1 ? 'section' : 'sections'}
              </p>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              Every field carries the instrument that asks for it, so the supplier can see it is not
              busywork. Sections marked <span className="text-accent">likely</span> are the ones a
              facility at this tier normally holds.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={selectLikely}
                className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1 text-xs text-ink-muted transition-colors duration-[140ms] hover:border-line-hover hover:text-ink"
              >
                <Sparkles className="size-3" aria-hidden />
                Everything needed to publish, at this tier
              </button>
              {selected.size > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="rounded-full border border-line-strong bg-surface px-3 py-1 text-xs text-ink-muted transition-colors duration-[140ms] hover:border-line-hover hover:text-ink"
                >
                  Clear all {selected.size}
                </button>
              ) : null}
            </div>
          </header>

          {errors.fields ? (
            <p className="flex items-center gap-1.5 px-5 pt-4 text-xs text-critical" role="alert">
              <AlertCircle className="size-3.5 shrink-0" aria-hidden />
              {errors.fields}
            </p>
          ) : null}

          <div className="divide-y divide-line">
            {sections.map((section) => {
              const picked = section.fields.filter((field) => selected.has(field.path)).length;
              const isSuggested = suggested.has(section.section);
              const all = picked === section.fields.length;

              return (
                <details key={section.section} open={isSuggested} className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 transition-colors duration-[140ms] hover:bg-surface-sunken [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink">{section.label}</span>
                        {isSuggested ? (
                          <span className="inline-flex items-center gap-1 text-2xs text-accent">
                            <Sparkles className="size-3" aria-hidden />
                            likely
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1.5 block max-w-48">
                        <StackedBar
                          height={3}
                          ariaLabel={`${picked} of ${section.fields.length} ${section.label} fields selected`}
                          segments={[
                            {
                              key: 'picked',
                              label: 'Selected',
                              value: picked,
                              colour: 'var(--color-accent)',
                            },
                            {
                              key: 'rest',
                              label: 'Not selected',
                              value: section.fields.length - picked,
                              colour: 'var(--color-line)',
                            },
                          ]}
                        />
                      </span>
                    </span>

                    <span
                      className={cn(
                        'shrink-0 text-xs tabular-nums',
                        picked > 0 ? 'text-ink' : 'text-ink-subtle',
                      )}
                    >
                      {picked} of {section.fields.length}
                    </span>
                    <ChevronRight
                      aria-hidden
                      className="size-4 shrink-0 text-ink-subtle transition-transform duration-[220ms] ease-[cubic-bezier(.32,.72,0,1)] group-open:rotate-90 motion-reduce:transition-none"
                    />
                  </summary>

                  <div className="border-t border-line bg-surface-sunken/30 px-5 py-3">
                    <button
                      type="button"
                      onClick={() => setSection(section, !all)}
                      className="mb-2 text-xs text-accent transition-colors duration-[140ms] hover:underline"
                    >
                      {all ? `Clear ${section.label}` : `Select all ${section.fields.length}`}
                    </button>

                    <ul className="flex flex-col gap-0.5">
                      {section.fields.map((field) => (
                        <li key={field.path}>
                          <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 transition-colors duration-[140ms] hover:bg-surface has-checked:bg-accent-soft/40">
                            <input
                              type="checkbox"
                              name="fields"
                              value={field.path}
                              checked={selected.has(field.path)}
                              onChange={() => toggle(field.path)}
                              className="mt-0.5 size-4 shrink-0 rounded-xs border-line-strong accent-accent"
                            />
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-baseline gap-x-2">
                                <span className="text-sm text-ink">{field.label}</span>
                                {field.required ? (
                                  <span className="text-2xs text-caution">needed to publish</span>
                                ) : null}
                                {field.sensitive ? (
                                  <span className="text-2xs text-ink-subtle">
                                    commercially sensitive
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-0.5 block text-2xs leading-relaxed text-ink-subtle">
                                {field.basis}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      </div>

      <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-8 xl:self-start">
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ListChecks className="size-4 text-ink-subtle" aria-hidden />
            What they will be asked
          </h2>

          {selected.size === 0 ? (
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Nothing chosen yet. Pick the fields you cannot fill in yourself — a short request gets
              answered, a long one gets forwarded and forgotten.
            </p>
          ) : (
            <>
              <p className="mt-1.5 text-xs text-ink-muted tabular-nums">
                {selected.size} {selected.size === 1 ? 'question' : 'questions'}
                {requiredCount > 0 ? ` · ${requiredCount} needed to publish` : ''}
              </p>
              <ul className="mt-3 flex max-h-80 flex-col gap-3 overflow-auto">
                {chosen.map((entry) => (
                  <li key={entry.section.section}>
                    <p className="eyebrow">
                      {entry.section.label}
                      <span className="ml-1.5 tabular-nums">{entry.fields.length}</span>
                    </p>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {entry.fields.map((field) => (
                        <li key={field.path} className="flex items-start gap-1.5 text-xs text-ink">
                          <span
                            aria-hidden
                            className={cn(
                              'mt-1.5 size-1 shrink-0 rounded-full',
                              field.required ? 'bg-caution' : 'bg-line-strong',
                            )}
                          />
                          {field.label}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Mail className="size-4 text-ink-subtle" aria-hidden />
            The email they receive
          </h2>
          <p className="mt-1.5 text-xs break-all text-ink-subtle">
            To {partner?.contactEmail ?? 'no address on file'}
          </p>
          <p className="mt-2 text-sm font-medium text-ink">{preview.subject}</p>
          <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-surface-sunken px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap text-ink-muted">
            {preview.body}
          </pre>
        </section>

        <div className="flex flex-col gap-2">
          <Button type="submit" name="intent" value="send" loading={pending}>
            Send request
          </Button>
          <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending}>
            Save as draft
          </Button>
          <Button asChild variant="ghost">
            <Link href="/console/requests">Cancel</Link>
          </Button>
        </div>
      </aside>
    </form>
  );
}
