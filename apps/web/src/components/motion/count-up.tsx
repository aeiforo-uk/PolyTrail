'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'motion/react';

/**
 * A figure that settles into place.
 *
 * The point is not decoration: a number that animates is a number the eye
 * follows, and on the passport's verdict band it buys the half-second in which
 * the comparator underneath ("38% below a typical knit") draws in behind it. A
 * static number and a static comparator arrive together and neither is read.
 *
 * Three things keep it from becoming a gimmick:
 *   • It runs once, when scrolled into view, never on every re-render.
 *   • It uses tabular figures and reserves the final width, so nothing reflows
 *     while it counts — a counter that shifts its own layout is worse than no
 *     counter.
 *   • With `prefers-reduced-motion` it renders the final value immediately.
 */
export function CountUp({
  value,
  decimals = 0,
  duration = 620,
  prefix = '',
  suffix = '',
  className,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduced = useReducedMotion();

  /**
   * Initialised to the *final* value, not to zero.
   *
   * The server renders this, and the public passport has to be correct with
   * JavaScript disabled. Starting at zero would ship a passport whose carbon
   * figure reads "0.0 kg" to anyone without JS — a wrong number, not a missing
   * animation.
   */
  const [shown, setShown] = useState(value);

  // Reset to zero before the browser paints, so the count is not preceded by a
  // visible flash of the final value. `useEffect` fires after paint and would.
  useIsomorphicLayoutEffect(() => {
    if (!reduced) setShown(0);
  }, [reduced]);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    if (!inView) return;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // The same decelerating curve the rest of the system uses, so the number
      // settles the way a panel slides.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(value * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else setShown(value);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value, duration, reduced]);

  const text = `${prefix}${shown.toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;

  const final = `${prefix}${value.toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {/* An invisible copy of the final value holds the width open, so the
          surrounding layout never moves while the digits change. */}
      <span aria-hidden className="invisible block h-0 overflow-hidden">
        {final}
      </span>
      <span aria-label={final}>{text}</span>
    </span>
  );
}

/**
 * `useLayoutEffect` warns when React renders on the server, because there is no
 * layout to read. Falling back to `useEffect` there keeps the console clean
 * while still getting pre-paint timing in the browser, which is the only place
 * it matters.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
