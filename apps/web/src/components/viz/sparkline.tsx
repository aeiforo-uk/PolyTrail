import { cn } from '@/lib/utils';

/**
 * A sparkline is a word, not a chart: it sits inline beside a number and says
 * which way the number has been going. No axes, no grid, no labels — anything
 * more and it stops being readable at 20px tall.
 */
export function Sparkline({
  values,
  width = 96,
  height = 24,
  tone = 'neutral',
  className,
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: 'positive' | 'caution' | 'critical' | 'neutral' | 'accent';
  className?: string;
  /** Required: an image needs a text alternative, and "sparkline" is not one. */
  label: string;
}) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series would divide by zero; draw it as a centred flat line instead.
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const pad = 2;
  const plot = height - pad * 2;

  const points = values.map((value, i) => {
    const x = i * step;
    const y = pad + plot - ((value - min) / span) * plot;
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1]!;

  const stroke = {
    positive: 'var(--color-positive)',
    caution: 'var(--color-caution)',
    critical: 'var(--color-critical)',
    accent: 'var(--color-accent)',
    neutral: 'var(--color-ink-subtle)',
  }[tone];

  const gradientId = `spark-${tone}-${values.length}-${Math.round(values[0]! * 100)}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('shrink-0 overflow-visible', className)}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.16" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* The most recent value is the one being read; mark it. */}
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={stroke} />
    </svg>
  );
}
