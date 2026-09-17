import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page-header';
import { createPassportAction } from './actions';
import { CreatePassportForm } from './create-form';

export const metadata = { title: 'New passport' };

/**
 * Creating a passport asks for the fewest things that make it a *thing* — the
 * product, its category, its identifiers, and what one passport stands for.
 * Everything else arrives over the following months as suppliers answer, which
 * is what the rail on the right is there to say before anyone worries that this
 * form is suspiciously short.
 */
export default async function NewPassportPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  return (
    <>
      <PageHeader
        title="New passport"
        description="Enough to identify the product. The rest of the passport is built up in the editor."
      />

      <div className="grid gap-10 px-8 py-8 xl:grid-cols-[minmax(0,640px)_minmax(0,300px)]">
        <div className="min-w-0">
          <CreatePassportForm action={createPassportAction} />
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">What happens next</h2>
            <ol className="mt-3 flex flex-col gap-3">
              {NEXT_STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-2xs font-medium text-ink-muted tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-ink">{step.title}</span>
                    <span className="block text-xs leading-relaxed text-ink-muted">
                      {step.body}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">Not needed yet</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
              None of this blocks you from creating the passport — only from publishing it.
            </p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {LATER.map((item) => (
                <li key={item} className="flex items-baseline gap-2 text-xs text-ink-muted">
                  <span aria-hidden className="size-1 shrink-0 rounded-full bg-line-strong" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}

const NEXT_STEPS = [
  {
    title: 'The editor opens on Identity',
    body: 'Ten sections, in the order a shopper reads them. Each one saves on its own and keeps its own version.',
  },
  {
    title: 'Suppliers fill in what you cannot',
    body: 'Send a data request for the fibre certificates, facility list and test reports you do not hold yourself.',
  },
  {
    title: 'A compliance officer approves it',
    body: 'Publication runs the validation gate first, so nothing goes public with a required field still blank.',
  },
];

const LATER = [
  'Fibre composition, by weight',
  'Where each stage of manufacture happened',
  'Carbon and water figures, with their method',
  'Care symbols and repair instructions',
  'Substances of concern and test results',
];
