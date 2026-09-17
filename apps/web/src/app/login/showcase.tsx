import { QrCode, Recycle, ScanLine, Sprout } from 'lucide-react';

/**
 * The dark panel beside the sign-in form.
 *
 * A server component with no client JavaScript: every movement here is CSS, so
 * the panel animates before React has hydrated and still renders — static and
 * complete — if it never does.
 *
 * The mosaic behind it is a plain weave at scale. The same over-and-under that
 * the brand mark draws with three strokes, drawn here with a few hundred
 * cells, which is what a fabric actually is up close. It is generated from a
 * fixed seed rather than `Math.random`, because a random grid would differ
 * between the server's render and the browser's and produce exactly the
 * hydration mismatch this codebase has already paid for once.
 */

const COLS = 16;
const ROWS = 22;

/**
 * A tiny deterministic generator. Park–Miller, fixed seed: the point is not
 * statistical quality, it is that the same grid comes out every time.
 */
function weave(): number[] {
  let state = 20260913;
  const next = () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
  return Array.from({ length: COLS * ROWS }, (_, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    // The underlying twill: cells on the rising diagonal sit brighter, so the
    // random weight lands on a structure rather than on noise.
    const onDiagonal = (col + row) % 4 === 0 ? 0.55 : 0;
    return Math.min(1, onDiagonal + next() * 0.5);
  });
}

const CELLS = weave();

/**
 * Real fields from a real passport, not the app-logo wall this pattern usually
 * carries. Four, not five: the fifth had nowhere to sit that the headline did
 * not already occupy, and a tile pushed into the one free gap reads as a tile
 * that was pushed into the one free gap.
 */
const TILES = [
  { icon: QrCode, label: 'GS1 Digital Link', value: '01/08712345678906', at: 'tile-a' },
  { icon: Sprout, label: 'Fibre', value: '100% merino', at: 'tile-b' },
  { icon: ScanLine, label: 'Chain mapped', value: 'Tier 4 — fibre', at: 'tile-c' },
  { icon: Recycle, label: 'End of life', value: 'Fibre-to-fibre', at: 'tile-d' },
];

export function LoginShowcase() {
  return (
    <aside className="hidden p-3 lg:block">
      <div className="login-panel relative isolate flex h-full flex-col justify-center overflow-hidden rounded-2xl px-12 py-16 xl:px-16">
        {/* The weave. Decorative, so it is hidden from assistive tech entirely. */}
        <div className="login-weave" aria-hidden>
          {CELLS.map((weight, i) => (
            <span
              key={i}
              style={{ opacity: weight * 0.5, animationDelay: `${(i % 37) * 140}ms` }}
            />
          ))}
        </div>

        <div className="relative z-10 flex flex-col items-center gap-10 text-center">
          <p className="login-in login-d1 text-[0.6875rem] font-medium tracking-[0.14em] text-white/45 uppercase">
            Digital Product Passports
          </p>

          <h2
            className="login-in login-d2 max-w-[16ch] text-4xl leading-[1.08] font-semibold tracking-[-0.026em] text-white xl:text-5xl"
            style={{ textWrap: 'balance' }}
          >
            Every garment, traceable to the fibre.
          </h2>

          <p className="login-in login-d3 max-w-[34ch] text-sm leading-relaxed text-white/55">
            One record per product, written once by the brand and its suppliers, read
            differently by a shopper, a repairer, a recycler and a regulator.
          </p>

          {/* One real passport as an object, not a claim: the seeded flagship,
              drawn with its own technical flat. Decorative here, so hidden
              from assistive tech like the weave and the tiles. */}
          <figure
            className="login-object flex items-center gap-4 rounded-xl py-3 pr-6 pl-3 text-left"
            aria-hidden
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/products/coastline-half-zip-navy.svg"
              alt=""
              width={48}
              height={60}
              className="h-15 w-12 shrink-0 rounded-md bg-white/95 object-cover"
            />
            <figcaption className="min-w-0">
              <span className="block text-[0.5625rem] tracking-[0.12em] text-white/40 uppercase">
                Digital product passport
              </span>
              <span className="mt-0.5 block truncate text-sm font-medium text-white/90">
                Coastline Half-Zip
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-[0.6875rem] text-white/60">
                <span className="size-1.5 rounded-full bg-[oklch(72%_0.13_155)]" aria-hidden />
                Published · traceable to tier 4
              </span>
            </figcaption>
          </figure>
        </div>

        {/* The tiles sit on a named grid so each one has a fixed home, rather
            than being positioned by percentage guesses that collide at
            in-between widths. */}
        <div className="login-tiles" aria-hidden>
          {TILES.map((tile, i) => (
            <figure key={tile.label} className={`login-tile ${tile.at} login-float-${i % 3}`}>
              <tile.icon className="size-4 shrink-0 text-white/70" />
              <figcaption className="min-w-0">
                <span className="block text-[0.5625rem] tracking-[0.1em] text-white/40 uppercase">
                  {tile.label}
                </span>
                <span className="mono block truncate text-[0.6875rem] text-white/85">
                  {tile.value}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>

      </div>
    </aside>
  );
}
