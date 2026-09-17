'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const button = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-[140ms]',
    'ease-[cubic-bezier(0.22,1,0.36,1)]',
    'disabled:pointer-events-none disabled:opacity-45',
    // A 1px translate on press reads as physical without the bounce that makes
    // scale transforms look like a toy.
    'active:translate-y-px',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary:
          // The inset top light is what makes a solid button read as a pressed
          // object rather than a painted rectangle; every mature system ships
          // some version of it.
          'bg-accent text-on-accent hover:bg-accent-hover shadow-[inset_0_1px_0_oklch(100%_0_0/0.14),0_1px_2px_oklch(0%_0_0/0.1)] hover:shadow-[inset_0_1px_0_oklch(100%_0_0/0.1),0_2px_6px_oklch(0%_0_0/0.14)]',
        secondary:
          'bg-surface text-ink border border-line-strong hover:border-line-hover hover:bg-surface-sunken shadow-xs',
        ghost: 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
        subtle: 'bg-surface-sunken text-ink hover:bg-line/60',
        destructive:
          'bg-critical text-white hover:brightness-110 shadow-xs',
        link: 'text-accent underline underline-offset-4 decoration-accent/35 hover:decoration-accent',
      },
      size: {
        xs: 'h-7 rounded-sm px-2.5 text-xs [&_svg]:size-3.5',
        sm: 'h-8 rounded-sm px-3 text-sm [&_svg]:size-4',
        md: 'h-9.5 rounded-md px-4 text-sm [&_svg]:size-4',
        lg: 'h-11 rounded-md px-5 text-base [&_svg]:size-[18px]',
        icon: 'size-9 rounded-md [&_svg]:size-4',
        'icon-sm': 'size-8 rounded-sm [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean;
  /** Shows a spinner and blocks interaction without collapsing the layout. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(button({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <Spinner />
            {/* Keep the label mounted so the button keeps its width. */}
            <span className="contents">{children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M14.5 8a6.5 6.5 0 0 0-6.5-6.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export { button as buttonVariants };
