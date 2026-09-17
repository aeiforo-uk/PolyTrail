import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A small, quiet statement of fact.
 *
 * The previous version said the same thing four times: a tinted fill, a tinted
 * border, tinted text *and* an icon, all carrying one bit of information. Four
 * signals for one fact is what makes a status pill read as a sticker — the
 * fill at 95% lightness is the specific offender, because a pale mint lozenge
 * is the most saturated object on a page of near-black text and it is
 * attached to the least urgent thing on it.
 *
 * So the colour moved to where it is cheapest and most legible: the icon and
 * the text. The chip itself is neutral — the same hairline and ground as
 * every other small container in the product — which means a row of badges
 * reads as a column of states rather than as a row of confetti.
 *
 * Three things are deliberately kept:
 *   • **Colour, icon and word together**, never colour alone. A status that
 *     distinguishes itself only by hue is unusable for a colour-blind reader
 *     and unreadable in a printed compliance export.
 *   • **The border**, so the chip still has a shape against a white card.
 *   • **`solid`**, for the rare badge that genuinely must be seen first — a
 *     recall notice. It is the exception that proves the tonal rule, and it
 *     should stay rare.
 */
const badge = cva(
  [
    'inline-flex items-center gap-1.5 whitespace-nowrap',
    // A 6px radius, not a pill. Fully rounding a chip that contains an icon
    // and a word gives it more silhouette than its content deserves; the
    // radius matches the buttons and inputs it sits beside.
    'rounded-md border px-2 py-0.5 text-2xs font-medium',
    '[&_svg]:size-3 [&_svg]:shrink-0',
  ],
  {
    variants: {
      tone: {
        neutral: 'border-line bg-surface-sunken text-ink-muted [&_svg]:text-ink-subtle',
        // The chip is neutral; the icon carries the hue and the word carries
        // the meaning. Text stays at full ink so it is read as content.
        accent: 'border-line bg-surface-sunken text-ink [&_svg]:text-accent',
        positive: 'border-line bg-surface-sunken text-ink [&_svg]:text-positive',
        caution: 'border-line bg-surface-sunken text-ink [&_svg]:text-caution',
        critical: 'border-line bg-surface-sunken text-ink [&_svg]:text-critical',
        info: 'border-line bg-surface-sunken text-ink [&_svg]:text-info',
        outline: 'border-line-strong bg-transparent text-ink-muted',
        /** Reserved for a state that must be seen before anything else. */
        solid: 'border-critical bg-critical text-white [&_svg]:text-white',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}
