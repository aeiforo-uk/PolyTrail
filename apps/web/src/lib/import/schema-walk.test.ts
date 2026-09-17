import { describe, expect, it } from 'vitest';
import { describePath, emptyableArrayKeys, schemaAt } from './schema-walk';
import { IMPORT_TARGETS, TEMPLATE_PATHS, targetFor } from './targets';

/**
 * The importer decides how to read a cell by asking the payload schema what
 * lives at that path, rather than keeping its own table of types. That saves a
 * whole class of drift and costs one dependency: Zod's internal `.def` shape.
 *
 * These tests pin that dependency. If a Zod upgrade changes it, this file fails
 * — which is the intended failure mode, because the alternative is an importer
 * that silently starts treating every field as a string.
 */
describe('reading the payload schema', () => {
  it('resolves a plain string field', () => {
    expect(describePath('identity.styleNumber')).toMatchObject({ kind: 'string', optional: true });
  });

  it('resolves a required field as required', () => {
    expect(describePath('identity.brandName')?.optional).toBe(false);
  });

  it('resolves a number', () => {
    expect(describePath('identity.netWeightGrams')?.kind).toBe('number');
  });

  it('resolves a boolean', () => {
    expect(describePath('circularity.takeBack.available')?.kind).toBe('boolean');
  });

  it('resolves an enum and lists its values', () => {
    const leaf = describePath('composition.overall.0.fibre');
    expect(leaf?.kind).toBe('enum');
    expect(leaf?.options).toContain('cotton');
  });

  it('recognises a localised string rather than calling it an object', () => {
    expect(describePath('identity.productName')?.kind).toBe('localized');
  });

  it('carries the string format so dates and URLs can be normalised', () => {
    expect(describePath('commercial.launchDate')?.format).toBe('date');
    expect(describePath('care.repair.guideUrl')?.format).toBe('url');
  });

  it('descends into an array by index and describes its element', () => {
    const leaf = describePath('commercial.marketsPlaced');
    expect(leaf?.kind).toBe('array');
    expect(leaf?.element?.kind).toBe('string');
  });

  it('accepts a wildcard where an index would go', () => {
    expect(schemaAt('composition.overall.*.percentage')).not.toBeNull();
  });

  it('returns nothing for a path the schema does not have', () => {
    expect(describePath('identity.madeUpField')).toBeNull();
    expect(describePath('nonsense')).toBeNull();
  });

  it('finds the arrays a section requires but may leave empty', () => {
    expect(emptyableArrayKeys('composition')).toContain('components');
    expect(emptyableArrayKeys('supplyChain')).toContain('steps');
  });
});

describe('import targets', () => {
  it('offers every template column', () => {
    for (const path of TEMPLATE_PATHS) {
      expect(targetFor(path), `${path} is missing from the registry`).toBeDefined();
    }
  });

  it('resolves every offered target against the schema', () => {
    for (const target of IMPORT_TARGETS) {
      expect(describePath(target.path), `${target.path} is not in the payload schema`).not.toBeNull();
    }
  });

  it('numbers repeated fields and marks only the first as required', () => {
    expect(targetFor('composition.overall.0.fibre')?.label).toBe('Fibre 1');
    expect(targetFor('composition.overall.0.fibre')?.required).toBe(true);
    expect(targetFor('composition.overall.2.fibre')?.required).toBe(false);
  });

  it('leaves out structures a flat file cannot express', () => {
    // A fibre inside a component is two levels of repetition; a CSV column
    // cannot name one, and offering it would produce an unreadable picker.
    expect(targetFor('composition.components.0.fibres.0.fibre')).toBeUndefined();
  });

  it('does not offer the schema version as a mappable column', () => {
    expect(targetFor('schemaVersion')).toBeUndefined();
  });
});
