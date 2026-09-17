import { describe, expect, it } from 'vitest';
import { mergeSubmission } from './merge';

const base = {
  schemaVersion: '1.0',
  identity: { productName: { en: 'Oxford shirt' }, brandName: 'Acme', category: 'shirt' },
};

describe('mergeSubmission', () => {
  it('writes an answer into an empty slot and reports the change', () => {
    const result = mergeSubmission(base, { 'environment.water.litres': 140 });

    expect(result.changes).toEqual([
      {
        path: 'environment.water.litres',
        field: 'environment.water.litres',
        from: null,
        to: 140,
      },
    ]);
    expect(
      (result.merged as { environment: { water: { litres: number } } }).environment.water.litres,
    ).toBe(140);
  });

  it('never mutates the payload it was given', () => {
    const payload = structuredClone(base);
    mergeSubmission(payload, { 'commercial.launchDate': '2026-02-01' });
    expect(payload).toEqual(base);
  });

  it('reports a disagreement as a conflict and leaves the passport alone', () => {
    const payload = { ...base, environment: { water: { litres: 340 } } };
    const result = mergeSubmission(payload, { 'environment.water.litres': 355 });

    expect(result.changes).toHaveLength(0);
    expect(result.conflicts).toEqual([
      {
        path: 'environment.water.litres',
        field: 'environment.water.litres',
        existing: 340,
        incoming: 355,
        resolved: false,
      },
    ]);
    expect((result.merged as typeof payload).environment.water.litres).toBe(340);
  });

  it('applies a conflict only when the reviewer chose the supplier value', () => {
    const payload = { ...base, environment: { water: { litres: 340 } } };
    const result = mergeSubmission(
      payload,
      { 'environment.water.litres': 355 },
      { overwrite: ['environment.water.litres'] },
    );

    expect(result.conflicts[0]?.resolved).toBe(true);
    expect(result.changes[0]).toMatchObject({ from: 340, to: 355 });
    expect((result.merged as typeof payload).environment.water.litres).toBe(355);
  });

  it('treats an identical answer as confirmation, not a change', () => {
    const payload = { ...base, environment: { water: { litres: 340 } } };
    const result = mergeSubmission(payload, { 'environment.water.litres': 340 });

    expect(result.changes).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
    expect(result.unchanged).toEqual(['environment.water.litres']);
  });

  it('skips answers the reviewer did not accept, and says so', () => {
    const result = mergeSubmission(
      base,
      { 'environment.water.litres': 140, 'commercial.launchDate': '2026-02-01' },
      { accept: ['environment.water.litres'] },
    );

    expect(result.changes).toHaveLength(1);
    expect(result.skipped).toEqual([
      { field: 'commercial.launchDate', reason: 'The reviewer did not accept this answer.' },
    ]);
  });

  it('skips blanks rather than writing empty values into a passport', () => {
    const result = mergeSubmission(base, {
      'environment.water.litres': null,
      'supplyChain.traceabilityDepth': '',
      'commercial.marketsPlaced': [],
    });

    expect(result.changes).toHaveLength(0);
    expect(result.skipped).toHaveLength(3);
  });

  it('places a repeating answer on the anchored supply-chain step', () => {
    const payload = {
      ...base,
      supplyChain: {
        steps: [
          { ref: 'cmt-1', tier: 'tier_1_assembly', process: 'cut_make_trim', country: 'PT' },
          { ref: 'dye-1', tier: 'tier_2_material', process: 'dyeing', country: 'PT' },
        ],
      },
    };

    const result = mergeSubmission(
      payload,
      { 'supplyChain.steps.*.gln': '5012345678900' },
      { anchors: { 'supplyChain.steps': { key: 'ref', value: 'dye-1' } } },
    );

    expect(result.changes[0]?.path).toBe('supplyChain.steps.1.gln');
    const steps = (result.merged as typeof payload).supplyChain.steps as Array<
      Record<string, unknown>
    >;
    expect(steps[1]).toMatchObject({ ref: 'dye-1', gln: '5012345678900' });
    expect(steps[0]).not.toHaveProperty('gln');
  });

  it('creates the anchored element, seeded, when the step does not exist yet', () => {
    const result = mergeSubmission(
      base,
      { 'supplyChain.steps.*.country': 'IN', 'supplyChain.steps.*.workerCount': 420 },
      {
        anchors: {
          'supplyChain.steps': {
            key: 'ref',
            value: 'spin-7',
            seed: { tier: 'tier_3_processing', process: 'spinning' },
          },
        },
      },
    );

    const steps = (result.merged as { supplyChain: { steps: Array<Record<string, unknown>> } })
      .supplyChain.steps;
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({
      tier: 'tier_3_processing',
      process: 'spinning',
      ref: 'spin-7',
      country: 'IN',
      workerCount: 420,
    });
    expect(result.changes.map((c) => c.path)).toEqual([
      'supplyChain.steps.0.country',
      'supplyChain.steps.0.workerCount',
    ]);
  });

  it('refuses a repeating answer with nothing to attach it to', () => {
    const result = mergeSubmission(base, { 'supplyChain.steps.*.gln': '5012345678900' });

    expect(result.changes).toHaveLength(0);
    expect(result.skipped[0]?.reason).toMatch(/no entry in supplyChain\.steps/i);
  });

  it('will not address a field that repeats twice', () => {
    const result = mergeSubmission(
      base,
      { 'composition.components.*.fibres.*.fibre': 'cotton' },
      { anchors: { 'composition.components': { key: 'ref', value: 'shell' } } },
    );

    expect(result.skipped[0]?.reason).toMatch(/nested repeating/i);
  });

  it('is deterministic regardless of answer order', () => {
    const answers = { 'commercial.launchDate': '2026-02-01', 'environment.water.litres': 140 };
    const reversed = Object.fromEntries(Object.entries(answers).reverse());

    expect(mergeSubmission(base, answers).changes).toEqual(
      mergeSubmission(base, reversed).changes,
    );
  });
});
