import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { AlertTriangle, BadgeCheck, Leaf, Lock } from 'lucide-react';
import { resolvePublicPassport } from '@/lib/passport/public';
import { carrierSvg, carrierTarget } from '@/lib/passport/qr';
import { formatDppId, passportUrl } from '@/lib/passport/identifier';
import { CATEGORIES, type CategoryKey } from '@/lib/passport/vocab';
import { Section, Eyebrow, Row } from './components/section';
import { VerdictBand } from './components/verdict';
import { CompositionSection, countryName } from './components/composition';
import { JourneySection } from './components/journey';
import { LifeSection } from './components/life';
import { CareSection, localize, formatDate } from './components/care';
import { KeepGoingSection } from './components/keep-going';
import { CircularitySection } from './components/circularity';
import { ProvenanceSection } from './components/provenance';

/**
 * The public passport.
 *
 * Three commitments shape this file, each a direct response to what ships in
 * this category today:
 *
 *   1. It is a server component with no client bundle of its own, so the page
 *      renders completely with scripting disabled. Every competing passport
 *      built as a single-page app returns a blank document to a crawler, an
 *      archive, an accessibility tool, or a phone on a bad connection in a
 *      shop basement — which is precisely where these get scanned.
 *   2. An unknown identifier returns a real 404. Live resolvers in this market
 *      answer HTTP 200 with a generic shell for products that do not exist,
 *      which breaks every machine client that trusts status codes.
 *   3. Withheld data is shown as withheld. A passport that silently omits
 *      restricted fields reads as though the brand has nothing to declare.
 */

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ dppId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { dppId } = await params;
  const passport = await resolvePublicPassport(dppId);
  if (!passport) return { title: 'Passport not found' };

  const name = localize(passport.payload.identity?.productName, 'en');
  return {
    title: `${name} — ${passport.brand.name}`,
    description: `Digital Product Passport for ${name}: what it is made of, where it was made, how to care for it, and what to do with it at end of life.`,
    // A passport is addressed by the label on the garment, not by search. It
    // also carries a brand's sourcing detail, which has no business being
    // indexed and aggregated by third parties.
    robots: { index: false, follow: false },
    alternates: { types: { 'application/json': `/p/${passport.dppId}/dpp.json` } },
  };
}

export default async function PassportPage({ params }: Props) {
  const { dppId } = await params;
  const locale = await getLocale();
  const passport = await resolvePublicPassport(dppId, 'public', await headers());

  if (!passport) notFound();

  const { payload, brand } = passport;
  const identity = payload.identity;
  const productName = localize(identity?.productName, locale);
  const category = identity?.category
    ? CATEGORIES[identity.category as CategoryKey]?.label
    : undefined;

  const url = passportUrl(passport.dppId);
  const jsonUrl = `${url}/dpp.json`;

  // The same carrier the garment's label carries: a GS1 Digital Link where a
  // GTIN exists, the canonical URL otherwise. On the page it serves the second
  // reader — the passport gets shown across a counter, photographed for a
  // resale listing, passed to a repairer — who scans the screen, not the label.
  const carrier = carrierTarget({ dppId: passport.dppId, gtin: identity?.gtin });
  const qrSvg = await carrierSvg(carrier.uri);

  // The two facts worth floating over the hero: how much of the chain is
  // independently evidenced, and the footprint. Both mirror the verdict band's
  // own arithmetic; a chip that disagreed with the band would be worse than
  // no chip.
  const steps = payload.supplyChain?.steps ?? [];
  const verifiedSteps = steps.filter(
    (step) => step.evidence === 'document_verified' || step.evidence === 'third_party_audited',
  ).length;
  const carbonKg = payload.environment?.carbon?.totalKgCo2e;

  // Group withheld fields by the audience that could read them, so the notice
  // can say who the data is available to rather than simply that it is hidden.
  const withheldAudiences = new Set<string>();
  for (const field of passport.withheld) {
    for (const audience of field.audiences) withheldAudiences.add(audience);
  }

  return (
    <>
      {/*
        GS1 link types. A conformant client discovers the passport's other
        representations from these rather than by scraping the page. Serving
        them costs nothing and no competitor does it.
      */}
      <link rel="alternate" type="application/json" href={jsonUrl} />
      <link rel="https://gs1.org/voc/defaultLink" href={url} />
      <link rel="https://gs1.org/voc/traceability" href={`${url}#journey`} />
      <link rel="https://gs1.org/voc/instructions" href={`${url}#care`} />
      <link rel="https://gs1.org/voc/sustainabilityInfo" href={`${url}#composition`} />

      {/* The grain is what stops a full-bleed neutral page reading as flat
          digital grey — the same reason paper certificates are not laser-flat. */}
      <div className="grain min-h-dvh bg-canvas">
        <main className="mx-auto w-full max-w-[720px] px-5 sm:px-8">
          {passport.status === 'recalled' ? <RecallBanner passport={passport} /> : null}

          {/* ── Identity ─────────────────────────────────────────────────────
              One card, not four loose blocks.

              A passport is *shown*: held up at a repair counter, photographed
              into a resale listing, screenshotted into a warranty claim.
              Everything the person on the other side needs in order to trust
              it — who issued it, what it is, the code that resolves it, the
              identifiers that address it — has to sit on one object they can
              capture in a single frame. Scattered across a masthead, a plate,
              a QR figure and a row of pills, it only cohered on a wide screen
              and never survived a photograph.

              The card is a real 3D object: a two-degree resting tilt, a slow
              drift, chips floating above its surface, and it turns to face the
              reader on hover. All of it CSS — this page still ships no
              JavaScript of its own.                                       ── */}
          <header className="hero-stage animate-in-scale py-10 sm:py-14">
            <article className="hero-object hero-card">
              {/* Masthead: who issued it, what it is, and the carrier that
                  resolves it. White QR plate in both themes — see
                  `.passport-qr`; a themed code is one a scanner cannot read. */}
              <div className="flex items-start gap-4 border-b border-line p-5 sm:gap-5 sm:p-6">
                <div
                  className="passport-qr w-[4.5rem] shrink-0 border border-line shadow-xs sm:w-20"
                  role="img"
                  aria-label="QR code linking to this passport"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold tracking-[-0.01em] text-ink">
                      {brand.name}
                    </p>
                    <Eyebrow>Product passport</Eyebrow>
                  </div>
                  <h1 className="display-3 mt-1.5 text-ink sm:text-[2.5rem]">
                    {productName}
                  </h1>
                  <p className="mt-1.5 text-sm text-ink-muted">
                    {[
                      category,
                      identity?.colourName,
                      identity?.size ? `Size ${identity.size}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>

              {/* The garment, contained rather than cropped: a technical flat
                  cut off at the shoulders identifies nothing. The woven swatch
                  holds the same space when a passport has no image yet, so the
                  card never changes shape between products. */}
              <div className="p-5 sm:p-6">
                <div className="flex aspect-[3/2] items-center justify-center overflow-hidden rounded-lg bg-surface-sunken">
                  {identity?.images?.[0]?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={identity.images[0].url}
                      alt={identity.images[0].alt ?? ''}
                      width={320}
                      height={400}
                      className="h-full w-auto object-contain"
                    />
                  ) : (
                    <span className="passport-swatch size-full" aria-hidden />
                  )}
                </div>
              </div>

              {/* The identifiers as a record rather than as loose pills. */}
              <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-line p-5 sm:grid-cols-4 sm:p-6">
                <Fact label="Passport" value={formatDppId(passport.dppId)} mono />
                {identity?.gtin ? <Fact label="GTIN" value={identity.gtin} mono /> : null}
                {identity?.sku ? <Fact label="SKU" value={identity.sku} mono /> : null}
                <Fact
                  label="Carrier"
                  value={carrier.scheme === 'gs1' ? 'GS1 Digital Link' : 'Passport URL'}
                />
              </dl>

              {/* Floating facts, not decoration: each chip restates a figure
                  the page substantiates below. A chip that disagreed with the
                  verdict band would be worse than no chip, so both are derived
                  from the same payload the band reads. */}
              {steps.length > 0 ? (
                <span className="hero-chip hero-chip-a" aria-hidden>
                  <BadgeCheck className="size-3.5 shrink-0 text-positive" />
                  <span className="text-2xs font-medium whitespace-nowrap text-ink">
                    {verifiedSteps}/{steps.length} steps verified
                  </span>
                </span>
              ) : null}
              {typeof carbonKg === 'number' ? (
                <span className="hero-chip hero-chip-b" aria-hidden>
                  <Leaf className="size-3.5 shrink-0 text-ink-muted" />
                  <span className="text-2xs font-medium whitespace-nowrap text-ink tabular-nums">
                    {carbonKg >= 100 ? Math.round(carbonKg) : carbonKg.toFixed(1)} kg CO₂e
                  </span>
                </span>
              ) : null}
            </article>
          </header>

          {/* ── Verdict ──────────────────────────────────────────────────── */}
          <VerdictBand payload={payload} />

          {/* ── Sections ─────────────────────────────────────────────────── */}
          <div className="passport-sections flex flex-col">
            <Section
              id="composition"
              title="What it's made of"
              hint={compositionHint(payload)}
              defaultOpen
            >
              <CompositionSection payload={payload} />
            </Section>

            <Section
              id="journey"
              title="Where it was made"
              hint={journeyHint(payload)}
              defaultOpen
            >
              <JourneySection payload={payload} />
            </Section>

            {/* The downstream story, directly after the upstream one: where it
                was made, then what has happened to it since. Open by default
                when there is anything beyond manufacture to show — a garment
                that has been repaired and resold has earned the reader's
                attention more than any claim the brand makes about it. */}
            <Section
              id="life"
              title="What's happened since"
              hint={lifeHint(passport.events, passport.eventsWithheld)}
              defaultOpen={passport.events.length > 2}
            >
              <LifeSection
                events={passport.events}
                withheldCount={passport.eventsWithheld}
                locale={locale}
              />
            </Section>

            <Section id="care" title="Care and repair" hint={careHint(payload)}>
              <CareSection payload={payload} locale={locale} />
            </Section>

            <Section id="keep-going" title="Keep it going" defaultOpen>
              <KeepGoingSection payload={payload} locale={locale} />
            </Section>

            <Section id="end-of-life" title="End of life" hint={circularityHint(payload)}>
              <CircularitySection payload={payload} locale={locale} />
            </Section>

            <Section id="provenance" title="Proof and provenance">
              <ProvenanceSection
                payload={payload}
                dataHash={passport.dataHash}
                version={passport.version}
                publishedAt={passport.publishedAt}
                brand={brand}
              />
            </Section>

            {identity?.economicOperators?.length ? (
              <Section id="operator" title="Who is responsible">
                <dl className="flex flex-col">
                  {identity.economicOperators.map((operator) => (
                    <div key={operator.name} className="flex flex-col gap-0 py-1">
                      <Row label="Name" value={operator.name} />
                      <Row label="Role" value={operatorRole(operator.role)} />
                      {operator.address ? (
                        <Row
                          label="Address"
                          value={[
                            operator.address.line1,
                            operator.address.postalCode,
                            operator.address.city,
                            countryName(operator.address.country),
                          ]
                            .filter(Boolean)
                            .join(', ')}
                        />
                      ) : null}
                      {operator.email ? <Row label="Contact" value={operator.email} /> : null}
                      {operator.lei ? (
                        <Row
                          label="Legal Entity Identifier"
                          value={<span className="mono">{operator.lei}</span>}
                          note="ISO 17442 — the identifier the EU DPP registry uses to identify an economic operator."
                        />
                      ) : null}
                    </div>
                  ))}
                </dl>
              </Section>
            ) : null}
          </div>

          {/* ── Withheld ─────────────────────────────────────────────────── */}
          {passport.withheld.length > 0 ? (
            <section className="mt-8 flex gap-3 rounded-md border border-line bg-surface-sunken/60 px-4 py-3.5">
              <Lock className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
              <p className="text-xs leading-relaxed text-ink-muted">
                <strong className="font-medium text-ink">
                  {passport.withheld.length} further{' '}
                  {passport.withheld.length === 1 ? 'field is' : 'fields are'} recorded on this
                  passport
                </strong>{' '}
                and released to{' '}
                {[...withheldAudiences]
                  .filter((a) => a !== 'public')
                  .map(audienceNoun)
                  .join(', ')}{' '}
                rather than published openly — commercially sensitive detail such as facility
                names, test measurements and audit findings. Authorities see the complete record.
              </p>
            </section>
          ) : null}

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <footer className="mt-10 mb-16 flex flex-col gap-4 border-t border-line pt-7">
            <p className="text-xs text-ink-muted">
              Passport version {passport.version}
              {passport.publishedAt ? `, issued ${formatDate(passport.publishedAt, locale)}` : ''}.
              {passport.updatedAt !== passport.publishedAt
                ? ` Last updated ${formatDate(passport.updatedAt, locale)}.`
                : ''}
            </p>
            <p className="text-xs text-ink-muted">
              <a href={jsonUrl} className="text-accent underline underline-offset-4">
                Machine-readable version
              </a>
              {brand.supportUrl ? (
                <>
                  {' · '}
                  <a href={brand.supportUrl} className="text-accent underline underline-offset-4">
                    Report an error in this passport
                  </a>
                </>
              ) : null}
            </p>
            {brand.footerText ? (
              <p className="text-2xs text-ink-subtle">{brand.footerText}</p>
            ) : null}
            <p className="text-2xs text-ink-subtle">
              Published with Polytrail. Data is supplied by the economic operator named above.
            </p>
          </footer>
        </main>
      </div>
    </>
  );
}

/** One identifier on the hero card: an eyebrow label over its value. */
function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow mb-1 text-ink-subtle">{label}</dt>
      <dd className={mono ? 'mono truncate text-xs text-ink' : 'truncate text-sm text-ink'}>
        {value}
      </dd>
    </div>
  );
}

function RecallBanner({
  passport,
}: {
  passport: NonNullable<Awaited<ReturnType<typeof resolvePublicPassport>>>;
}) {
  return (
    <div
      role="alert"
      className="-mx-5 mt-0 border-b border-critical-border bg-critical-soft px-5 py-5 sm:-mx-8 sm:px-8"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-critical">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        This product has been recalled
      </p>
      {passport.recall?.reason ? (
        <p className="mt-2 text-sm text-ink">{passport.recall.reason}</p>
      ) : null}
      {passport.recall?.instructions ? (
        <p className="mt-2 text-sm text-ink-muted">{passport.recall.instructions}</p>
      ) : null}
    </div>
  );
}

/* ── Closed-row hints ────────────────────────────────────────────────────
   Each closed section states what is inside it, so a reader can decide
   whether to open it without opening it.                                  */

function compositionHint(payload: { composition?: { overall?: Array<{ fibre: string; percentage: number }> } }) {
  const overall = payload.composition?.overall;
  if (!overall?.length) return undefined;
  const top = [...overall].sort((a, b) => b.percentage - a.percentage)[0]!;
  return overall.length === 1
    ? `100% ${top.fibre}`
    : `${overall.length} fibres`;
}

/**
 * The closed-row summary. It names the *interesting* count rather than the
 * total: "manufactured, placed on market" is every garment's first two rows
 * and says nothing, whereas "2 repairs" is the reason to open the section.
 */
function lifeHint(
  events: Array<{ type: string }>,
  withheld: number,
): string | undefined {
  const total = events.length + withheld;
  if (total === 0) return undefined;

  const interesting = events.filter(
    (e) => e.type !== 'manufactured' && e.type !== 'placed_on_market' && e.type !== 'sold',
  ).length;

  if (interesting === 0) return withheld > 0 ? `${total} entries` : 'Nothing since it was made';
  return `${interesting} ${interesting === 1 ? 'entry' : 'entries'} since`;
}

function journeyHint(payload: { supplyChain?: { steps?: unknown[] } }) {
  const steps = payload.supplyChain?.steps;
  if (!steps?.length) return undefined;
  return `${steps.length} steps`;
}

function careHint(payload: { care?: { symbols?: unknown[] } }) {
  const symbols = payload.care?.symbols;
  return symbols?.length ? `${symbols.length} instructions` : undefined;
}

function circularityHint(payload: {
  circularity?: { recyclability?: { recyclableShare?: number } };
}) {
  const share = payload.circularity?.recyclability?.recyclableShare;
  return typeof share === 'number' ? `${share}% recyclable` : undefined;
}

function operatorRole(role: string): string {
  const labels: Record<string, string> = {
    manufacturer: 'Manufacturer',
    importer: 'Importer',
    authorised_representative: 'Authorised representative',
    distributor: 'Distributor',
    fulfilment_service_provider: 'Fulfilment service provider',
  };
  return labels[role] ?? role;
}

function audienceNoun(audience: string): string {
  const nouns: Record<string, string> = {
    consumer: 'verified owners',
    retailer: 'trade partners',
    repairer: 'repair partners',
    recycler: 'recyclers',
    authority: 'authorities',
  };
  return nouns[audience] ?? audience;
}
