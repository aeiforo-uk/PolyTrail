'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  Factory,
  Hammer,
  Layers,
  Lock,
  Recycle,
  Repeat,
  ShoppingBag,
  Sprout,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/logo';
import { cn } from '@/lib/utils';

/**
 * The cover page as a film.
 *
 * One viewport, no scroll, and a loop of about twenty seconds in which a
 * garment travels from fibre to recycling and back, while the passport
 * beside it fills up one line at a time — each line written by a different
 * actor. That is the whole product in one moving picture: not a brand
 * publishing a label, but seven parties writing to one record.
 *
 * A state machine rather than a keyframe timeline. Every element derives
 * from `stage`, so the spine, the traveller, the spotlight, the caption and
 * the card can never drift apart, and pausing, looping or reduced-motion is a
 * matter of what `stage` does rather than of coordinating a dozen durations.
 *
 * Under `prefers-reduced-motion` the loop does not run: the film shows its
 * final frame, which is the complete record, and is still an honest picture
 * of the product.
 */

const STAGES = [
  {
    key: 'fibre',
    label: 'Fibre',
    actor: 'Farm · Türkiye',
    who: 'The grower certifies the cotton',
    entry: 'Organic cotton, GOTS-certified',
    icon: Sprout,
  },
  {
    key: 'fabric',
    label: 'Fabric',
    actor: 'Mill · Portugal',
    who: 'The mill answers a data request — no account needed',
    entry: 'Knitted and dyed, wastewater tested',
    icon: Layers,
  },
  {
    key: 'made',
    label: 'Made',
    actor: 'Factory · Barcelos',
    who: 'The brand publishes; the gate refuses anything unsubstantiated',
    entry: 'Passport issued · NF78-70H8',
    icon: Factory,
  },
  {
    key: 'sold',
    label: 'Sold',
    actor: 'Store · Amsterdam',
    who: 'The shopper scans the label and reads the record',
    entry: 'First owner registered',
    icon: ShoppingBag,
  },
  {
    key: 'repaired',
    label: 'Repaired',
    actor: 'Menders · Malmö',
    who: 'The repairer records what they did, under their own name',
    entry: 'Zip slider replaced, cuff re-stitched',
    icon: Hammer,
  },
  {
    key: 'resold',
    label: 'Resold',
    actor: 'Second owner',
    who: 'Ownership transfers; both sides sign',
    entry: 'Authenticated resale',
    icon: Repeat,
  },
  {
    key: 'recycled',
    label: 'Recycled',
    actor: 'Refibre · Rotterdam',
    who: 'The recycler closes the passport — and the fibre starts again',
    entry: 'Fibre-to-fibre. Passport closed.',
    icon: Recycle,
  },
] as const;

const LAST = STAGES.length - 1;
const STEP_MS = 2600;
const OUTRO_MS = 3200;

/** Position of a stage along the spine, as a percentage. */
const at = (index: number) => `${(index / LAST) * 100}%`;

const spring = { type: 'spring', stiffness: 120, damping: 20 } as const;

export function CoverFilm({ qrSvg }: { qrSvg: string }) {
  const reduced = useReducedMotion();
  const [stage, setStage] = useState(0);
  const [cycle, setCycle] = useState(0);

  // Jump to the final frame after mount rather than seeding it into the
  // initial state: the server does not know the reader's motion preference,
  // and a different first frame on each side is a hydration mismatch.
  useEffect(() => {
    if (reduced) setStage(LAST);
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    const timer = setTimeout(
      () => {
        if (stage < LAST) setStage((s) => s + 1);
        else {
          setStage(0);
          setCycle((c) => c + 1);
        }
      },
      stage < LAST ? STEP_MS : OUTRO_MS,
    );
    return () => clearTimeout(timer);
  }, [stage, reduced]);

  const current = STAGES[stage]!;
  const closing = stage === LAST;

  return (
    <div className="on-chrome weave-ground relative flex h-dvh flex-col overflow-hidden">
      {/* A soft light that travels with the garment. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-1/2 size-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: 'radial-gradient(closest-side, oklch(58% 0.166 36 / 0.22), transparent)' }}
        animate={{ left: at(stage) }}
        transition={{ ...spring, stiffness: 60 }}
      />

      {/* ── Top ─────────────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <Logo tone="inherit" subtitle="Product passports" />
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href="/p/demo">See a passport</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </header>

      {/* ── The journey ─────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-1 flex-col justify-center px-6 md:px-16">
        <div className="mx-auto w-full max-w-5xl">
          <p className="eyebrow mb-10 text-center md:mb-14">Cradle to grave, and back</p>

          <div className="relative mx-6 h-24 md:mx-10">
            {/* The return: fibre recovered at the end feeds the start. Drawn
                as an arc above the spine during the closing beat. */}
            <svg
              aria-hidden
              className="pointer-events-none absolute right-0 -bottom-2 left-0 h-28 w-full overflow-visible"
              viewBox="0 0 100 40"
              preserveAspectRatio="none"
            >
              <motion.path
                d="M 100 38 C 78 -14 22 -14 0 38"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
                initial={false}
                animate={{ pathLength: closing ? 1 : 0, opacity: closing ? 0.9 : 0 }}
                transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </svg>

            {/* Spine and its fill. */}
            <div className="absolute top-1/2 right-0 left-0 h-px bg-line" />
            <motion.div
              className="absolute top-1/2 left-0 h-px bg-accent"
              initial={false}
              animate={{ width: at(stage) }}
              transition={spring}
            />

            {/* Nodes. */}
            {STAGES.map((s, i) => {
              const done = i < stage;
              const active = i === stage;
              const Icon = s.icon;
              return (
                <div
                  key={s.key}
                  className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3"
                  style={{ left: at(i) }}
                >
                  <div className="relative">
                    {active && !reduced ? (
                      <motion.span
                        aria-hidden
                        className="absolute inset-0 rounded-full border border-accent"
                        initial={{ scale: 1, opacity: 0.7 }}
                        animate={{ scale: 2.2, opacity: 0 }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                      />
                    ) : null}
                    <motion.span
                      className={cn(
                        'relative flex size-10 items-center justify-center rounded-full border md:size-12',
                        active
                          ? closing
                            ? 'border-critical bg-critical-soft text-critical'
                            : 'border-accent bg-accent-soft text-accent'
                          : done
                            ? 'border-line-strong bg-surface text-ink'
                            : 'border-line bg-chrome text-ink-subtle',
                      )}
                      initial={false}
                      animate={{ scale: active ? 1.12 : 1 }}
                      transition={spring}
                    >
                      <Icon className="size-4 md:size-5" aria-hidden />
                    </motion.span>
                  </div>
                  <span
                    className={cn(
                      'hidden text-xs font-medium whitespace-nowrap transition-colors duration-300 md:block',
                      active ? 'text-ink' : done ? 'text-ink-muted' : 'text-ink-subtle',
                    )}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}

            {/* The garment, travelling. */}
            <motion.div
              aria-hidden
              className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-[calc(50%+2.75rem)] md:-translate-y-[calc(50%+3.25rem)]"
              initial={false}
              animate={{ left: at(stage) }}
              transition={spring}
            >
              <div className="flex size-11 items-center justify-center overflow-hidden rounded-lg border border-line-strong bg-surface shadow-lg md:size-12">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/products/coastline-half-zip-navy.svg"
                  alt=""
                  width={40}
                  height={50}
                  className="h-full w-auto object-contain"
                />
              </div>
            </motion.div>
          </div>
        </div>

        {/* ── Caption and record ──────────────────────────────────────── */}
        <div className="mx-auto mt-14 grid w-full max-w-5xl items-end gap-8 md:mt-20 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="min-h-[7.5rem]">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${cycle}-${current.key}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="display text-4xl text-ink md:text-5xl">{current.label}</p>
                <p className="mt-2 max-w-[38ch] text-base leading-relaxed text-ink-muted md:text-lg">
                  {current.who}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          <PassportRecord stage={stage} cycle={cycle} qrSvg={qrSvg} closing={closing} />
        </div>
      </div>

      {/* ── Bottom ──────────────────────────────────────────────────── */}
      <footer className="relative z-10 flex flex-col items-start justify-between gap-4 px-6 pt-4 pb-6 md:flex-row md:items-center md:px-10 md:pb-8">
        <p className="max-w-[46ch] text-sm leading-relaxed text-ink-muted">
          One record per garment, written by everyone who touches it and read by whoever scans
          it next.
        </p>
        <div className="flex gap-3">
          <Button asChild size="lg">
            <Link href="/p/demo">
              See the passport
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/console">Open the console</Link>
          </Button>
        </div>
      </footer>
    </div>
  );
}

/**
 * The passport, filling up.
 *
 * Remounted per cycle (via `key`) so the loop's reset is a clean fade rather
 * than seven exit animations firing at once.
 */
function PassportRecord({
  stage,
  cycle,
  qrSvg,
  closing,
}: {
  stage: number;
  cycle: number;
  qrSvg: string;
  closing: boolean;
}) {
  const written = STAGES.slice(0, stage + 1);

  return (
    <motion.article
      key={cycle}
      className="relative rounded-xl border border-line bg-surface shadow-xl"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center gap-3 border-b border-line p-4">
        <div
          className="passport-qr w-12 shrink-0"
          role="img"
          aria-label="QR code that opens the demo passport"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">Coastline Half-Zip</p>
          <p className="mono-2 text-ink-subtle">NF78-70H8-CBB6-AJSE</p>
        </div>
        <AnimatePresence>
          {closing ? (
            <motion.span
              className="flex items-center gap-1 rounded-md border border-critical-border bg-critical-soft px-2 py-0.5 text-2xs font-medium text-critical"
              initial={{ opacity: 0, scale: 0.8, rotate: -6 }}
              animate={{ opacity: 1, scale: 1, rotate: -3 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            >
              <Lock className="size-3" aria-hidden />
              Closed
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      {/* The record growing. Height tracks the count, so nothing jumps. */}
      <div className="px-4 py-3">
        <div className="mb-3 flex items-center justify-between text-2xs">
          <span className="eyebrow">Record</span>
          <span className="tabular-nums text-ink-subtle">
            {written.length} of {STAGES.length}
          </span>
        </div>
        <div className="mb-3 h-1 overflow-hidden rounded-full bg-line">
          <motion.div
            className={cn('h-full rounded-full', closing ? 'bg-critical' : 'bg-accent')}
            initial={false}
            animate={{ width: `${(written.length / STAGES.length) * 100}%` }}
            transition={spring}
          />
        </div>
        <ol className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {written.map((s, i) => {
              const Icon = s.icon;
              const latest = i === written.length - 1;
              return (
                <motion.li
                  key={s.key}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    'flex items-center gap-2.5 text-xs',
                    latest ? 'text-ink' : 'text-ink-muted',
                  )}
                >
                  <Icon
                    className={cn('size-3.5 shrink-0', latest ? 'text-accent' : 'text-ink-subtle')}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{s.entry}</span>
                  <span className="shrink-0 text-2xs text-ink-subtle">{s.actor}</span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      </div>
    </motion.article>
  );
}
