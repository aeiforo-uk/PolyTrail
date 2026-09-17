import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { AlertCircle, CalendarClock, CheckCircle2, Clock, FileWarning, Info } from 'lucide-react';
import { checkAnswer, type RequestableField } from '@/lib/data-requests/fields';
import { resolvePortal, type PortalQuestion, type PortalView } from '@/lib/data-requests/portal';
import { COUNTRY_OPTIONS } from '@/lib/partners/vocab';
import { clientKey, rateLimit } from '@/lib/security/rate-limit';
import { StackedBar } from '@/components/viz/bar-chart';
import { answer } from './actions';
import { AutoSave } from './autosave';
import { citation, plainReason } from './why';

/**
 * The supplier portal.
 *
 * The decision this page exists to defend: no account. Every other way of
 * collecting tier-3 data asks a factory office in Tiruppur to create a login,
 * verify an email, choose a password and remember it six months later, and
 * that is where supplier data collection dies. A link in an email, a form, a
 * button. Nothing else.
 *
 * Consequences, all deliberate:
 *   • Server-rendered, with no client bundle of its own beyond the optional
 *     autosave. The page works with scripting disabled and on a handset old
 *     enough to choke on a modern SPA. Progress is counted on the server and
 *     printed into the HTML; there is no client state anywhere on this page.
 *   • One column, large type, 48px targets. This is the one screen in the
 *     product that is not for an operator at a desk.
 *   • Every question says, in plain words, why it is being asked. A supplier
 *     who thinks a question is busywork guesses; a supplier who knows a customs
 *     rule depends on it goes and checks.
 *   • The link is the credential, so it is rate limited, constant-time
 *     compared against a stored hash, and expires.
 *   • Nothing on the page comes from outside this one request. No other
 *     supplier, no other passport, no brand data beyond the name of the brand
 *     that wrote to them.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Supplier data request',
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ saved?: string; done?: string; invalid?: string; busy?: string }>;
}

export default async function SupplierPortalPage({ params, searchParams }: Props) {
  const [{ token }, query] = await Promise.all([params, searchParams]);

  const requestHeaders = await headers();
  const limited = !rateLimit(
    clientKey(new Request('http://portal.local', { headers: requestHeaders }), 'portal:view'),
    40,
    5 * 60_000,
  ).ok;

  if (limited) {
    return (
      <Notice
        tone="caution"
        icon={Clock}
        title="Too many attempts"
        body="Wait a few minutes and open your link again."
      />
    );
  }

  const resolved = await resolvePortal(token);

  if (!resolved.ok) {
    // Deliberately uninformative about whether the link ever existed. A
    // different message for "never existed" and "cancelled" would turn this
    // page into an oracle for guessing tokens.
    if (resolved.reason === 'expired') {
      return (
        <Notice
          tone="caution"
          icon={Clock}
          title="This link has expired"
          body="Reply to the email you received and ask for a new one. Anything you had already saved is safe."
        />
      );
    }
    return (
      <Notice
        tone="neutral"
        icon={FileWarning}
        title="This link does not work"
        body="It may have been finished already, withdrawn, or copied incompletely. Check the email you received, or reply to it and ask for a new link."
      />
    );
  }

  const view = resolved.view;

  if (view.status === 'submitted' || view.status === 'under_review' || view.status === 'approved') {
    return <Confirmation view={view} />;
  }

  // Errors are recomputed from the stored draft rather than carried in the
  // URL, so a no-JavaScript round trip loses nothing and says exactly what is
  // wrong with each field.
  const errors = new Map<string, string>();
  if (query.invalid === '1') {
    for (const question of view.questions) {
      if (question.value === null || question.value === undefined || question.value === '') continue;
      const check = checkAnswer(question.field, toInputValue(question.value));
      if (!check.ok && check.message) errors.set(question.field.path, check.message);
    }
  }

  const sections = groupBySection(view.questions);
  const total = view.questions.length;
  const answered = view.questions.filter(isAnswered).length;
  const remaining = total - answered;
  const daysLeft = view.dueAt ? daysBetween(new Date(), view.dueAt) : null;

  return (
    <>
      <header>
        <p className="eyebrow">A request from {view.brandName}</p>
        <h1 className="display mt-2 text-3xl leading-tight sm:text-4xl">{view.title}</h1>

        <p className="mt-4 text-lg leading-relaxed text-ink">
          {view.brandName} needs {total} {total === 1 ? 'detail' : 'details'} from{' '}
          {view.partnerName}
          {view.products.length > 0 ? (
            <>
              {' '}
              about <span className="font-medium">{listOf(view.products)}</span>
            </>
          ) : null}
          .
        </p>
        <p className="mt-2 text-base leading-relaxed text-ink-muted">
          Answer what you can. You can save and come back to this same link later — nothing is sent
          until you press the green button at the bottom.
        </p>

        {view.message ? (
          <blockquote className="mt-5 rounded-lg border border-line bg-surface px-5 py-4 text-base leading-relaxed text-ink">
            <p className="eyebrow mb-1.5">What they wrote</p>
            {view.message}
          </blockquote>
        ) : null}

        <dl className="mt-5 flex flex-col gap-2 rounded-lg border border-line bg-surface px-5 py-4 text-base sm:flex-row sm:gap-8">
          {view.dueAt ? (
            <div className="flex items-start gap-2.5">
              <CalendarClock className="mt-0.5 size-5 shrink-0 text-ink-subtle" aria-hidden />
              <div>
                <dt className="eyebrow">Please answer by</dt>
                <dd className="text-ink">
                  {longDate(view.dueAt)}
                  {daysLeft !== null ? (
                    <span
                      className={
                        daysLeft < 0
                          ? 'ml-1.5 font-medium text-critical'
                          : daysLeft <= 7
                            ? 'ml-1.5 font-medium text-caution'
                            : 'ml-1.5 text-ink-muted'
                      }
                    >
                      {daysLeft < 0
                        ? `(${Math.abs(daysLeft)} days ago)`
                        : daysLeft === 0
                          ? '(today)'
                          : `(${daysLeft} days from now)`}
                    </span>
                  ) : null}
                </dd>
              </div>
            </div>
          ) : null}

          {view.expiresAt ? (
            <div className="flex items-start gap-2.5">
              <Clock className="mt-0.5 size-5 shrink-0 text-ink-subtle" aria-hidden />
              <div>
                <dt className="eyebrow">This link stops working</dt>
                <dd className="text-ink">{longDate(view.expiresAt)}</dd>
              </div>
            </div>
          ) : null}
        </dl>
      </header>

      {/* Progress, counted on the server. No client state, no JavaScript. */}
      <section aria-label="Your progress" className="mt-6 rounded-lg border border-line bg-surface px-5 py-4">
        <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-lg font-medium text-ink tabular-nums">
            {answered} of {total} answered
          </span>
          <span className="text-base text-ink-muted tabular-nums">
            {remaining === 0 ? 'Nothing left to fill in' : `${remaining} to go`}
          </span>
        </p>
        <StackedBar
          className="mt-3"
          height={10}
          ariaLabel={`${answered} of ${total} questions answered`}
          segments={[
            { key: 'done', label: 'Answered', value: answered, colour: 'var(--color-positive)' },
            { key: 'left', label: 'Remaining', value: remaining, colour: 'var(--color-line)' },
          ]}
        />
        {view.savedAt ? (
          <p className="mt-2.5 text-sm text-ink-subtle">
            Last saved {longDateTime(new Date(view.savedAt))}.
          </p>
        ) : null}
      </section>

      {view.status === 'rejected' && view.rejectionReason ? (
        <div className="mt-6 rounded-lg border border-caution-border bg-caution-soft px-5 py-4">
          <p className="flex items-center gap-2 text-base font-medium text-caution">
            <AlertCircle className="size-5 shrink-0" aria-hidden />
            {view.brandName} has asked you to look at this again
          </p>
          <p className="mt-2 text-base leading-relaxed text-ink">{view.rejectionReason}</p>
        </div>
      ) : null}

      {query.invalid === '1' ? (
        <p
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-lg border border-critical-border bg-critical-soft px-5 py-4 text-base leading-relaxed text-critical"
        >
          <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
          Some answers could not be read. They are marked in red below — everything else has been
          saved, so you only need to fix those.
        </p>
      ) : null}

      {query.saved === '1' ? (
        <p className="mt-6 flex items-start gap-2.5 rounded-lg border border-positive-border bg-positive-soft px-5 py-4 text-base leading-relaxed text-positive">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
          Saved. You can close this page and open the same link again whenever you like.
        </p>
      ) : null}

      {query.busy === '1' ? (
        <p className="mt-6 rounded-lg border border-caution-border bg-caution-soft px-5 py-4 text-base leading-relaxed text-caution">
          That was a lot of saves at once. Wait a moment and try again — nothing was lost.
        </p>
      ) : null}

      <form action={answer.bind(null, token)} className="mt-10 flex flex-col gap-12">
        {sections.map((section, index) => {
          const done = section.questions.filter(isAnswered).length;
          return (
            <section key={section.label}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
                <h2 className="display text-2xl">
                  <span className="mr-2 text-ink-subtle tabular-nums">{index + 1}.</span>
                  {section.label}
                </h2>
                <p className="text-sm text-ink-muted tabular-nums">
                  {done} of {section.questions.length} answered
                </p>
              </div>

              <div className="flex flex-col gap-10 pt-7">
                {section.questions.map((question) => (
                  <Question
                    key={question.field.path}
                    question={question}
                    error={errors.get(question.field.path) ?? null}
                  />
                ))}
              </div>
            </section>
          );
        })}

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
            <h2 className="display text-2xl">
              <span className="mr-2 text-ink-subtle tabular-nums">{sections.length + 1}.</span>
              Who is answering
            </h2>
          </div>
          <p className="pt-4 text-base leading-relaxed text-ink-muted">
            So {view.brandName} knows who to thank, and who to come back to if something is
            unclear.
          </p>
          <div className="flex flex-col gap-7 pt-6">
            <Labelled label="Your name" htmlFor="respondentName">
              <input
                id="respondentName"
                name="respondentName"
                autoComplete="name"
                defaultValue={view.respondent?.name ?? ''}
                className={inputClass}
              />
            </Labelled>
            <Labelled label="Your email" htmlFor="respondentEmail">
              <input
                id="respondentEmail"
                name="respondentEmail"
                type="email"
                inputMode="email"
                autoComplete="email"
                defaultValue={view.respondent?.email ?? ''}
                className={inputClass}
              />
            </Labelled>
            <Labelled label="Your job" htmlFor="respondentRole">
              <input
                id="respondentRole"
                name="respondentRole"
                placeholder="for example, Production manager"
                defaultValue={view.respondent?.role ?? ''}
                className={inputClass}
              />
            </Labelled>
          </div>
        </section>

        <div className="sticky bottom-0 -mx-5 border-t border-line bg-surface px-5 py-4 sm:-mx-6 sm:px-6">
          <div className="flex flex-col gap-3">
            <button
              type="submit"
              name="intent"
              value="submit"
              className="inline-flex min-h-13 items-center justify-center rounded-lg bg-accent px-6 text-lg font-medium text-on-accent shadow-xs transition-colors duration-[140ms] hover:bg-accent-hover active:translate-y-px"
            >
              Send {answered === total ? 'all' : `these ${answered}`} to {view.brandName}
            </button>
            <button
              type="submit"
              name="intent"
              value="save"
              className="inline-flex min-h-13 items-center justify-center rounded-lg border border-line-strong bg-surface px-6 text-lg font-medium text-ink transition-colors duration-[140ms] hover:bg-surface-sunken active:translate-y-px"
            >
              Save and finish later
            </button>
            <p className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-subtle">
              <span>
                {remaining === 0
                  ? 'Everything is filled in.'
                  : `${remaining} ${remaining === 1 ? 'question is' : 'questions are'} still blank — you can send anyway.`}
              </span>
              <AutoSave token={token} />
            </p>
          </div>
        </div>
      </form>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Controls
//
// Plain elements rather than the console's UI primitives: those are client
// components, and this page should ship as close to no JavaScript as it can.
// Everything is at least 48px tall, because the reader is holding a phone.
// ───────────────────────────────────────────────────────────────────────────

const inputClass =
  'min-h-13 w-full rounded-lg border border-line-strong bg-surface px-3.5 text-lg text-ink placeholder:text-ink-subtle focus:border-info focus:outline-none focus:ring-3 focus:ring-info-soft aria-[invalid=true]:border-critical aria-[invalid=true]:ring-3 aria-[invalid=true]:ring-critical-soft';

const textareaClass =
  'min-h-28 w-full resize-y rounded-lg border border-line-strong bg-surface px-3.5 py-3 text-lg leading-relaxed text-ink placeholder:text-ink-subtle focus:border-info focus:outline-none focus:ring-3 focus:ring-info-soft';

function Labelled({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-lg font-medium text-ink">
        {label}
      </label>
      {children}
      {hint ? <p className="text-sm leading-relaxed text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function Question({ question, error }: { question: PortalQuestion; error: string | null }) {
  const { field, value } = question;
  const name = `f:${field.path}`;
  const id = field.path.replace(/[^a-zA-Z0-9]/g, '_');
  const current = toInputValue(value);
  const invalid = error ? true : undefined;
  const hint = hintFor(field);
  const answered = isAnswered(question);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="flex items-start gap-2.5 text-lg font-medium text-ink">
          <span
            aria-hidden
            className={
              answered
                ? 'mt-2 size-2 shrink-0 rounded-full bg-positive'
                : 'mt-2 size-2 shrink-0 rounded-full bg-line-strong'
            }
          />
          <span>
            {field.label}
            {field.required ? (
              <span className="ml-2 align-middle text-sm font-normal text-caution">
                needed before the passport can be published
              </span>
            ) : null}
          </span>
        </label>

        {/* Why it is being asked, in words, with the rule named underneath. A
            supplier who thinks a question is busywork guesses at it. */}
        <div className="rounded-lg border border-line bg-surface-sunken/60 px-4 py-3">
          <p className="flex items-start gap-2 text-base leading-relaxed text-ink-muted">
            <Info className="mt-1 size-4 shrink-0 text-ink-subtle" aria-hidden />
            {plainReason(field.basis)}
          </p>
          <p className="mt-1.5 pl-6 text-sm text-ink-subtle">{citation(field.basis)}</p>
        </div>
      </div>

      {renderControl({ field, id, name, current, invalid })}

      {error ? (
        <p className="flex items-start gap-2 text-base text-critical" role="alert">
          <AlertCircle className="mt-1 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p className="text-base leading-relaxed text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const optionClass =
  'flex min-h-13 flex-1 cursor-pointer items-center justify-center gap-2.5 rounded-lg border border-line-strong bg-surface px-5 text-lg text-ink transition-colors duration-[140ms] has-checked:border-accent has-checked:bg-accent-soft has-checked:font-medium';

function renderControl({
  field,
  id,
  name,
  current,
  invalid,
}: {
  field: RequestableField;
  id: string;
  name: string;
  current: string;
  invalid: true | undefined;
}) {
  switch (field.kind) {
    case 'boolean':
      return (
        <>
          {/* Without this marker an unchecked box is indistinguishable from an
              unanswered question, and "no" would read as "did not say". */}
          <input type="hidden" name={`present:${field.path}`} value="1" />
          <div className="flex gap-3">
            {[
              { label: 'Yes', value: 'yes' },
              { label: 'No', value: '' },
            ].map((option, position) => (
              <label key={option.label} className={optionClass}>
                <input
                  // The question's label points at the first radio, so tapping
                  // the question text moves focus into the group.
                  id={position === 0 ? id : undefined}
                  type="radio"
                  name={name}
                  value={option.value}
                  defaultChecked={current === option.value && current !== ''}
                  className="size-5 accent-accent"
                />
                {option.label}
              </label>
            ))}
          </div>
        </>
      );

    case 'select':
      return (
        <select id={id} name={name} defaultValue={current} className={inputClass} aria-invalid={invalid}>
          <option value="">Not answered</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {humanise(option)}
            </option>
          ))}
        </select>
      );

    case 'country':
      return (
        <select id={id} name={name} defaultValue={current} className={inputClass} aria-invalid={invalid}>
          <option value="">Not answered</option>
          {COUNTRY_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </select>
      );

    case 'longtext':
      return (
        <textarea
          id={id}
          name={name}
          rows={4}
          defaultValue={current}
          className={textareaClass}
          aria-invalid={invalid}
        />
      );

    case 'number':
      return (
        <input
          id={id}
          name={name}
          inputMode="decimal"
          defaultValue={current}
          className={inputClass}
          aria-invalid={invalid}
        />
      );

    case 'date':
      return (
        <input
          id={id}
          name={name}
          type="date"
          defaultValue={current}
          className={inputClass}
          aria-invalid={invalid}
        />
      );

    case 'email':
      return (
        <input
          id={id}
          name={name}
          type="email"
          inputMode="email"
          defaultValue={current}
          className={inputClass}
          aria-invalid={invalid}
        />
      );

    case 'url':
      return (
        <input
          id={id}
          name={name}
          type="url"
          inputMode="url"
          placeholder="https://"
          defaultValue={current}
          className={inputClass}
          aria-invalid={invalid}
        />
      );

    default:
      return (
        <input id={id} name={name} defaultValue={current} className={inputClass} aria-invalid={invalid} />
      );
  }
}

function hintFor(field: RequestableField): string | undefined {
  if (field.kind === 'list') return 'If there is more than one, separate them with commas.';
  if (field.kind === 'document')
    return 'Type the name of the file. Files cannot be uploaded here yet — send it by email and we will match it up.';
  if (field.kind === 'number') return 'Numbers only. If you are not sure, leave it blank rather than guessing.';
  return undefined;
}

// ───────────────────────────────────────────────────────────────────────────
// Presentation helpers
// ───────────────────────────────────────────────────────────────────────────

function isAnswered(question: PortalQuestion): boolean {
  const value = question.value;
  if (value === null || value === undefined || value === '') return false;
  return !(Array.isArray(value) && value.length === 0);
}

function toInputValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'yes' : '';
  return String(value);
}

function humanise(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function listOf(items: readonly string[]): string {
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function longDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function longDateTime(date: Date): string {
  return `${longDate(date)} at ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function groupBySection(questions: readonly PortalQuestion[]) {
  const order: string[] = [];
  const buckets = new Map<string, PortalQuestion[]>();

  for (const question of questions) {
    const label = question.field.sectionLabel;
    const bucket = buckets.get(label);
    if (bucket) bucket.push(question);
    else {
      buckets.set(label, [question]);
      order.push(label);
    }
  }

  return order.map((label) => ({ label, questions: buckets.get(label)! }));
}

/**
 * The confirmation.
 *
 * Its job is to stop the next email. A supplier who is not told what happens
 * next writes to ask, or worse, fills the form in again from the same link and
 * finds it dead. So this says what was sent, when, who has it, and the one
 * circumstance in which they will hear from anybody.
 */
function Confirmation({ view }: { view: PortalView }) {
  const answered = view.questions.filter(isAnswered).length;
  const sections = groupBySection(view.questions.filter(isAnswered));

  return (
    <div>
      <div className="rounded-lg border border-positive-border bg-positive-soft/50 px-6 py-8">
        <p className="flex items-center gap-2.5 text-base font-medium text-positive">
          <CheckCircle2 className="size-6 shrink-0" aria-hidden />
          Sent to {view.brandName}
        </p>
        <h1 className="display mt-3 text-3xl text-ink">Thank you</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink">
          You answered {answered} of {view.questions.length}{' '}
          {view.questions.length === 1 ? 'question' : 'questions'}
          {view.submittedAt ? ` on ${longDateTime(view.submittedAt)}` : ''}.
        </p>
        <p className="mt-2 text-base leading-relaxed text-ink-muted">
          There is nothing else for you to do. You do not need to reply to the email.
        </p>
      </div>

      <section className="mt-8">
        <h2 className="display text-2xl">What happens next</h2>
        <ol className="mt-4 flex flex-col gap-5">
          <Step
            number={1}
            title={`${view.brandName} reads your answers`}
            body="Usually within a few working days. A person checks each answer against what they already hold — nothing is applied automatically."
          />
          <Step
            number={2}
            title="Accepted answers go into the product passport"
            body="Where your answer differs from something already recorded, a person decides which is right. Nothing you sent is overwritten or edited without that decision."
          />
          <Step
            number={3}
            title="You only hear from them if something needs a second look"
            body={`If an answer is unclear, ${view.brandName} sends you a new link with a note saying exactly which field and why. Otherwise this is finished.`}
          />
        </ol>
      </section>

      {sections.length > 0 ? (
        <section className="mt-8 rounded-lg border border-line bg-surface px-5 py-4">
          <h2 className="text-base font-medium text-ink">What you sent</h2>
          <ul className="mt-3 flex flex-col gap-1.5">
            {sections.map((section) => (
              <li key={section.label} className="flex items-baseline justify-between gap-4 text-base">
                <span className="text-ink-muted">{section.label}</span>
                <span className="text-ink tabular-nums">
                  {section.questions.length}{' '}
                  {section.questions.length === 1 ? 'answer' : 'answers'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-6 text-base leading-relaxed text-ink-subtle">
        This link no longer accepts changes. If you spot a mistake, reply to the email you received
        and ask for it to be reopened.
      </p>
    </div>
  );
}

function Step({ number, title, body }: { number: number; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-base font-medium text-ink tabular-nums"
      >
        {number}
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-medium text-ink">{title}</span>
        <span className="mt-1 block text-base leading-relaxed text-ink-muted">{body}</span>
      </span>
    </li>
  );
}

function Notice({
  tone,
  icon: Icon,
  title,
  body,
}: {
  tone: 'neutral' | 'caution';
  icon: typeof Clock;
  title: string;
  body: string;
}) {
  const classes =
    tone === 'caution'
      ? 'border-caution-border bg-caution-soft/50 text-caution'
      : 'border-line bg-surface text-ink-muted';

  return (
    <div className={`rounded-lg border px-6 py-12 text-center ${classes}`}>
      <Icon className="mx-auto size-7" aria-hidden />
      <h1 className="display mt-4 text-2xl text-ink">{title}</h1>
      <p className="mx-auto mt-2.5 max-w-sm text-base leading-relaxed text-ink-muted">{body}</p>
    </div>
  );
}
