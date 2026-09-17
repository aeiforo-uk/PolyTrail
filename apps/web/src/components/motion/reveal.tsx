'use client';

import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { Children, isValidElement } from 'react';

/**
 * Entrance for a group of siblings.
 *
 * Staggered entrance is the single cheapest way to make a list read as
 * *arriving* rather than as *already there*, and it gives the eye an order to
 * follow. It is also the easiest thing to overdo, so two limits are baked in:
 * the stagger stops after six items, and the travel is 8px. A list that slides
 * 40px into place is an animation the user waits for.
 *
 * Reduced motion collapses to a plain crossfade rather than to nothing — the
 * arrival is still legible, it just does not move.
 */
export function Stagger({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const items = Children.toArray(children).filter(isValidElement);

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="shown"
      variants={{
        hidden: {},
        shown: {
          transition: {
            delayChildren: delay,
            // Capped: beyond six the last item lands late enough to read as lag.
            staggerChildren: reduced ? 0 : Math.min(0.038, 0.23 / Math.max(items.length, 1)),
          },
        },
      }}
    >
      {items.map((child, i) => (
        <motion.div
          key={child.key ?? i}
          variants={{
            hidden: { opacity: 0, y: reduced ? 0 : 8 },
            shown: {
              opacity: 1,
              y: 0,
              transition: { duration: reduced ? 0.12 : 0.34, ease: [0.22, 1, 0.36, 1] },
            },
          }}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

/** A single element arriving. Transform and opacity only. */
export function Reveal({
  children,
  delay = 0,
  y = 8,
  className,
  ...rest
}: { children: React.ReactNode; delay?: number; y?: number } & HTMLMotionProps<'div'>) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduced ? 0 : y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.12 : 0.34, delay, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
