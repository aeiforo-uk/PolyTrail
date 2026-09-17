import type { CareSymbol } from '@/lib/passport/vocab';

/**
 * GINETEX / ISO 3758 care pictograms, drawn rather than fetched.
 *
 * These are the five base shapes — washtub, triangle, square, iron, circle —
 * modified by dots, bars and a cross. Drawing them as inline SVG keeps the
 * passport readable with no network beyond the initial HTML, which matters
 * because these pages get opened in shop basements and changing rooms.
 *
 * Every symbol is rendered beside its words. A pictogram alone is a puzzle,
 * and a care label nobody can read is the most common complaint about the
 * entire system.
 */

const S = 40;
const stroke = { stroke: 'currentColor', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function Cross() {
  return (
    <>
      <line x1="7" y1="7" x2="33" y2="33" {...stroke} strokeWidth={2.5} />
      <line x1="33" y1="7" x2="7" y2="33" {...stroke} strokeWidth={2.5} />
    </>
  );
}

function Washtub({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <path d="M6 14h28l-3.2 18.5a2.5 2.5 0 0 1-2.5 2.1H11.7a2.5 2.5 0 0 1-2.5-2.1Z" {...stroke} />
      <path d="M6 14c3.5-3.4 6.2-1 9.2.6 3 1.6 5.6 1.4 8-1.2" {...stroke} />
      {children}
    </>
  );
}

function Triangle({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <path d="M20 6 36 34H4Z" {...stroke} />
      {children}
    </>
  );
}

function Square({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <rect x="6" y="8" width="28" height="26" rx="2" {...stroke} />
      {children}
    </>
  );
}

function Iron({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <path d="M5 29h30l-3-11.5a7 7 0 0 0-6.7-5.2H14.2A9.2 9.2 0 0 0 5 21.5Z" {...stroke} />
      {children}
    </>
  );
}

function Circle({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <circle cx="20" cy="20" r="14" {...stroke} />
      {children}
    </>
  );
}

function Dots({ count, cy = 20 }: { count: number; cy?: number }) {
  const positions = count === 1 ? [20] : count === 2 ? [14.5, 25.5] : [10, 20, 30];
  return (
    <>
      {positions.map((cx) => (
        <circle key={cx} cx={cx} cy={cy} r="2.1" fill="currentColor" />
      ))}
    </>
  );
}

function Bar({ y }: { y: number }) {
  return <line x1="10" y1={y} x2="30" y2={y} {...stroke} strokeWidth={2.5} />;
}

function Letter({ children }: { children: string }) {
  return (
    <text
      x="20"
      y="20"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize="15"
      fontWeight="600"
      fill="currentColor"
      fontFamily="var(--font-sans)"
    >
      {children}
    </text>
  );
}

const GLYPHS: Record<CareSymbol, React.ReactNode> = {
  wash_30: <Washtub><Dots count={1} cy={24} /></Washtub>,
  wash_40: <Washtub><Dots count={2} cy={24} /></Washtub>,
  wash_60: <Washtub><Dots count={3} cy={24} /></Washtub>,
  wash_30_gentle: <Washtub><Dots count={1} cy={23} /><Bar y={37} /></Washtub>,
  wash_hand: <Washtub><path d="M12 24c2-2.5 4.5-2.5 6.5-.8 2 1.7 4.6 1.4 6.8-.6" {...stroke} /></Washtub>,
  wash_not: <Washtub><Cross /></Washtub>,
  bleach_not: <Triangle><Cross /></Triangle>,
  bleach_oxygen: <Triangle><line x1="14" y1="16" x2="22" y2="28" {...stroke} /><line x1="26" y1="16" x2="18" y2="28" {...stroke} /></Triangle>,
  dry_tumble_low: <Square><circle cx="20" cy="21" r="9" {...stroke} /><Dots count={1} cy={21} /></Square>,
  dry_tumble_not: <Square><circle cx="20" cy="21" r="9" {...stroke} /><Cross /></Square>,
  dry_line: <Square><path d="M6 14h28" {...stroke} /></Square>,
  dry_flat: <Square><path d="M10 21h20" {...stroke} /></Square>,
  iron_low: <Iron><Dots count={1} cy={22} /></Iron>,
  iron_medium: <Iron><Dots count={2} cy={22} /></Iron>,
  iron_high: <Iron><Dots count={3} cy={22} /></Iron>,
  iron_not: <Iron><Cross /></Iron>,
  clean_dry_p: <Circle><Letter>P</Letter></Circle>,
  clean_dry_f: <Circle><Letter>F</Letter></Circle>,
  clean_wet: <Circle><Letter>W</Letter></Circle>,
  clean_not: <Circle><Cross /></Circle>,
};

export function CareSymbolIcon({ symbol, className }: { symbol: CareSymbol; className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${S} ${S}`}
      className={className}
      role="presentation"
      aria-hidden
      focusable="false"
    >
      {GLYPHS[symbol]}
    </svg>
  );
}
