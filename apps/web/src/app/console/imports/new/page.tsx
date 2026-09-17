import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Download, Plug } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { canImport } from '@/lib/import/access';
import { TEMPLATE_PATHS, targetFor } from '@/lib/import/targets';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { uploadCsvAction } from '../actions';
import { Stepper } from '../stepper';
import { UploadForm } from './upload-form';

export const metadata = { title: 'New import' };

/**
 * A worked example per template column.
 *
 * The person filling this in has a spreadsheet open, not a schema. "Composition
 * 1 — fibre: Organic cotton" answers the question the label alone leaves open,
 * which is what a value is supposed to look like.
 */
const EXAMPLES: Record<string, string> = {
  'identity.productName': 'Cropped Organic Tee',
  'identity.brandName': 'Northbank',
  'identity.styleNumber': 'NB-4471',
  'identity.sku': 'NB-4471-NVY-M',
  'identity.gtin': '5012345678900',
  'identity.category': 'T-shirt',
  'identity.colourName': 'Navy',
  'identity.size': 'M',
  'identity.countryOfOrigin': 'PT',
  'identity.netWeightGrams': '186',
  'identity.economicOperators.0.name': 'Northbank Apparel Ltd',
  'identity.economicOperators.0.role': 'Manufacturer',
  'identity.economicOperators.0.address.country': 'GB',
  'composition.overall.0.fibre': 'Organic cotton',
  'composition.overall.0.percentage': '95',
  'composition.overall.1.fibre': 'Elastane',
  'composition.overall.1.percentage': '5',
  'composition.overall.2.fibre': '',
  'composition.overall.2.percentage': '',
  'care.instructions': 'Machine wash 30°C, do not tumble dry',
  'circularity.takeBack.available': 'Yes',
};

export default async function NewImportPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');
  if (!canImport(session)) redirect('/console');

  const columns = TEMPLATE_PATHS.map((path) => {
    const target = targetFor(path);
    return {
      path,
      label: target?.label ?? path,
      basis: target?.basis ?? '',
      required: target?.required ?? false,
      example: EXAMPLES[path] ?? '',
    };
  });

  const required = columns.filter((column) => column.required);
  const optional = columns.filter((column) => !column.required);

  return (
    <>
      <PageHeader
        title="Import a catalogue"
        description="A CSV exported from your PLM, PIM or a spreadsheet. Columns are matched automatically, you confirm every one, and nothing is written to a passport until you have seen what it would do."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/console/connectors">
              <Plug aria-hidden />
              Pull from a system instead
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-8 px-8 py-8">
        <Stepper current="upload" />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            <UploadForm action={uploadCsvAction} />

            <section className="rounded-lg border border-line bg-surface">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-ink">What the file needs</h2>
                  <p className="mt-1 max-w-prose text-sm text-ink-muted">
                    A header row, then one row per product. Commas or semicolons both work and
                    accented characters survive either way. Columns can be in any order and any
                    spelling — they are matched by name, and you confirm each match on the next
                    step.
                  </p>
                </div>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/console/imports/template">
                    <Download aria-hidden />
                    Download the template
                  </Link>
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line text-ink-subtle">
                    <tr>
                      <th scope="col" className="px-5 py-2.5 text-xs font-medium">
                        Column
                      </th>
                      <th scope="col" className="px-5 py-2.5 text-xs font-medium">
                        A value looks like
                      </th>
                      <th scope="col" className="px-5 py-2.5 text-xs font-medium whitespace-nowrap">
                        Asked for by
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {required.map((column) => (
                      <tr key={column.path}>
                        <td className="px-5 py-3">
                          <span className="flex items-center gap-3">
                            <span
                              aria-hidden
                              className="h-6 w-0.5 shrink-0 rounded-full bg-critical"
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-ink">
                                {column.label}
                              </span>
                              <span className="block text-2xs font-medium text-critical">
                                Required — a passport cannot be published without it
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className="mono px-5 py-3 text-xs text-ink-muted">
                          {column.example || '—'}
                        </td>
                        <td className="px-5 py-3 text-xs text-ink-subtle">{column.basis}</td>
                      </tr>
                    ))}
                    {optional.map((column) => (
                      <tr key={column.path}>
                        <td className="px-5 py-3">
                          <span className="flex items-center gap-3">
                            <span
                              aria-hidden
                              className="h-6 w-0.5 shrink-0 rounded-full bg-line-strong"
                            />
                            <span className="text-sm text-ink">{column.label}</span>
                          </span>
                        </td>
                        <td className="mono px-5 py-3 text-xs text-ink-muted">
                          {column.example || '—'}
                        </td>
                        <td className="px-5 py-3 text-xs text-ink-subtle">{column.basis}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <section className="rounded-lg border border-line bg-surface p-5">
              <p className="eyebrow">Start here</p>
              <h2 className="display mt-1 text-xl text-ink">The starter template</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                Its headers are the exact spellings the column matcher recognises, so a file built
                from it maps every column first time and skips the next step almost entirely. It
                carries the {required.length} fields a passport cannot be published without, plus the
                handful every PIM already holds.
              </p>
              <Button asChild className="mt-4 w-full">
                <Link href="/console/imports/template">
                  <Download aria-hidden />
                  Download the template
                </Link>
              </Button>
              <p className="mt-2 text-2xs text-ink-subtle">
                <span className="mono">polytrail-import-template.csv</span> · {columns.length}{' '}
                columns · no rows
              </p>
            </section>

            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">Give every row an identifier</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                A GTIN, SKU or style reference is how the second import updates a passport instead of
                creating a second one. A row without any of the three creates a new passport every
                single time the file is imported.
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {[
                  { label: 'GTIN', example: '5012345678900', note: 'Strongest match. Checked first.' },
                  { label: 'SKU', example: 'NB-4471-NVY-M', note: 'Used when there is no GTIN.' },
                  {
                    label: 'Style reference',
                    example: 'NB-4471',
                    note: 'Last resort — matches a whole style, not a variant.',
                  },
                ].map((entry, index) => (
                  <li key={entry.label} className="flex gap-3 rounded-md bg-surface-sunken px-3 py-2">
                    <span className="mono mt-0.5 text-2xs tabular-nums text-ink-subtle">
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-ink">{entry.label}</span>
                      <span className="mono block truncate text-2xs text-ink-muted">
                        {entry.example}
                      </span>
                      <span className="block text-2xs text-ink-subtle">{entry.note}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-lg border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-ink">What happens after you upload</h2>
              <ol className="mt-3 flex flex-col gap-3">
                {[
                  {
                    title: 'The file is read, and nothing else',
                    body: 'No passport is created. The columns are matched against passport fields and you are shown every guess.',
                  },
                  {
                    title: 'You confirm the columns',
                    body: 'Two real values from your file sit beside each guess, so you can check it without reopening the spreadsheet.',
                  },
                  {
                    title: 'You see what it would do',
                    body: 'How many rows would be created, updated, skipped or rejected — and the rejected ones are editable in place.',
                  },
                ].map((step, index) => (
                  <li key={step.title} className="flex gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-2xs font-semibold tabular-nums text-ink-muted"
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-ink">{step.title}</span>
                      <span className="block text-xs leading-relaxed text-ink-subtle">
                        {step.body}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
              <Link
                href="/console/imports"
                className="mt-4 inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                Past imports
                <ArrowRight className="size-3" aria-hidden />
              </Link>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
