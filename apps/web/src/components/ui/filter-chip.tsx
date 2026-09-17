import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * The shell of a filter chip.
 *
 * Exported as a class function rather than as a component because the two
 * places that need it disagree about the element underneath: the register
 * filters are links that change the URL, the catalogue filters are submit
 * buttons inside a form that carries the other filter state. Both were
 * therefore written separately, and the two drifted — different radii,
 * different padding, and two different ideas of what "selected" looks like on
 * screens a person moves between all day.
 *
 * Three decisions worth stating:
 *
 * **Selected is neutral, not accent.** The accent's job in this product is to
 * mark the action a person should take. Which slice of a register they are
 * currently looking at is state, not an action, and painting it madder spends
 * the one saturated colour on the screen's least urgent fact — the same
 * mistake that had every passport identifier wearing the action colour.
 * A solid ink chip says "this is your current view" unmistakably and costs
 * nothing.
 *
 * **Label and count differ in weight as well as colour.** At equal weight
 * "Retail 0" reads as a two-word phrase rather than as a filter and its
 * tally, which is why the empty one looked like a typo.
 *
 * **Not a pill.** Fully rounding a chip that holds a dot, a word and a number
 * gives it more silhouette than its content earns; 6px matches the buttons,
 * inputs and badges it sits above.
 */
export const filterChip = cva(
  [
    'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs whitespace-nowrap',
    'transition-[background-color,border-color,color,box-shadow] duration-[140ms]',
    'ease-[cubic-bezier(.32,.72,0,1)]',
  ],
  {
    variants: {
      state: {
        idle: [
          'border-line bg-surface text-ink-muted',
          'hover:border-line-hover hover:bg-surface-sunken hover:text-ink',
        ],
        active: 'border-ink bg-ink text-ink-inverse shadow-xs',
        /*
         * A count of zero is still a fact about the register — "there are no
         * retail partners" is worth reading — so it stays legible rather than
         * being faded to an opacity that fails contrast, and simply stops
         * offering a hover it cannot honour.
         */
        empty: 'cursor-default border-line bg-surface-sunken text-ink-subtle',
      },
    },
    defaultVariants: { state: 'idle' },
  },
);

/** The categorical swatch, where a chip carries one. */
export function ChipDot({ colour }: { colour: string }) {
  return <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: colour }} />;
}

/**
 * The tally. Lighter than its label in both weight and colour so the pair
 * reads as one thing and its size — inside a selected chip it borrows the
 * chip's own ink rather than a grey that would sit dead on the dark ground.
 */
export function ChipCount({ value, active }: { value: number; active?: boolean }) {
  return (
    <span className={cn('tabular-nums', active ? 'opacity-60' : 'text-ink-subtle')}>{value}</span>
  );
}

/** The row label — "Tier", "Country" — set to align optically with the chips. */
export function FilterLabel({ children }: { children: React.ReactNode }) {
  return <span className="eyebrow mr-1 shrink-0 self-center text-ink-subtle">{children}</span>;
}
