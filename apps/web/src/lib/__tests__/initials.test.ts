import { describe, expect, it } from 'vitest';
import { initials } from '@/components/ui/avatar';

/**
 * Initials look trivial and are not. Three separate hand-rolled copies of this
 * existed in the console before it was made a primitive, and all three got the
 * one-word and the email case wrong in the same way — `"Meridian"` rendered as
 * a single `M`, and an invited member with no name yet rendered as `@`.
 */
describe('initials', () => {
  it('takes the first and last part of a full name', () => {
    expect(initials('Ada Okonkwo')).toBe('AO');
    expect(initials('Inés Vidal')).toBe('IV');
  });

  it('skips the middle rather than the end', () => {
    // The surname identifies a person; a middle name almost never does.
    expect(initials('Maria da Silva Santos')).toBe('MS');
  });

  it('gives two letters for a single word', () => {
    expect(initials('Meridian')).toBe('ME');
    expect(initials('Li')).toBe('LI');
  });

  it('reduces an email address to its local part', () => {
    expect(initials('admin@aeiforo.co.uk')).toBe('AD');
    expect(initials('ada.okonkwo@aeiforo.co.uk')).toBe('AO');
  });

  it('ignores punctuation inside a name', () => {
    expect(initials('Jean-Luc Picard')).toBe('JP');
    expect(initials("Siobhán O'Neill")).toBe('SO');
  });

  it('never returns an empty string', () => {
    // A member row exists before the person has accepted their invitation, so
    // an empty name is an ordinary state rather than a broken one.
    for (const value of ['', '   ', '@', '...', '@example.com']) {
      expect(initials(value)).toBe('?');
    }
  });

  it('always returns at most two characters', () => {
    for (const value of ['Ada Okonkwo', 'Meridian', 'a@b.c', 'Maria da Silva Santos', '']) {
      expect(initials(value).length).toBeLessThanOrEqual(2);
    }
  });
});
