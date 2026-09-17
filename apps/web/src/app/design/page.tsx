import { notFound } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SERIES, RAMP } from '@/components/viz/tokens';
import { STATUS_ORDER, statusTone } from '@/components/viz/status-colour';
import { STATUS_LABELS } from '@/lib/passport/state';

export const metadata = { title: 'Design system' };

/**
 * The type specimen.
 *
 * A design system that only exists in a stylesheet gets re-invented by whoever
 * is building the next screen. This page renders every role at its real size,
 * with its real tracking, against the real surfaces, so a decision can be
 * checked by looking rather than by reading CSS.
 *
 * Development only. It is documentation, not product, and shipping it would put
 * an unauthenticated page of internals on a customer's domain.
 */
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="mx-auto max-w-4xl px-8 py-16">
      <header className="mb-16">
        <p className="eyebrow">Polytrail</p>
        <h1 className="title-1 mt-3 text-ink">Design system</h1>
        <p className="body-1 mt-2 max-w-prose text-ink-muted">
          Every type role at its real size and tracking. Geist for the product, Instrument Serif
          for the public passport, Geist Mono for anything that is data rather than prose.
        </p>
      </header>

      <Section title="Display" note="Serif, weight 400. The public passport headline, and nothing else.">
        <Specimen role="display-1" spec="56px · 1.02 · −0.028em" />
        <Specimen role="display-2" spec="44px · 1.06 · −0.024em" />
        <Specimen role="display-3" spec="34px · 1.12 · −0.02em" />
      </Section>

      <Section title="Title" note="Geist 600. Page and section headings. Tracking tightens as size grows.">
        <Specimen role="title-1" spec="28px · 1.2 · −0.019em" />
        <Specimen role="title-2" spec="21px · 1.28 · −0.014em" />
        <Specimen role="title-3" spec="16px · 1.4 · −0.008em" />
        <Specimen role="title-4" spec="14px · 1.45 · −0.003em" />
      </Section>

      <Section title="Body" note="Geist 400. Prose and table cells. Leading opens up as size drops.">
        <Specimen role="body-1" spec="16px · 1.6 · −0.005em" />
        <Specimen role="body-2" spec="14px · 1.55 · 0" sample="The default. Everything in the console that is not a heading, a label or an identifier is set in this." />
        <Specimen role="body-3" spec="13px · 1.5 · +0.002em" />
      </Section>

      <Section title="Label" note="Geist 500. Form labels, table headers, metadata. Tracking opens as size drops.">
        <Specimen role="label-1" spec="14px · 1.3 · 0" />
        <Specimen role="label-2" spec="13px · 1.25 · +0.004em" />
        <Specimen role="label-3" spec="12px · 1.2 · +0.008em" />
        <div className="flex items-baseline gap-6 border-t border-line py-3">
          <span className="w-28 shrink-0 text-2xs text-ink-subtle">eyebrow</span>
          <span className="eyebrow">Section marker</span>
          <span className="ml-auto mono-2 text-ink-subtle">11px · +0.085em · uppercase</span>
        </div>
      </Section>

      <Section title="Mono" note="Geist Mono. Identifiers, hashes, GTINs, tokens. Never prose.">
        <div className="flex items-baseline gap-6 border-t border-line py-3">
          <span className="w-28 shrink-0 text-2xs text-ink-subtle">mono-1</span>
          <span className="mono-1 text-ink">4BJ7-EMGQ-DD2R-KBKA</span>
          <span className="ml-auto mono-2 text-ink-subtle">13px · −0.01em</span>
        </div>
        <div className="flex items-baseline gap-6 border-t border-line py-3">
          <span className="w-28 shrink-0 text-2xs text-ink-subtle">mono-2</span>
          <span className="mono-2 text-ink">0x9f2c4e8a1b7d3f60c5a8e2b94d17f3a6</span>
          <span className="ml-auto mono-2 text-ink-subtle">12px · −0.008em</span>
        </div>
      </Section>

      <Section
        title="Tabular figures"
        note="Proportional digits make a column of percentages ripple. Every number in this product is tabular."
      >
        <div className="grid grid-cols-2 gap-8 border-t border-line pt-4">
          <div>
            <p className="label-3 mb-2 text-ink-subtle">Proportional — wrong</p>
            <ul
              className="body-2 text-ink"
              style={{
                fontVariantNumeric: 'proportional-nums',
                fontFeatureSettings: "'tnum' 0, 'pnum' 1",
              }}
            >
              <li>11.11</li>
              <li>88.88</li>
              <li>10.01</li>
              <li>97.70</li>
            </ul>
          </div>
          <div>
            <p className="label-3 mb-2 text-ink-subtle">Tabular — right</p>
            <ul
              className="body-2 text-ink"
              style={{ fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum' 1" }}
            >
              <li>11.11</li>
              <li>88.88</li>
              <li>10.01</li>
              <li>97.70</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Ink" note="Three weights of text colour. Never opacity — it muddies against a tinted ground.">
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="body-2 text-ink">Primary — the content itself</p>
          <p className="body-2 text-ink-muted">Muted — supporting prose and secondary values</p>
          <p className="body-2 text-ink-subtle">Subtle — metadata, units, timestamps</p>
        </div>
      </Section>

      <Section title="Categorical" note="Eight slots, assigned in fixed order and never cycled. Validated for colour-blind separation against both surfaces.">
        <div className="grid grid-cols-4 gap-3 border-t border-line pt-4 sm:grid-cols-8">
          {SERIES.map((colour, i) => (
            <div key={colour} className="flex flex-col gap-1.5">
              <span className="h-12 rounded-sm" style={{ background: colour }} />
              <span className="mono-2 text-ink-subtle">{i + 1}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Sequential" note="One hue, light to dark, for magnitude. Never a rainbow — a rainbow invents category boundaries that are not in the data.">
        <div className="flex gap-1 border-t border-line pt-4">
          {RAMP.map((colour) => (
            <span key={colour} className="h-12 flex-1 rounded-sm" style={{ background: colour }} />
          ))}
        </div>
      </Section>

      <Section title="Status" note="Reserved. A status never takes a categorical hue — a suspended item in categorical green reads as healthy.">
        <ul className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4">
          {STATUS_ORDER.map((status) => (
            <li key={status} className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{ background: statusTone(status) }}
                aria-hidden
              />
              <span className="body-3 text-ink-muted">{STATUS_LABELS[status]}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Two grounds"
        note="This product has two grounds, not two themes. Content follows the theme; chrome is always dark, in both. Chrome frames, content contains — and the line between the tool and the document gets drawn without a single divider."
      >
        <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
          <GroundSample />
          <GroundSample chrome />
        </div>
        <p className="body-3 mt-5 max-w-prose text-ink-subtle">
          Both panels above render the <em>same</em> markup. Nothing is passed a variant, a{' '}
          <span className="mono-2">tone</span> prop or a <span className="mono-2">dark:</span>{' '}
          class — the right-hand one is wrapped in{' '}
          <span className="mono-2">.on-chrome</span>, which re-points the semantic roles
          underneath it. That is the entire reason roles are named for the job they do rather
          than the colour they happen to be.
        </p>
        <p className="body-3 mt-3 max-w-prose text-ink-subtle">
          <span className="mono-2">dark:</span> variants cannot do this job: chrome is dark in the
          light theme too, so a variant bound to the theme is bound to the wrong thing. Reach for
          chrome when an element frames rather than contains — navigation, a featured metric, a
          footer. Never nest one inside another.
        </p>
      </Section>

      <Section
        title="Elevation"
        note="Five rungs, each built from the same physical model: a contact layer that never changes, an ambient layer that doubles with the rung, and opacity that grows far slower than blur. Warm-tinted, never black — black over a warm neutral reads as dirt."
      >
        <div className="grid grid-cols-2 gap-5 border-t border-line pt-6 sm:grid-cols-5">
          {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((step) => (
            <div key={step} className="flex flex-col items-center gap-2.5">
              <span
                className="h-16 w-full rounded-lg border border-line bg-surface"
                style={{ boxShadow: `var(--shadow-${step})` }}
              />
              <span className="mono-2 text-ink-subtle">{step}</span>
            </div>
          ))}
        </div>
        <p className="body-3 mt-5 max-w-prose text-ink-subtle">
          A card at rest is <span className="mono-2">xs</span>; a sheet that has genuinely left the
          page is <span className="mono-2">xl</span>. Anything between them is a step, not a new
          value — a one-off shadow is how a system acquires a second, undocumented scale.
        </p>
      </Section>

      <Section
        title="Radius"
        note="Small and deliberate. Rounding everything to the same soft corner is the fastest way to make an instrument look like a toy; only a chip is ever a pill."
      >
        <div className="flex flex-wrap items-end gap-5 border-t border-line pt-6">
          {(
            [
              ['xs', 'badge'],
              ['sm', 'input, row'],
              ['md', 'button'],
              ['lg', 'card'],
              ['xl', 'sheet'],
            ] as const
          ).map(([step, use]) => (
            <div key={step} className="flex flex-col items-center gap-2">
              <span
                className="size-16 border border-line-strong bg-surface-sunken"
                style={{ borderRadius: `var(--radius-${step})` }}
              />
              <span className="mono-2 text-ink-subtle">{step}</span>
              <span className="text-2xs text-ink-subtle">{use}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Motion"
        note="Motion has one job: to say where something came from, so a change of state reads as a movement rather than a redraw. Anything that only decorates is removed — and everything here is removed outright under prefers-reduced-motion."
      >
        <dl className="border-t border-line pt-4">
          {(
            [
              ['instant', '40ms', 'colour on press — below the threshold of being seen as motion'],
              ['fast', '100ms', 'hover feedback'],
              ['base', '150ms', 'the default: disclosure, tab change'],
              ['moderate', '200ms', 'a panel changing size'],
              ['slow', '300ms', 'an element entering the page'],
              ['sheet', '500ms', 'a dialog or drawer arriving'],
              ['narrative', '800ms', 'a figure counting, a ring drawing'],
            ] as const
          ).map(([name, value, use]) => (
            <div key={name} className="flex items-baseline gap-4 border-b border-line py-2.5">
              <dt className="mono-2 w-24 shrink-0 text-ink">{name}</dt>
              <dd className="mono-2 w-16 shrink-0 text-ink-subtle tabular-nums">{value}</dd>
              <dd className="body-3 min-w-0 flex-1 text-ink-muted">{use}</dd>
            </div>
          ))}
        </dl>
        <p className="body-3 mt-5 max-w-prose text-ink-subtle">
          Two easings carry almost everything: <span className="mono-2">ease-out</span> for
          anything arriving, because it should decelerate into place, and{' '}
          <span className="mono-2">ease-standard</span> for anything already on screen changing.
          Nothing in this product eases in — an element that accelerates away is an element the
          reader loses.
        </p>
      </Section>

      <Section
        title="Avatar"
        note="One primitive, four sizes. It exists because the same eight lines of initials-from-a-name had been written out three times and all three had drifted."
      >
        <div className="flex items-end gap-6 border-t border-line pt-6">
          {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
            <div key={size} className="flex flex-col items-center gap-2">
              <Avatar name="Ada Okonkwo" size={size} />
              <span className="mono-2 text-ink-subtle">{size}</span>
            </div>
          ))}
          <div className="flex flex-col items-center gap-2">
            <Avatar name="Ada Okonkwo" size="lg" tone="rail" className="bg-rail" />
            <span className="mono-2 text-ink-subtle">rail</span>
          </div>
        </div>
        <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
          {['Ada Okonkwo', 'Meridian', 'Maria da Silva Santos', 'admin@aeiforo.co.uk', ''].map(
            (name, i) => (
              <li key={i} className="flex items-center gap-2">
                <Avatar name={name} size="sm" />
                <span className="mono-2 text-ink-subtle">{name || '(empty)'}</span>
              </li>
            ),
          )}
        </ul>
      </Section>
    </main>
  );
}

/**
 * The same markup, twice.
 *
 * Deliberately written once and rendered on both grounds: if this component
 * ever needs a branch on `chrome` beyond the wrapper class itself, the claim
 * on the page above it has stopped being true and the system has a hole in it.
 */
function GroundSample({ chrome }: { chrome?: boolean }) {
  return (
    <div className={chrome ? 'on-chrome p-6' : 'bg-surface p-6'}>
      <p className="eyebrow text-ink-subtle">{chrome ? 'Chrome' : 'Content'}</p>
      <p className="title-3 mt-2 text-ink">Coastline Half-Zip</p>
      <p className="body-3 mt-1 text-ink-muted">
        Supporting prose sits at muted; metadata drops to subtle.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm">Publish</Button>
        <Button size="sm" variant="secondary">
          Preview
        </Button>
        <Badge tone="positive">Published</Badge>
        <Badge tone="caution">In review</Badge>
      </div>

      <div className="mt-4 rounded-md border border-line bg-surface p-3">
        <p className="text-2xs text-ink-subtle">A card on this ground</p>
        <p className="mono-2 mt-1 text-ink">NF78-70H8-CBB6-AJSE</p>
      </div>

      <p className="mt-4 flex items-center gap-2 text-xs">
        <span className="size-1.5 rounded-full bg-critical" aria-hidden />
        <span className="text-critical">A failure still reads as a failure</span>
      </p>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-14">
      <h2 className="title-3 text-ink">{title}</h2>
      <p className="body-3 mt-1 mb-4 max-w-prose text-ink-muted">{note}</p>
      {children}
    </section>
  );
}

function Specimen({
  role,
  spec,
  sample = 'Digital Product Passport',
}: {
  role: string;
  spec: string;
  sample?: string;
}) {
  return (
    <div className="flex items-baseline gap-6 border-t border-line py-3">
      <span className="w-28 shrink-0 text-2xs text-ink-subtle">{role}</span>
      <span className={`${role} min-w-0 flex-1 text-ink`}>{sample}</span>
      <span className="mono-2 hidden shrink-0 text-ink-subtle sm:block">{spec}</span>
    </div>
  );
}
