'use client';

import * as React from 'react';
import { useActionState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { CONNECTOR_KIND_INFO, CONNECTOR_KIND_LIST } from '@/lib/connectors/kinds';
import {
  DEFAULT_REST_SETTINGS,
  type ConnectorKind,
  type PaginationSettings,
  type RestSettings,
} from '@/lib/connectors/types';
import { cn } from '@/lib/utils';
import { IDLE_CONNECTOR_STATE, type ConnectorFormState } from './state';

/**
 * The three shapes a JSON list arrives in.
 *
 * Almost every API in this market returns one of these. Showing all three with
 * the selector that reads each one turns "record selector" from a term of art
 * into a matching exercise: find the shape that looks like your response, copy
 * the line under it.
 */
const SHAPES = [
  {
    key: 'bare',
    title: 'The body is the list',
    selector: '',
    selectorLabel: 'leave blank',
    body: `[
  { "id": "1", "title": "Cropped Organic Tee" },
  { "id": "2", "title": "Wide Leg Trouser" }
]`,
    matches: (value: string) => value.trim() === '',
  },
  {
    key: 'keyed',
    title: 'The list sits under one key',
    selector: '$.products[*]',
    selectorLabel: '$.products[*]',
    body: `{
  "products": [
    { "id": "1", "title": "Cropped Organic Tee" }
  ],
  "meta": { "total": 412 }
}`,
    matches: (value: string) => /^\$?\.?products/i.test(value.trim()),
  },
  {
    key: 'nested',
    title: 'The list is nested',
    selector: 'data.items',
    selectorLabel: 'data.items',
    body: `{
  "data": {
    "items": [
      { "id": "1", "title": "Cropped Organic Tee" }
    ],
    "nextCursor": "eyJpZCI6..."
  }
}`,
    matches: (value: string) => value.trim().includes('.') && !/products/i.test(value),
  },
] as const;

const EXAMPLE_RECORD = `{
  "title": "Cropped Organic Tee",
  "attributes": { "styleCode": "NB-4471" },
  "variants": [
    { "barcode": "5012345678900", "size": "M" }
  ]
}`;

const EXAMPLE_FIELD_MAP = `Product = title
Style = attributes.styleCode
GTIN = variants[0].barcode
Size = variants[0].size`;

/**
 * Configuring a source.
 *
 * Every field carries an example rather than a description, because the person
 * filling this in has another tab open with an API document and needs to
 * recognise the shape, not read a definition of "record selector". The rail on
 * the right holds the worked examples the two hardest sections need — where the
 * records sit, and what to call their fields — with real JSON beside real
 * configuration.
 *
 * The credential field is always empty on an existing connector. It is never
 * sent back to the browser, not even masked.
 */
export function ConnectorForm({
  action,
  mode,
  connectorId,
  initialKind = 'rest',
  initialName = '',
  initialSettings,
  hasSecret = false,
  submitLabel,
}: {
  action: (state: ConnectorFormState, formData: FormData) => Promise<ConnectorFormState>;
  mode: 'create' | 'edit';
  connectorId?: string;
  initialKind?: ConnectorKind;
  initialName?: string;
  initialSettings?: Partial<RestSettings>;
  hasSecret?: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_CONNECTOR_STATE);
  const [kind, setKind] = React.useState<ConnectorKind>(initialKind);
  const [clearSecret, setClearSecret] = React.useState(false);

  const settings: RestSettings = { ...DEFAULT_REST_SETTINGS, ...initialSettings };
  const pagination = settings.pagination;
  const [paginationStyle, setPaginationStyle] = React.useState<PaginationSettings['style']>(
    pagination.style,
  );
  const [recordSelector, setRecordSelector] = React.useState(settings.recordSelector);
  const [fieldMap, setFieldMap] = React.useState(() => toPairs(settings.fieldMap));

  const info = CONNECTOR_KIND_INFO[kind];
  const error = (key: string) => state.errors?.[key]?.[0] ?? null;
  const matchedShape = SHAPES.find((shape) => shape.matches(recordSelector)) ?? SHAPES[0];

  return (
    <form action={formAction} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
      {connectorId ? <input type="hidden" name="id" value={connectorId} /> : null}

      <div className="flex min-w-0 flex-col gap-6">
        {state.status === 'error' && state.message ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-critical-border bg-critical-soft px-4 py-3 text-sm text-critical"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {state.message}
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>The source</CardTitle>
            <CardDescription>What it is and what to call it.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Field
              label="Name"
              htmlFor="name"
              required
              error={error('name')}
              hint="How it appears in your import history. Name the system and the slice, not just the vendor."
            >
              <Input
                id="name"
                name="name"
                required
                defaultValue={initialName}
                maxLength={120}
                placeholder="Centric PLM — AW26 styles"
              />
            </Field>

            <Field
              label="Type"
              htmlFor="kind"
              required
              hint="Only the generic REST connector is built. The rest say so in the list."
            >
              <NativeSelect
                id="kind"
                name="kind"
                value={kind}
                disabled={mode === 'edit'}
                onChange={(event) => setKind(event.target.value as ConnectorKind)}
              >
                {CONNECTOR_KIND_LIST.map((option) => (
                  <option key={option.kind} value={option.kind}>
                    {option.label}
                    {option.implemented ? '' : ' — not implemented'}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {mode === 'edit' ? <input type="hidden" name="kind" value={kind} /> : null}

            {info.implemented ? (
              <p className="flex items-start gap-2 rounded-md border border-positive-border bg-positive-soft px-4 py-3 text-sm text-positive">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{info.description}</span>
              </p>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-caution-border bg-caution-soft px-4 py-3 text-sm text-caution">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <strong className="font-semibold">This type is not built.</strong> {info.status}{' '}
                  {mode === 'create' ? (
                    <button
                      type="button"
                      onClick={() => setKind('rest')}
                      className="underline underline-offset-2"
                    >
                      Use the REST connector instead
                    </button>
                  ) : null}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {kind === 'rest' ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>The request</CardTitle>
                <CardDescription>Where to fetch from, and how to authenticate.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <Field
                  label="URL"
                  htmlFor="baseUrl"
                  required
                  error={error('baseUrl')}
                  hint="The endpoint that returns the list — not the one that returns a single product."
                >
                  <Input
                    id="baseUrl"
                    name="baseUrl"
                    required
                    type="url"
                    defaultValue={settings.baseUrl}
                    placeholder="https://api.example.com/v1/products"
                    className="mono"
                    aria-invalid={error('baseUrl') ? true : undefined}
                  />
                </Field>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Method" htmlFor="method" hint="GET for almost every list endpoint.">
                    <NativeSelect id="method" name="method" defaultValue={settings.method}>
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                    </NativeSelect>
                  </Field>

                  <Field
                    label="Records per pull"
                    htmlFor="maxRecords"
                    error={error('maxRecords')}
                    hint="A ceiling, so a mistake cannot pull a million rows."
                  >
                    <Input
                      id="maxRecords"
                      name="maxRecords"
                      type="number"
                      min={1}
                      max={20000}
                      defaultValue={settings.maxRecords}
                      className="tabular-nums"
                    />
                  </Field>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Credential header"
                    htmlFor="authHeader"
                    hint="Usually Authorization. Some PIMs use X-API-Key."
                  >
                    <Input
                      id="authHeader"
                      name="authHeader"
                      defaultValue={settings.authHeader}
                      className="mono"
                    />
                  </Field>

                  <Field
                    label="Header value"
                    htmlFor="authTemplate"
                    error={error('authTemplate')}
                    hint={
                      <>
                        <span className="mono">{'{{secret}}'}</span> is replaced with the credential
                        below at request time.
                      </>
                    }
                  >
                    <Input
                      id="authTemplate"
                      name="authTemplate"
                      defaultValue={settings.authTemplate}
                      className="mono"
                    />
                  </Field>
                </div>

                <Example
                  title="What gets sent"
                  body={`${settings.method || 'GET'} ${settings.baseUrl || 'https://api.example.com/v1/products'}
${settings.authHeader || 'Authorization'}: ${(settings.authTemplate || 'Bearer {{secret}}').replace('{{secret}}', '••••••••')}
Accept: application/json`}
                />

                <Field
                  label={hasSecret ? 'Replace the credential' : 'Credential'}
                  htmlFor="secret"
                  hint={
                    hasSecret
                      ? 'A credential is stored. Leave this blank to keep it — it is never shown again, here or anywhere else.'
                      : 'Encrypted with AES-256-GCM before it is stored, and never sent back to a browser.'
                  }
                >
                  <Input
                    id="secret"
                    name="secret"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      hasSecret ? 'Leave blank to keep the stored credential' : 'Paste the token'
                    }
                    disabled={clearSecret}
                  />
                </Field>

                {hasSecret ? (
                  <label className="flex items-center gap-2 text-sm text-ink-muted">
                    <Checkbox
                      name="clearSecret"
                      checked={clearSecret}
                      onCheckedChange={(checked) => setClearSecret(checked === true)}
                    />
                    Remove the stored credential
                  </label>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Where the records sit</CardTitle>
                <CardDescription>
                  Almost every API wraps its list in something. The selector says what to unwrap.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <Field
                  label="Record selector"
                  htmlFor="recordSelector"
                  hint="Match your response to one of the three shapes on the right and copy the line under it."
                >
                  <Input
                    id="recordSelector"
                    name="recordSelector"
                    value={recordSelector}
                    onChange={(event) => setRecordSelector(event.target.value)}
                    placeholder="$.products[*]"
                    className="mono"
                  />
                </Field>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-ink-subtle">Try one:</span>
                  {SHAPES.map((shape) => (
                    <button
                      key={shape.key}
                      type="button"
                      onClick={() => setRecordSelector(shape.selector)}
                      className={cn(
                        'mono rounded-sm border px-2 py-1 text-2xs',
                        'transition-colors duration-[140ms] ease-[cubic-bezier(.32,.72,0,1)]',
                        matchedShape.key === shape.key
                          ? 'border-accent-border bg-accent-soft text-accent'
                          : 'border-line bg-surface text-ink-muted hover:border-line-hover hover:text-ink',
                      )}
                    >
                      {shape.selectorLabel}
                    </button>
                  ))}
                </div>

                <Field
                  label="Extra query parameters"
                  htmlFor="query"
                  hint="One per line: key = value. Sent on every request, including every page."
                >
                  <Textarea
                    id="query"
                    name="query"
                    rows={3}
                    className="mono text-xs"
                    defaultValue={toPairs(settings.query)}
                    placeholder={'status = active\nseason = AW26'}
                  />
                </Field>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Naming the fields</CardTitle>
                <CardDescription>
                  What each record&rsquo;s values should be called when they reach the import.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <Field
                  label="Field mapping"
                  htmlFor="fieldMap"
                  hint="One per line: column name = path inside a single record. Leave it blank to bring every field through flattened, and name them at the mapping step instead."
                >
                  <Textarea
                    id="fieldMap"
                    name="fieldMap"
                    rows={6}
                    className="mono text-xs"
                    value={fieldMap}
                    onChange={(event) => setFieldMap(event.target.value)}
                    placeholder={EXAMPLE_FIELD_MAP}
                  />
                </Field>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={() => setFieldMap(EXAMPLE_FIELD_MAP)}
                  >
                    Paste the worked example
                  </Button>
                  {fieldMap.trim() !== '' ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setFieldMap('')}
                    >
                      Clear and flatten everything instead
                    </Button>
                  ) : null}
                </div>

                <p className="flex items-start gap-2 rounded-md border border-line bg-surface-sunken px-3 py-2.5 text-xs text-ink-muted">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                  <span>
                    Whatever you put on the left becomes a CSV column heading, so name it the way
                    your team names it. The import step still matches those headings to passport
                    fields and still shows you every match before anything is written.
                  </span>
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Paging</CardTitle>
                <CardDescription>
                  How to ask for the next batch. Leave it off for an endpoint that returns everything
                  at once.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <Field
                  label="Style"
                  htmlFor="paginationStyle"
                  hint="If the response carries a next cursor or a total page count, it pages."
                >
                  <NativeSelect
                    id="paginationStyle"
                    name="paginationStyle"
                    value={paginationStyle}
                    onChange={(event) =>
                      setPaginationStyle(event.target.value as PaginationSettings['style'])
                    }
                  >
                    <option value="none">None — one response holds everything</option>
                    <option value="page">Page number</option>
                    <option value="cursor">Cursor from the response</option>
                  </NativeSelect>
                </Field>

                {paginationStyle === 'none' ? (
                  <Example
                    title="What gets sent"
                    body={`GET ${settings.baseUrl || 'https://api.example.com/v1/products'}
— one request, and whatever comes back is the whole catalogue.`}
                  />
                ) : (
                  <>
                    <div className="grid gap-5 sm:grid-cols-2">
                      {paginationStyle === 'page' ? (
                        <>
                          <Field label="Page parameter" htmlFor="pageParam">
                            <Input
                              id="pageParam"
                              name="pageParam"
                              defaultValue={
                                pagination.style === 'page' ? pagination.pageParam : 'page'
                              }
                              className="mono"
                            />
                          </Field>
                          <Field label="First page is" htmlFor="startAt">
                            <NativeSelect
                              id="startAt"
                              name="startAt"
                              defaultValue={String(
                                pagination.style === 'page' ? pagination.startAt : 1,
                              )}
                            >
                              <option value="1">1</option>
                              <option value="0">0</option>
                            </NativeSelect>
                          </Field>
                        </>
                      ) : (
                        <>
                          <Field label="Cursor parameter" htmlFor="cursorParam">
                            <Input
                              id="cursorParam"
                              name="cursorParam"
                              defaultValue={
                                pagination.style === 'cursor' ? pagination.cursorParam : 'cursor'
                              }
                              className="mono"
                            />
                          </Field>
                          <Field
                            label="Cursor in the response"
                            htmlFor="cursorPath"
                            hint="Where the next cursor is, e.g. meta.nextCursor"
                          >
                            <Input
                              id="cursorPath"
                              name="cursorPath"
                              defaultValue={
                                pagination.style === 'cursor'
                                  ? pagination.cursorPath
                                  : 'meta.nextCursor'
                              }
                              className="mono"
                            />
                          </Field>
                        </>
                      )}

                      <Field label="Size parameter" htmlFor="sizeParam">
                        <Input
                          id="sizeParam"
                          name="sizeParam"
                          defaultValue={pagination.style === 'none' ? 'limit' : pagination.sizeParam}
                          className="mono"
                        />
                      </Field>
                      <Field label="Records per page" htmlFor="pageSize">
                        <Input
                          id="pageSize"
                          name="pageSize"
                          type="number"
                          min={1}
                          max={1000}
                          defaultValue={pagination.style === 'none' ? 100 : pagination.pageSize}
                          className="tabular-nums"
                        />
                      </Field>
                    </div>

                    <Example
                      title="What gets sent"
                      body={
                        paginationStyle === 'page'
                          ? `GET …/products?page=1&limit=100
GET …/products?page=2&limit=100
… until a page comes back empty or the ceiling is reached.`
                          : `GET …/products?limit=100
GET …/products?limit=100&cursor=<the value at meta.nextCursor>
… until the response carries no next cursor.`
                      }
                    />
                  </>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" loading={pending}>
            {submitLabel}
          </Button>
          <Button asChild variant="ghost">
            <Link href="/console/connectors">Cancel</Link>
          </Button>
          <p className="text-sm text-ink-muted">
            Saving fetches nothing. Test the connection afterwards.
          </p>
        </div>
      </div>

      {kind === 'rest' ? (
        <aside className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-8 xl:self-start">
          <section className="rounded-lg border border-line bg-surface p-5">
            <p className="eyebrow">Worked example</p>
            <h2 className="mt-1 text-sm font-semibold text-ink">Find your shape</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
              Open your endpoint in a browser and compare. The line under the matching block is your
              record selector.
            </p>

            <ul className="mt-3 flex flex-col gap-2.5">
              {SHAPES.map((shape) => {
                const active = matchedShape.key === shape.key;
                return (
                  <li
                    key={shape.key}
                    className={cn(
                      'overflow-hidden rounded-md border',
                      'transition-colors duration-[140ms] ease-[cubic-bezier(.32,.72,0,1)]',
                      active ? 'border-accent-border bg-accent-soft/40' : 'border-line bg-surface',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <span
                        className={cn(
                          'text-xs font-medium',
                          active ? 'text-accent' : 'text-ink-muted',
                        )}
                      >
                        {shape.title}
                      </span>
                      {active ? (
                        <CheckCircle2 className="size-3.5 shrink-0 text-accent" aria-hidden />
                      ) : null}
                    </div>
                    <pre className="mono overflow-x-auto border-t border-line bg-surface-sunken px-3 py-2 text-2xs leading-relaxed text-ink-muted">
                      {shape.body}
                    </pre>
                    <p className="flex items-center gap-1.5 px-3 py-2 text-2xs text-ink-subtle">
                      Selector:
                      <span className="mono text-ink">{shape.selectorLabel}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-lg border border-line bg-surface p-5">
            <p className="eyebrow">Worked example</p>
            <h2 className="mt-1 text-sm font-semibold text-ink">Naming the fields</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
              One record from the list, and the mapping that flattens it into columns.
            </p>

            <p className="eyebrow mt-3 mb-1.5">One record</p>
            <pre className="mono overflow-x-auto rounded-md border border-line bg-surface-sunken px-3 py-2 text-2xs leading-relaxed text-ink-muted">
              {EXAMPLE_RECORD}
            </pre>

            <p className="eyebrow mt-3 mb-1.5">This mapping</p>
            <pre className="mono overflow-x-auto rounded-md border border-line bg-surface-sunken px-3 py-2 text-2xs leading-relaxed text-ink">
              {EXAMPLE_FIELD_MAP}
            </pre>

            <p className="eyebrow mt-3 mb-1.5">Produces these columns</p>
            <div className="overflow-hidden rounded-md border border-line">
              <table className="w-full text-left">
                <thead className="border-b border-line bg-surface-sunken">
                  <tr>
                    {['Product', 'Style', 'GTIN', 'Size'].map((header) => (
                      <th
                        key={header}
                        scope="col"
                        className="mono px-2 py-1.5 text-2xs font-medium text-ink-subtle"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {['Cropped Organic Tee', 'NB-4471', '5012345678900', 'M'].map((value) => (
                      <td key={value} className="mono px-2 py-1.5 text-2xs text-ink">
                        {value}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-3 flex items-start gap-1.5 text-2xs leading-relaxed text-ink-subtle">
              <ArrowRight className="mt-0.5 size-3 shrink-0" aria-hidden />
              Those four headings are then matched to passport fields at the mapping step, exactly as
              though you had uploaded a spreadsheet with them.
            </p>
          </section>
        </aside>
      ) : null}
    </form>
  );
}

/** A small block of literal text: what would go over the wire, verbatim. */
function Example({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="eyebrow mb-1.5">{title}</p>
      <pre className="mono overflow-x-auto rounded-md border border-line bg-surface-sunken px-3 py-2 text-2xs leading-relaxed text-ink-muted">
        {body}
      </pre>
    </div>
  );
}

function toPairs(record: Record<string, string> | undefined): string {
  return Object.entries(record ?? {})
    .map(([key, value]) => `${key} = ${value}`)
    .join('\n');
}
