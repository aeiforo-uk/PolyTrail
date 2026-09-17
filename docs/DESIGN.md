# Design

**Positioning: a document that happens to be beautiful.** Editorial, not eco-startup. The
failure mode for every DPP is looking like either a tax form or a greenwashing brochure.

## Colour

Warm undyed-cloth ground, near-black ink, and exactly one saturated accent — **madder**,
the oldest red dye in the textile trade. Not green: every DPP goes green and therefore
looks like every other DPP. Not blue: blue reads as generic software.

The accent is rationed. It should never cover more than a few percent of a viewport, so
that when it appears it means "act here". Saturated colour is otherwise reserved for data
and state.

All values are OKLCH so light and dark stay perceptually matched rather than one being a
washed-out inversion of the other. Dark mode is declared twice — under
`prefers-color-scheme` for the no-JS case and under `.dark` for an explicit choice —
because the class next-themes writes only exists once JavaScript has run.

Semantic colour never carries meaning alone. Status is always colour **plus** an icon
**plus** a word, which is both an accessibility requirement and a regulatory one.

## Type

The scale is a system, not a list of sizes. Three rules make it cohere.

**1. Optical tracking.** Letter-spacing tightens as size grows. Type drawn for 14px is too
loose at 56px; left untracked, large headings look like a word processor. Every step below
states its own tracking, from `−0.028em` at display down to `+0.008em` at the smallest label.

**2. Leading follows size.** A 44px heading at 1.6 line-height is a paragraph with gaps in
it. Leading tightens from 1.6 at body to 1.02 at display.

**3. Three weights only.** 400 body, 500 label and emphasis, 600 heading. 700 exists in the
font and is never used in the interface — the jump from 600 reads as shouting on a screen
this dense.

### Families

| Family | Where | Why |
|---|---|---|
| **Geist** | the whole product | A neutral grotesque with genuinely good tabular figures and a variable weight axis. A console full of percentages and identifiers needs a data face, not a personality. |
| **Geist Mono** | identifiers, hashes, GTINs, tokens, code | Monospace is the "this is data, copy it" signal that costs nothing. |
| **Instrument Serif** | the public passport headline, the marketing page, the sign-in wordmark — **and nowhere else** | The console is software and reads as software. The passport is a document about a garment and earns an editorial voice. Mixing the two inside one surface is what makes a design system look undecided. |

Self-hosted through `next/font`, `display: swap` never `block`. Only the three weights the
scale uses are shipped.

### The roles

Reach for a role rather than composing `text-sm font-medium tracking-tight` by hand. A role
names the job, so the scale can be retuned in one place instead of hunting through forty
screens for the markup that happened to look right at the time.

| Role | Size / leading / tracking | Use |
|---|---|---|
| `display-1` | 56 / 1.02 / −0.028em | Public passport headline |
| `display-2` | 44 / 1.06 / −0.024em | Marketing hero |
| `display-3` | 34 / 1.12 / −0.02em | Passport section opener |
| `title-1` | 28 / 1.2 / −0.019em | Page title |
| `title-2` | 21 / 1.28 / −0.014em | Major section |
| `title-3` | 16 / 1.4 / −0.008em | Card and panel heading |
| `title-4` | 14 / 1.45 / −0.003em | Dense sub-heading |
| `body-1` | 16 / 1.6 / −0.005em | Consumer prose |
| `body-2` | 14 / 1.55 / 0 | **The default.** Console body, table cells |
| `body-3` | 13 / 1.5 / +0.002em | Captions, help text |
| `label-1` | 14 / 1.3 / 0 | Form labels |
| `label-2` | 13 / 1.25 / +0.004em | Table headers |
| `label-3` | 12 / 1.2 / +0.008em | Metadata |
| `eyebrow` | 11 / +0.085em / uppercase | Section markers |
| `mono-1` | 13 / −0.01em | Identifiers |
| `mono-2` | 12 / −0.008em | Hashes, long codes |

Headline figures use Geist 600 with display-grade tracking rather than the serif: a figure
that will be compared against the figure beside it wants a data face, and tabular alignment
matters more than editorial character.

**Tabular figures everywhere numeric.** Proportional digits make a column of percentages
ripple. This is the single cheapest thing that makes dense data look engineered, and it is
applied to `table`, `.tnum`, `[data-numeric]` and every numeric input by default.

**Text colour is a token, never opacity.** `text-ink` / `text-ink-muted` / `text-ink-subtle`.
Opacity over a tinted ground muddies rather than recedes.

The living specimen is at `/design` in development — every role at its real size against the
real surfaces, plus the palettes.

## Structure

- Consumer passport: single column, 720px, always. It is a document.
- Elevation is almost absent — hairlines over shadows. Shadows are warm, never black.
- Radii stay small and consistent; only chips and badges are fully rounded.
- Motion: 140ms for hover and toggles, 220ms for disclosure, `cubic-bezier(.32,.72,0,1)`.
  Things move because they came from somewhere, never to be noticed. Full
  `prefers-reduced-motion` support.
- A 2.5% paper grain sits over large flat panels. It is not consciously visible; it exists
  so full-bleed neutral areas do not read as flat digital grey.

## Rules taken from the teardown

- **A thumbnail, not a hero.** The reader is holding the garment. A full-bleed photograph
  of what is already in their hand is the least informative element available, and it turns
  a document into a shop page.
- **Open the first sections.** A passport whose every section is collapsed shows a casual
  scanner nothing at all.
- **Never a blank.** An unmapped supply-chain step renders as a dashed grey node saying so.
- **Never a number without its baseline.** A figure with no comparator is decoration.
- **No blockchain vocabulary above the provenance section.** Hash and DID are monospace,
  collapsed, copyable, and nowhere else.
- **Bureaucratic voice stays in the JSON.** "Economic operator identifier" is a field name;
  the visible copy reads like a sentence a person would say.
