import { describe, expect, it } from 'vitest';
import { MAX_SERIES, RAMP, SERIES, rampStep, seriesColour } from '@/components/viz/tokens';
import { STATUS_ORDER, STATUS_TONE, statusTone } from '@/components/viz/status-colour';
import { TRANSITIONS, type PassportStatus } from '@/lib/passport/state';

describe('categorical slots', () => {
  it('assigns in fixed order', () => {
    expect(seriesColour(0)).toBe(SERIES[0]);
    expect(seriesColour(3)).toBe(SERIES[3]);
  });

  it('is stable — the same index always gives the same colour', () => {
    // Colour follows the entity, not its rank. A filter that removes a series
    // must not repaint the survivors, which only holds if this is a pure
    // function of a stable key.
    expect(seriesColour(2)).toBe(seriesColour(2));
  });

  it('has eight distinct slots', () => {
    expect(new Set(SERIES).size).toBe(MAX_SERIES);
    expect(MAX_SERIES).toBe(8);
  });
});

describe('sequential ramp', () => {
  it('runs light to dark across seven steps', () => {
    expect(RAMP).toHaveLength(7);
    expect(rampStep(0)).toBe(RAMP[0]);
    expect(rampStep(1)).toBe(RAMP[6]);
  });

  it('clamps rather than throwing on out-of-range input', () => {
    expect(rampStep(-5)).toBe(RAMP[0]);
    expect(rampStep(99)).toBe(RAMP[6]);
  });

  it('is monotonic — a bigger fraction never steps backwards', () => {
    let previous = -1;
    for (let f = 0; f <= 1; f += 0.05) {
      const index = RAMP.indexOf(rampStep(f) as (typeof RAMP)[number]);
      expect(index).toBeGreaterThanOrEqual(previous);
      previous = index;
    }
  });
});

describe('status colour', () => {
  it('covers every passport status', () => {
    for (const status of Object.keys(TRANSITIONS) as PassportStatus[]) {
      expect(STATUS_TONE[status]).toBeTruthy();
    }
  });

  it('never hands a status a categorical hue', () => {
    // The bug this prevents: a suspended passport rendered in categorical
    // green, reading as healthy in a status chart.
    for (const tone of Object.values(STATUS_TONE)) {
      expect(SERIES).not.toContain(tone);
    }
  });

  it('reserves positive for genuinely good states only', () => {
    const positives = (Object.keys(STATUS_TONE) as PassportStatus[]).filter(
      (s) => STATUS_TONE[s] === 'var(--color-positive)',
    );
    expect(positives).toEqual(['published']);
  });

  it('marks a recall as critical and nothing else as critical', () => {
    const criticals = (Object.keys(STATUS_TONE) as PassportStatus[]).filter(
      (s) => STATUS_TONE[s] === 'var(--color-critical)',
    );
    expect(criticals).toEqual(['recalled']);
  });

  it('falls back safely for an unknown status', () => {
    expect(statusTone('something_new')).toBe('var(--color-ink-subtle)');
  });

  it('orders the pipeline as work actually flows', () => {
    expect(STATUS_ORDER.indexOf('draft')).toBeLessThan(STATUS_ORDER.indexOf('in_review'));
    expect(STATUS_ORDER.indexOf('in_review')).toBeLessThan(STATUS_ORDER.indexOf('approved'));
    expect(STATUS_ORDER.indexOf('approved')).toBeLessThan(STATUS_ORDER.indexOf('published'));
  });

  it('includes every status exactly once', () => {
    const all = Object.keys(TRANSITIONS).sort();
    expect([...STATUS_ORDER].sort()).toEqual(all);
  });
});
