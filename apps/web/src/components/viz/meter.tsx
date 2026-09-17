import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/**
 * A ring for a single fraction — completeness, coverage, readiness.
 *
 * Drawn as an arc rather than a pie: a pie of one value asks the reader to
 * compare two wedges when there is only one number. The figure sits in the
 * middle because the ring is the ornament and the number is the content.
 */
export function Meter({
  value,
  size = 56,
  thickness = 5,
  label,
  sublabel,
  tone,
  className,
}: {
  /** 0–100. */
  value: number;
  size?: number;
  thickness?: number;
  label?: string;
  sublabel?: string;
  tone?: 'positive' | 'caution' | 'critical' | 'accent' | 'neutral';
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;

  /*
   * A low ring is grey, not red. The default ladder used to bottom out at
   * `critical`, so every draft passport — which is most of them, most of the
   * time — wore an alarm colour for the ordinary condition of being unfinished.
   * A screen where everything is flagged flags nothing. Critical is still
   * available, but only when a caller asks for it.
   */
  const resolved =
    tone ?? (clamped >= 90 ? 'positive' : clamped >= 60 ? 'caution' : 'neutral');
  const stroke = {
    positive: 'var(--color-positive)',
    caution: 'var(--color-caution)',
    critical: 'var(--color-critical)',
    accent: 'var(--color-accent)',
    neutral: 'var(--color-ink-subtle)',
  }[resolved];

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={`${Math.round(clamped)} per cent`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth={thickness}
          />
          <circle
            className="meter-arc"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            // Start at twelve o'clock; the default three o'clock reads as a
            // gauge that is already part-full.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ '--meter-circumference': circumference } as CSSProperties}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center font-semibold tabular-nums text-ink"
          // Scaled to the ring rather than fixed: at 30px a 12px figure
          // crowds the stroke, and at 52px it floats in the middle of it.
          style={{ fontSize: Math.max(10, Math.round(size * 0.34)) }}
        >
          {Math.round(clamped)}
        </span>
      </div>
      {label ? (
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{label}</p>
          {sublabel ? <p className="truncate text-xs text-ink-subtle">{sublabel}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
