'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
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
 * The write is shown, not implied. When a stage lights up, a point of light
 * leaves the node, crosses the screen, and lands on the passport; only then
 * does the new line appear, with a brief glow. That beat — node, flight,
 * line — is the workstream, and it is the reason the page exists.
 *
 * A state machine rather than a keyframe timeline. Every element derives
 * from `stage`, so the spine, the traveller, the spotlight, the caption and
 * the card can never drift apart. Under `prefers-reduced-motion` the loop
 * does not run: the film shows its final frame, the complete record, which
 * is still an honest picture of the product.
 */

/**
 * Three phases, three colours.
 *
 * The first cut painted all seven stages the same accent, so the film had no
 * sense of where in a garment's life it was — every beat looked like every
 * other beat. Colour here is doing real work: it names the phase, and the
 * phase is the reason each actor's access differs. Making is the brand's own
 * chain, use is the open market, end of life closes the record. Reaching for
 * the accent, the informational woad and the critical red rather than three
 * decorative hues keeps it inside the system's own vocabulary.
 */
const PHASES = {
  making: {
    label: 'Making',
    text: 'text-accent',
    border: 'border-accent',
    ring: 'border-accent',
    bg: 'bg-accent-soft',
    line: 'var(--color-accent)',
    glow: 'oklch(58% 0.166 36 / 0.26)',
  },
  use: {
    label: 'In use',
    text: 'text-info',
    border: 'border-info',
    ring: 'border-info',
    bg: 'bg-info-soft',
    line: 'var(--color-info)',
    glow: 'oklch(45% 0.13 255 / 0.3)',
  },
  end: {
    label: 'End of life',
    text: 'text-critical',
    border: 'border-critical',
    ring: 'border-critical',
    bg: 'bg-critical-soft',
    line: 'var(--color-critical)',
    glow: 'oklch(50% 0.16 27 / 0.26)',
  },
} as const;

const STAGES = [
  {
    key: 'fibre',
    label: 'Fibre',
    actor: 'Farm · Türkiye',
    who: 'The grower certifies the cotton.',
    entry: 'Organic cotton, GOTS-certified',
    icon: Sprout,
    phase: 'making',
  },
  {
    key: 'fabric',
    label: 'Fabric',
    actor: 'Mill · Portugal',
    who: 'The mill answers a data request. No account, just a link.',
    entry: 'Knitted and dyed, wastewater tested',
    icon: Layers,
    phase: 'making',
  },
  {
    key: 'made',
    label: 'Made',
    actor: 'Factory · Barcelos',
    who: 'The brand publishes. The gate refuses anything it cannot prove.',
    entry: 'Passport issued · NF78-70H8',
    icon: Factory,
    phase: 'making',
  },
  {
    key: 'sold',
    label: 'Sold',
    actor: 'Store · Amsterdam',
    who: 'The shopper scans the label and reads the record.',
    entry: 'First owner registered',
    icon: ShoppingBag,
    phase: 'use',
  },
  {
    key: 'repaired',
    label: 'Repaired',
    actor: 'Menders · Malmö',
    who: 'The repairer records the work, under their own name.',
    entry: 'Zip slider replaced, cuff re-stitched',
    icon: Hammer,
    phase: 'use',
  },
  {
    key: 'resold',
    label: 'Resold',
    actor: 'Second owner',
    who: 'Ownership transfers. Both sides sign.',
    entry: 'Authenticated resale',
    icon: Repeat,
    phase: 'use',
  },
  {
    key: 'recycled',
    label: 'Recycled',
    actor: 'Refibre · Rotterdam',
    who: 'The recycler closes the passport. The fibre starts again.',
    entry: 'Fibre-to-fibre. Passport closed.',
    icon: Recycle,
    phase: 'end',
  },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  actor: string;
  who: string;
  entry: string;
  icon: typeof Sprout;
  phase: keyof typeof PHASES;
}>;

const LAST = STAGES.length - 1;
const STEP_MS = 2800;
const OUTRO_MS = 3400;
/** How long after a node lights up the line lands on the record. */
const WRITE_MS = 1000;

/** Position of a stage along the spine, as a percentage. */
const at = (index: number) => `${(index / LAST) * 100}%`;

const settle = { type: 'spring', stiffness: 120, damping: 20 } as const;
/** A touch under-damped, so the traveller overshoots and settles like a thing with mass. */
const travel = { type: 'spring', stiffness: 130, damping: 15 } as const;
const arrive = [0.22, 1, 0.36, 1] as const;

interface Packet {
  id: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export function CoverFilm({ qrSvg }: { qrSvg: string }) {
  const reduced = useReducedMotion();
  const [stage, setStage] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [packet, setPacket] = useState<Packet | null>(null);
  const nodeRefs = useRef<Array<HTMLDivElement | null>>([]);
  const recordRef = useRef<HTMLDivElement | null>(null);

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

  // The write: measure where the lit node and the record are right now and
  // send a point of light from one to the other.
  useEffect(() => {
    if (reduced) return;
    const node = nodeRefs.current[stage];
    const record = recordRef.current;
    if (!node || !record) return;
    const a = node.getBoundingClientRect();
    const b = record.getBoundingClientRect();
    setPacket({
      id: cycle * 100 + stage,
      from: { x: a.left + a.width / 2, y: a.top + a.height / 2 },
      to: { x: b.left + 40, y: b.top + 40 },
    });
  }, [stage, cycle, reduced]);

  const current = STAGES[stage]!;
  const phase = PHASES[current.phase];
  const closing = stage === LAST;

  return (
    <div className="on-chrome weave-ground relative flex h-dvh flex-col overflow-hidden">
      {/* Ambient light. A warm spotlight that travels with the garment, a
          cool still one low on the right for depth, and a vignette so the
          edges fall away. */}
      {/* No `filter: blur()` on these. A 64px blur over a 770px element,
          one of them moving on a spring, is the single most expensive thing
          a browser can be asked to composite; a radial gradient with a long
          falloff looks the same and costs nothing. */}
      {/* The spotlight takes the phase's colour and crossfades between them,
          so the room warms for making, cools for use, and goes red as the
          record closes. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-[46%] size-[52rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
        animate={{
          left: at(stage),
          background: `radial-gradient(closest-side, ${phase.glow} 0%, transparent 72%)`,
        }}
        transition={{ ...settle, stiffness: 55, background: { duration: 0.8 } }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-10%] bottom-[-20%] size-[44rem] rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, oklch(45% 0.13 255 / 0.16) 0%, oklch(45% 0.13 255 / 0.05) 45%, transparent 74%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(120% 90% at 50% 40%, transparent 55%, oklch(0% 0 0 / 0.45))' }}
      />

      {/* The write in flight. */}
      <AnimatePresence>
        {packet ? (
          <motion.span
            key={packet.id}
            aria-hidden
            className="pointer-events-none fixed top-0 left-0 z-30 size-2 rounded-full bg-accent"
            style={{ boxShadow: '0 0 18px 4px var(--color-accent)' }}
            initial={{ x: packet.from.x - 4, y: packet.from.y - 4, opacity: 0, scale: 0.5 }}
            animate={{
              x: packet.to.x - 4,
              y: packet.to.y - 4,
              opacity: [0, 1, 1, 0],
              scale: [0.5, 1.2, 1, 0.3],
            }}
            transition={{ duration: 0.85, delay: 0.12, ease: arrive }}
            onAnimationComplete={() => setPacket(null)}
          />
        ) : null}
      </AnimatePresence>

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
          <div className="mb-12 flex items-baseline justify-between md:mb-16">
            <p className="eyebrow">Cradle to grave, and back</p>
            <p className="mono-2 text-ink-subtle tabular-nums">
              {String(stage + 1).padStart(2, '0')} / {String(STAGES.length).padStart(2, '0')}
            </p>
          </div>

          <div className="relative mx-6 h-24 md:mx-10">
            {/* The return: fibre recovered at the end feeds the start, drawn
                as an arc over the spine during the closing beat. */}
            <svg
              aria-hidden
              className="pointer-events-none absolute right-0 -bottom-2 left-0 h-28 w-full overflow-visible"
              viewBox="0 0 100 40"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="returnArc" x1="1" y1="0" x2="0" y2="0">
                  <stop offset="0" stopColor={PHASES.end.line} />
                  <stop offset="1" stopColor={PHASES.making.line} />
                </linearGradient>
              </defs>
              <motion.path
                d="M 100 38 C 78 -14 22 -14 0 38"
                fill="none"
                // Recovered fibre returning to the start: it leaves end-of-life
                // and arrives as making, so the arc runs between those two.
                stroke="url(#returnArc)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
                initial={false}
                animate={{ pathLength: closing ? 1 : 0, opacity: closing ? 0.9 : 0 }}
                transition={{ duration: 1.6, ease: arrive }}
              />
            </svg>

            {/* The spine draws itself on arrival; the fill follows the garment. */}
            <motion.div
              className="absolute top-1/2 right-0 left-0 h-px origin-left bg-line"
              initial={reduced ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 1.1, ease: arrive }}
            />
            {/* The travelled spine carries the phases it passed through, so
                the line itself is a record of the journey rather than a
                progress bar. */}
            <motion.div
              className="absolute top-1/2 left-0 h-px"
              style={{
                backgroundImage: `linear-gradient(to right, ${PHASES.making.line} 0%, ${PHASES.making.line} 34%, ${PHASES.use.line} 48%, ${PHASES.use.line} 82%, ${PHASES.end.line} 100%)`,
                backgroundSize: `${100 * LAST}% 100%`,
              }}
              initial={false}
              animate={{ width: at(stage) }}
              transition={settle}
            />

            {/* Nodes, arriving in order. */}
            {STAGES.map((s, i) => {
              const done = i < stage;
              const active = i === stage;
              const Icon = s.icon;
              const tone = PHASES[s.phase];
              return (
                <motion.div
                  key={s.key}
                  ref={(el) => {
                    nodeRefs.current[i] = el;
                  }}
                  className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3.5"
                  style={{ left: at(i) }}
                  initial={reduced ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.25 + i * 0.07, ease: arrive }}
                >
                  <div className="relative">
                    {active && !reduced ? (
                      <motion.span
                        aria-hidden
                        className={cn('absolute inset-0 rounded-full border', tone.ring)}
                        initial={{ scale: 1, opacity: 0.8 }}
                        animate={{ scale: 2.4, opacity: 0 }}
                        transition={{ duration: 1.9, repeat: Infinity, ease: 'easeOut' }}
                      />
                    ) : null}
                    <motion.span
                      className={cn(
                        'relative flex size-11 items-center justify-center rounded-full border md:size-13',
                        active
                          ? [tone.border, tone.bg, tone.text]
                          : done
                            ? // Done reads as done: the phase's colour at
                              // reduced strength, filled rather than outlined,
                              // so progress is legible at a glance instead of
                              // every passed stage looking like a pending one.
                              ['border-line-strong bg-surface', tone.text, 'opacity-70']
                            : 'border-line bg-chrome text-ink-subtle',
                      )}
                      initial={false}
                      animate={{ scale: active ? 1.14 : 1 }}
                      transition={settle}
                    >
                      <Icon className="size-4 md:size-5" aria-hidden />
                    </motion.span>
                  </div>
                  <span
                    className={cn(
                      'eyebrow hidden whitespace-nowrap transition-colors duration-300 md:block',
                      active ? 'text-ink' : done ? 'text-ink-muted' : 'text-ink-subtle',
                    )}
                  >
                    {s.label}
                  </span>
                </motion.div>
              );
            })}

            {/* The garment, travelling. The outer element glides with a
                little overshoot; the inner one hops on every move, so the
                arrival reads as a landing rather than a slide. */}
            <motion.div
              aria-hidden
              className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-[calc(50%+3.8rem)] md:-translate-y-[calc(50%+4.4rem)]"
              initial={false}
              animate={{ left: at(stage) }}
              transition={travel}
            >
              {/* A paper plate on the dark stage. The garment is deep navy
                  and the ground is near-black; on its own it would vanish,
                  and a white plate is also what makes it read as the object
                  in the film rather than another icon on the spine. */}
              <motion.div
                key={`${cycle}-${stage}`}
                initial={reduced ? false : { y: 0, rotate: -6 }}
                animate={{ y: [0, -14, 0], rotate: 0 }}
                transition={{ duration: 0.55, ease: arrive }}
                className="relative flex size-16 items-center justify-center overflow-hidden rounded-2xl border border-white/25 p-1.5 shadow-xl md:size-20 md:p-2"
                style={{ background: 'linear-gradient(160deg, #ffffff 0%, oklch(93.5% 0.004 265) 100%)' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/products/coastline-half-zip-navy.svg"
                  alt=""
                  width={64}
                  height={80}
                  className="h-full w-auto object-contain"
                />
                <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-[oklch(51%_0.164_34)]" />
              </motion.div>
            </motion.div>
          </div>
        </div>

        {/* ── Caption and record ──────────────────────────────────────── */}
        <div className="mx-auto mt-16 grid w-full max-w-5xl items-end gap-8 md:mt-20 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          {/* Overlapping crossfade, not exit-then-enter: the previous word is
              still leaving while the next arrives, so there is never a frame
              with nothing on it. */}
          <div className="relative min-h-[10rem] md:min-h-[11rem]">
            <AnimatePresence initial={false}>
              <motion.div
                key={`${cycle}-${current.key}`}
                className="absolute inset-x-0 bottom-0"
                initial={{ opacity: 0, y: 14, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
                transition={{ duration: 0.5, ease: arrive }}
              >
                {/* The phase, named. It says what the colour means, and it
                    fills the gap that used to sit between the spine and the
                    stage word. */}
                <p className={cn('eyebrow mb-3 flex items-center gap-2', phase.text)}>
                  <span className={cn('h-px w-6', phase.bg)} style={{ background: phase.line }} />
                  {phase.label}
                </p>
                <p className="display text-6xl text-ink md:text-7xl">{current.label}</p>
                <p className="mt-3 max-w-[34ch] text-lg leading-snug text-ink-muted md:text-xl">
                  {current.who}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div ref={recordRef}>
            <PassportRecord key={cycle} stage={stage} qrSvg={qrSvg} reduced={Boolean(reduced)} />
          </div>
        </div>
      </div>

      {/* ── Bottom ──────────────────────────────────────────────────── */}
      <footer className="relative z-10 flex flex-col items-start justify-between gap-4 px-6 pt-4 pb-6 md:flex-row md:items-center md:px-10 md:pb-8">
        <p className="max-w-[46ch] text-sm leading-relaxed text-ink-muted">
          One record per garment. Written by everyone who touches it, read by whoever scans it
          next.
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
 * A line lands `WRITE_MS` after its stage lights — the moment the point of
 * light arrives — and glows briefly. Remounted per cycle via `key` so the
 * loop's reset is a clean fade rather than seven exits at once.
 */
function PassportRecord({
  stage,
  qrSvg,
  reduced,
}: {
  stage: number;
  qrSvg: string;
  reduced: boolean;
}) {
  const [written, setWritten] = useState(0);

  useEffect(() => {
    if (reduced) {
      setWritten(STAGES.length);
      return;
    }
    const timer = setTimeout(() => setWritten(stage + 1), WRITE_MS);
    return () => clearTimeout(timer);
  }, [stage, reduced]);

  const lines = STAGES.slice(0, written);
  const closed = written === STAGES.length;

  return (
    <motion.article
      className="relative rounded-xl border border-line bg-surface shadow-xl"
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.5, ease: arrive }}
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
          {closed ? (
            <motion.span
              className="flex items-center gap-1 rounded-md border border-critical-border bg-critical-soft px-2 py-0.5 text-2xs font-medium text-critical"
              initial={{ opacity: 0, scale: 0.7, rotate: -8 }}
              animate={{ opacity: 1, scale: 1, rotate: -3 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 16 }}
            >
              <Lock className="size-3" aria-hidden />
              Closed
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="px-4 py-3">
        <div className="mb-3 flex items-center justify-between">
          <span className="eyebrow">Record</span>
          <span className="text-2xs text-ink-subtle tabular-nums">
            {written} of {STAGES.length}
          </span>
        </div>
        <div className="mb-3 h-1 overflow-hidden rounded-full bg-line">
          <motion.div
            className="h-full rounded-full"
            style={{
              backgroundImage: `linear-gradient(to right, ${PHASES.making.line} 0%, ${PHASES.making.line} 34%, ${PHASES.use.line} 48%, ${PHASES.use.line} 82%, ${PHASES.end.line} 100%)`,
              backgroundSize: `${(100 * STAGES.length) / Math.max(written, 1)}% 100%`,
            }}
            initial={false}
            animate={{ width: `${(written / STAGES.length) * 100}%` }}
            transition={settle}
          />
        </div>
        <ol className="flex min-h-[9.75rem] flex-col gap-1">
          <AnimatePresence initial={false}>
            {lines.map((s, i) => {
              const Icon = s.icon;
              const latest = i === lines.length - 1;
              const tone = PHASES[s.phase];
              return (
                <motion.li
                  key={s.key}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, ease: arrive }}
                  className={cn(
                    '-mx-2 flex items-center gap-2.5 rounded-md px-2 py-0.5 text-xs',
                    latest ? 'flash text-ink' : 'text-ink-muted',
                  )}
                >
                  {/* The line keeps its phase colour permanently, so the
                      finished record reads as three coloured groups — the
                      making, the use, the end — rather than seven grey rows. */}
                  <Icon
                    className={cn('size-3.5 shrink-0', latest ? tone.text : 'text-ink-subtle')}
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
