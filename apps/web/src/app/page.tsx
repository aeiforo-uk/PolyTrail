import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Factory,
  FileCheck2,
  Globe,
  Hammer,
  Landmark,
  Leaf,
  Link2,
  Recycle,
  Repeat,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/logo';
import { carrierSvg } from '@/lib/passport/qr';
import { appUrlFor } from '@/lib/app-url';

/**
 * The cover page.
 *
 * Every claim on it is something the product does today, worded the way the
 * compliance position in `docs/COMPLIANCE.md` allows. That rules out most of
 * what this category's landing pages say: there is no textile delegated act
 * yet, so nothing here names a deadline, and nothing implies that lifecycle
 * events or tier mapping are regulatory requirements when they are not.
 *
 * It ships no JavaScript of its own. The product's pitch is a passport that
 * loads on a phone in a shop basement with scripting off; the page making
 * that pitch is held to the same standard. Every movement is CSS — the hero's
 * staggered arrival, the card's drift, the scroll-driven section reveals —
 * and all of it is removed under `prefers-reduced-motion`.
 *
 * The QR code in the hero is real. It encodes `/p/demo`, so a visitor who
 * scans the screen lands on the demo passport, which is the fastest possible
 * answer to "what does this actually look like".
 */

export default async function HomePage() {
  const qrSvg = await carrierSvg(appUrlFor('/p/demo'), { margin: 1 });

  return (
    <div className="grain min-h-dvh bg-canvas">
      <SiteNav />
      <main>
        <Hero qrSvg={qrSvg} />
        <ProofStrip />
        <Pillars />
        <Surfaces />
        <Life />
        <Closing />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ── Nav ───────────────────────────────────────────────────────────────── */

function SiteNav() {
  return (
    <header className="animate-in-fade mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
      <Link href="/" className="rounded-md">
        <Logo tone="brand" subtitle="Product passports" />
      </Link>
      <nav className="flex items-center gap-1">
        <Button asChild variant="ghost" size="sm">
          <Link href="/p/demo">See a passport</Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href="/login">Sign in</Link>
        </Button>
      </nav>
    </header>
  );
}

/* ── Hero ──────────────────────────────────────────────────────────────── */

function Hero({ qrSvg }: { qrSvg: string }) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-16 pb-24 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:pt-24 md:pb-32">
      <div className="flex flex-col gap-6">
        <p className="animate-in-up eyebrow">Digital Product Passports for textiles</p>
        <h1
          className="animate-in-up stagger-1 display text-5xl leading-[1.02] text-ink md:text-6xl"
          style={{ textWrap: 'balance' }}
        >
          One record per garment, read by everyone who touches it.
        </h1>
        <p className="animate-in-up stagger-2 max-w-[44ch] text-lg leading-relaxed text-ink-muted">
          Written once by the brand and its suppliers. Read differently by a shopper, a repairer,
          a recycler and a regulator. Kept honest by a publication gate that refuses a claim it
          cannot substantiate.
        </p>
        <div className="animate-in-up stagger-3 flex flex-wrap gap-3 pt-2">
          <Button asChild size="lg">
            <Link href="/p/demo">
              See a passport
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/console">Open the console</Link>
          </Button>
        </div>
        <p className="animate-in-up stagger-4 text-xs text-ink-subtle">
          The passport page renders completely with scripting disabled. So does this one.
        </p>
      </div>

      {/* The product as an object. Same card, same CSS, as the public
          passport's hero — a cover page that shows something other than the
          real thing is a promise the product then has to keep. */}
      <div className="hero-stage animate-in-scale stagger-2 mx-auto w-full max-w-sm md:justify-self-end">
        <article className="hero-object hero-card">
          <div className="flex items-start gap-4 border-b border-line p-5">
            <div
              className="passport-qr w-16 shrink-0 border border-line shadow-xs"
              role="img"
              aria-label="QR code that opens the demo passport"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold tracking-[-0.01em] text-ink">Meridian</p>
                <span className="eyebrow text-ink-subtle">Passport</span>
              </div>
              <p className="display-3 mt-1.5 text-ink">Coastline Half-Zip</p>
              <p className="mt-1 text-sm text-ink-muted">Knitwear · Deep Navy · Size M</p>
            </div>
          </div>

          <div className="p-5">
            <div className="flex aspect-[3/2] items-center justify-center overflow-hidden rounded-lg bg-surface-sunken">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/products/coastline-half-zip-navy.svg"
                alt="Technical flat of the Coastline Half-Zip"
                width={320}
                height={400}
                className="h-full w-auto object-contain"
              />
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-4 border-t border-line p-5">
            <Fact label="Fibres" value="3" />
            <Fact label="Chain" value="To fibre" />
            <Fact label="Recyclable" value="86%" />
          </dl>

          <span className="hero-chip hero-chip-a" aria-hidden>
            <BadgeCheck className="size-3.5 shrink-0 text-positive" />
            <span className="text-2xs font-medium whitespace-nowrap text-ink">6/7 steps verified</span>
          </span>
          <span className="hero-chip hero-chip-b" aria-hidden>
            <Leaf className="size-3.5 shrink-0 text-ink-muted" />
            <span className="text-2xs font-medium whitespace-nowrap text-ink tabular-nums">
              8.4 kg CO₂e
            </span>
          </span>
        </article>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow mb-1 text-ink-subtle">{label}</dt>
      <dd className="truncate text-sm font-medium text-ink tabular-nums">{value}</dd>
    </div>
  );
}

/* ── Proof strip ───────────────────────────────────────────────────────── */

/**
 * Standards the product actually implements. No deadlines: the textile
 * delegated act does not exist yet, and a date on this page would be a guess
 * dressed as a fact.
 */
const PROOF = [
  { icon: Landmark, text: 'ESPR (EU) 2024/1781 passport framework' },
  { icon: ScanLine, text: 'GS1 Digital Link carriers' },
  { icon: ShieldCheck, text: 'W3C Verifiable Credentials 2.0' },
  { icon: Globe, text: 'Six readable audiences, deny-by-default' },
];

function ProofStrip() {
  return (
    <section className="scroll-reveal border-y border-line bg-surface">
      <ul className="mx-auto grid max-w-6xl gap-x-8 gap-y-3 px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
        {PROOF.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-2.5 text-sm text-ink-muted">
            <Icon className="size-4 shrink-0 text-ink-subtle" aria-hidden />
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Pillars ───────────────────────────────────────────────────────────── */

const PILLARS = [
  {
    icon: FileCheck2,
    title: 'Build',
    body: 'A ten-section editor that mirrors the consumer passport, over a field registry where every field carries the legal basis for being there. Bulk import with a grid of only the rows that failed.',
  },
  {
    icon: ShieldCheck,
    title: 'Verify',
    body: 'Suppliers answer data requests through a link, no account needed. Field-level review with a dry-run merge that surfaces conflicts instead of overwriting. A hash-chained audit log you can re-derive.',
  },
  {
    icon: Globe,
    title: 'Publish',
    body: 'A server-rendered passport that loads on a phone in a shop basement. An unknown code returns a real 404, never a soft 200 — the thing every machine client depends on.',
  },
];

function Pillars() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="scroll-reveal max-w-2xl">
        <p className="eyebrow">What it does</p>
        <h2 className="title-1 mt-3 text-ink" style={{ textWrap: 'balance' }}>
          Build, verify and publish — and refuse to publish what cannot be verified.
        </h2>
      </div>
      <ol className="scroll-stagger mt-12 grid gap-5 md:grid-cols-3">
        {PILLARS.map(({ icon: Icon, title, body }, index) => (
          <li
            key={title}
            className="lift flex flex-col gap-4 rounded-lg border border-line bg-surface p-6 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-md bg-surface-sunken text-ink">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="mono-2 text-ink-subtle">0{index + 1}</span>
            </div>
            <h3 className="title-3 text-ink">{title}</h3>
            <p className="text-sm leading-relaxed text-ink-muted">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ── Surfaces ──────────────────────────────────────────────────────────── */

/**
 * The product's real shape: not one console with buttons hidden per role, but
 * five applications on one record. A recycler is not a brand user with fewer
 * permissions — they arrive holding a garment and need fibre-separation detail
 * a brand manager never looks at.
 */
const SURFACES = [
  { icon: Factory, name: 'Brand console', who: 'Brand teams', body: 'Create, review and publish. Role-gated transitions and a publication gate that names what is missing.' },
  { icon: ScanLine, name: 'Public passport', who: 'Anyone with the code', body: 'Composition, origin, care, end of life. Withheld data is shown as withheld, never silently omitted.' },
  { icon: Hammer, name: 'Partner portal', who: 'Repairers and recyclers', body: 'Spare-part references and disassembly steps. Record what you did; it appears on the passport under your workspace’s name.' },
  { icon: Landmark, name: 'Authority view', who: 'Market surveillance', body: 'The complete record, every field, with an evidence pack whose manifest hash covers the whole bundle.' },
  { icon: Link2, name: 'Supplier links', who: 'Mills, dyers, spinners', body: 'Answer a data request from a magic link. No account, essentially no JavaScript, works with scripting off.' },
];

function Surfaces() {
  return (
    <section className="on-chrome weave-ground relative">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="scroll-reveal max-w-2xl">
          <p className="eyebrow">Five surfaces, one record</p>
          <h2 className="title-1 mt-3 text-ink" style={{ textWrap: 'balance' }}>
            Role decides which application you land in. Not which buttons are hidden.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-muted">
            A repairer forcing their way to the brand console is returned to the portal. That is
            enforced server-side, in the middleware and every layout — not by concealing links.
          </p>
        </div>

        <ul className="scroll-stagger mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {SURFACES.map(({ icon: Icon, name, who, body }) => (
            <li
              key={name}
              className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5 transition-colors hover:border-line-strong"
            >
              <Icon className="size-5 text-accent" aria-hidden />
              <div>
                <h3 className="text-sm font-semibold text-ink">{name}</h3>
                <p className="mt-0.5 text-xs text-ink-subtle">{who}</p>
              </div>
              <p className="text-xs leading-relaxed text-ink-muted">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ── Life ──────────────────────────────────────────────────────────────── */

/** The seeded flagship's real history, which is also the argument for the product. */
const LIFE = [
  { icon: Factory, label: 'Made', by: 'Barcelos, PT' },
  { icon: ShoppingBag, label: 'Sold', by: 'Amsterdam' },
  { icon: Hammer, label: 'Repaired', by: 'Zip slider replaced' },
  { icon: Repeat, label: 'Resold', by: 'Authenticated resale' },
  { icon: Recycle, label: 'Recycled', by: 'Mechanical, fibre-to-fibre' },
];

function Life() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="scroll-reveal max-w-2xl">
        <p className="eyebrow">Downstream</p>
        <h2 className="title-1 mt-3 text-ink" style={{ textWrap: 'balance' }}>
          The record follows the garment, not the sale.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-ink-muted">
          Repairs, resale and recycling are written to the same passport by the people who did
          them, and shown to whoever scans it next. A garment that has been mended twice and
          resold is the most persuasive thing a brand can put on a label.
        </p>
      </div>

      <div className="relative mt-14">
        {/* The spine draws itself as the section scrolls into view. */}
        <div
          aria-hidden
          className="grow-view absolute top-5 right-0 left-0 hidden h-px bg-line-strong md:block"
        />
        <ol className="scroll-stagger grid gap-8 md:grid-cols-5 md:gap-4">
          {LIFE.map(({ icon: Icon, label, by }, index) => {
            const terminal = index === LIFE.length - 1;
            return (
              <li key={label} className="relative flex gap-4 md:flex-col md:gap-4">
                <span
                  className={
                    terminal
                      ? 'relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border border-critical-border bg-critical-soft text-critical'
                      : 'relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-muted shadow-xs'
                  }
                >
                  <Icon className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">{label}</p>
                  <p className="mt-0.5 text-xs text-ink-subtle">{by}</p>
                  {terminal ? (
                    <p className="mt-1.5 text-2xs font-medium text-critical">Closes the passport</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/* ── Closing ───────────────────────────────────────────────────────────── */

function Closing() {
  return (
    <section className="scroll-reveal mx-auto max-w-6xl px-6 pb-24">
      <div className="flex flex-col items-start gap-6 rounded-xl border border-line bg-surface p-8 shadow-sm md:flex-row md:items-center md:justify-between md:p-10">
        <div className="max-w-xl">
          <h2 className="title-2 text-ink" style={{ textWrap: 'balance' }}>
            Scan the card above, or open the demo workspace.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            The demo holds one fully populated passport with a mapped chain, a footprint and a
            repair history, and a fleet in every state the console handles.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/p/demo">
              See a passport
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ── Footer ────────────────────────────────────────────────────────────── */

function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-xs text-ink-subtle sm:flex-row sm:items-center sm:justify-between">
        <Logo tone="brand" />
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/p/demo" className="transition-colors hover:text-ink">Demo passport</Link>
          <Link href="/console" className="transition-colors hover:text-ink">Console</Link>
          <a href="/api/v1/openapi.json" className="transition-colors hover:text-ink">API</a>
          <a href="/.well-known/did.json" className="transition-colors hover:text-ink">DID document</a>
        </nav>
        <p className="flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden />
          Data is supplied by the economic operator named on each passport.
        </p>
      </div>
    </footer>
  );
}
