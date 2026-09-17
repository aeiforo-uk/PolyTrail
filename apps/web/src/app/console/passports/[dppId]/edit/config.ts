/**
 * The editor's sections, in the order the consumer passport reads.
 *
 * Matching that order is not cosmetic: someone filling a passport in should be
 * building the page a shopper will see, top to bottom, rather than working
 * through a database schema. `owns` lists the top-level payload keys a section
 * is authoritative for, which is what lets a save clear the last row of a list.
 */
export interface SectionConfig {
  slug: string;
  label: string;
  owns: readonly string[];
  description: string;
}

export const SECTIONS: readonly SectionConfig[] = [
  {
    slug: 'identity',
    label: 'Identity',
    owns: ['identity'],
    description: 'What the product is, who is responsible for it, and how it is identified.',
  },
  {
    slug: 'composition',
    label: 'Composition',
    owns: ['composition'],
    description:
      'The fibres, by weight, and the components they sit in. The one thing every reader looks for.',
  },
  {
    slug: 'substances',
    label: 'Substances',
    owns: ['substances'],
    description: 'Substances of concern, test results and the chemical programme behind them.',
  },
  {
    slug: 'supply-chain',
    label: 'Supply chain',
    owns: ['supplyChain'],
    description: 'Where each stage happened, and how far the chain has actually been mapped.',
  },
  {
    slug: 'environment',
    label: 'Environment',
    owns: ['environment'],
    description: 'Footprint results, each recorded with the method that produced it.',
  },
  {
    slug: 'durability',
    label: 'Durability',
    owns: ['durability'],
    description: 'How long the product lasts, and the tests that say so.',
  },
  {
    slug: 'care',
    label: 'Care & repair',
    owns: ['care'],
    description: 'Care symbols, instructions, and what happens when something goes wrong.',
  },
  {
    slug: 'circularity',
    label: 'Circularity',
    owns: ['circularity'],
    description: 'Recyclability, disassembly, take-back, resale and producer responsibility.',
  },
  {
    slug: 'social',
    label: 'Social',
    owns: ['social'],
    description: 'Due diligence, audits and the wage work behind the product.',
  },
  {
    slug: 'claims',
    label: 'Claims & certifications',
    owns: ['claims', 'certifications'],
    description:
      'Every claim has to name evidence that exists in this passport. Certificates are that evidence.',
  },
];

export function sectionBySlug(slug: string): SectionConfig | undefined {
  return SECTIONS.find((section) => section.slug === slug);
}
