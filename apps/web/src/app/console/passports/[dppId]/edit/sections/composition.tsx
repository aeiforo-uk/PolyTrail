'use client';

import {
  BoolField,
  GateNotice,
  NumberField,
  SelectField,
  TextField,
  enumOptions,
  vocabOptions,
} from '@/components/form/fields';
import { PercentageTotal } from '@/components/form/percentage-total';
import { Repeatable } from '@/components/form/repeatable';
import type { FieldHelpers } from '@/components/form/types';
import {
  CERTIFICATION_SCHEMES,
  COMPONENT_KINDS,
  CUSTODY_MODELS,
  FIBRES,
  RECYCLED_SOURCES,
} from '@/lib/passport/vocab';
import { Group, Row, SectionFrame } from './frame';
import type { SectionProps } from './types';

const FIBRE_OPTIONS = vocabOptions(FIBRES);
const SOURCE_OPTIONS = vocabOptions(RECYCLED_SOURCES);
const CUSTODY_OPTIONS = vocabOptions(CUSTODY_MODELS);
const SCHEME_OPTIONS = vocabOptions(CERTIFICATION_SCHEMES);

const CONSTRUCTIONS = enumOptions(
  ['woven', 'knitted', 'non_woven', 'braided', 'moulded', 'leather', 'other'],
  { non_woven: 'Non-woven' },
);

export function CompositionSection(props: SectionProps) {
  const overall = props.payload.composition?.overall?.length ?? 0;
  const components = props.payload.composition?.components?.length ?? 0;
  const animalParts = props.payload.composition?.nonTextileAnimalParts?.length ?? 0;

  return (
    <SectionFrame {...props}>
      {(f) => (
        <>
          <GateNotice message={f.gate('composition')} />
          <GateNotice message={f.gate('composition.overall')} />

          <PercentageTotal label="Whole-product fibre total">
            <Repeatable
              legend="Fibre breakdown"
              description="The headline composition, by weight, as it would be printed on the label. Percentages must add up to 100 before the passport can be published."
              addLabel="Add a fibre"
              rowNoun="Fibre"
              initialCount={overall}
              max={30}
              readOnly={f.readOnly}
              empty="No fibres recorded yet. This is the first thing every reader looks for."
            >
              {(index) => <FibreFields f={f} base={`composition.overall.${index}`} />}
            </Repeatable>
          </PercentageTotal>

          <Group title="Whole product" columns={3}>
            <NumberField
              f={f}
              path="composition.totalWeightGrams"
              label="Total weight"
              min={0}
              suffix="g"
            />
            <NumberField
              f={f}
              path="composition.totalRecycledContent"
              label="Total recycled content"
              min={0}
              max={100}
              suffix="%"
            />
          </Group>

          <BoolField
            f={f}
            path="composition.monomaterial"
            label="Single-fibre product, trims aside"
            hint="A monomaterial garment can go through fibre recovery without separation. It is the strongest thing a passport can say about recyclability."
          />

          <Repeatable
            legend="Components"
            description="The bill of materials. A recycler reads this to work out what can be recovered and what has to come off first."
            addLabel="Add a component"
            rowNoun="Component"
            initialCount={components}
            max={60}
            readOnly={f.readOnly}
            empty="No components broken out yet. The headline fibre breakdown above is enough to publish."
          >
            {(index) => (
              <div className="flex flex-col gap-5">
                <Row columns={3}>
                  <TextField
                    f={f}
                    path={`composition.components.${index}.ref`}
                    label="Reference"
                    mono
                    required
                    hint="Your own key, e.g. shell-01. Other sections point at it."
                  />
                  <SelectField
                    f={f}
                    path={`composition.components.${index}.kind`}
                    label="Component"
                    options={vocabOptions(COMPONENT_KINDS)}
                    required
                  />
                  <TextField f={f} path={`composition.components.${index}.name`} label="Name" />
                  <SelectField
                    f={f}
                    path={`composition.components.${index}.construction`}
                    label="Construction"
                    options={CONSTRUCTIONS}
                  />
                  <NumberField
                    f={f}
                    path={`composition.components.${index}.weightGrams`}
                    label="Weight"
                    min={0}
                    suffix="g"
                  />
                  <NumberField
                    f={f}
                    path={`composition.components.${index}.weightShare`}
                    label="Share of product weight"
                    min={0}
                    max={100}
                    suffix="%"
                  />
                  <NumberField
                    f={f}
                    path={`composition.components.${index}.fabricWeightGsm`}
                    label="Fabric weight"
                    min={0}
                    suffix="gsm"
                  />
                  <TextField f={f} path={`composition.components.${index}.colour`} label="Colour" />
                  <TextField
                    f={f}
                    path={`composition.components.${index}.supplierRef`}
                    label="Supplier reference"
                    mono
                  />
                </Row>

                <BoolField
                  f={f}
                  path={`composition.components.${index}.removable`}
                  label="Can be removed without damaging the rest"
                />

                <PercentageTotal label="Component fibre total">
                  <Repeatable
                    legend="Fibres in this component"
                    addLabel="Add a fibre"
                    rowNoun="Fibre"
                    initialCount={
                      (f.value(`composition.components.${index}.fibres`) as unknown[] | undefined)
                        ?.length ?? 0
                    }
                    max={30}
                    readOnly={f.readOnly}
                    empty="No fibres recorded for this component."
                  >
                    {(fibreIndex) => (
                      <FibreFields
                        f={f}
                        base={`composition.components.${index}.fibres.${fibreIndex}`}
                      />
                    )}
                  </Repeatable>
                </PercentageTotal>
              </div>
            )}
          </Repeatable>

          <Repeatable
            legend="Non-textile parts of animal origin"
            description="Leather trim, horn buttons, fur. Article 12 of Regulation 1007/2011 requires these to be declared even when they are not textile."
            addLabel="Add a part"
            rowNoun="Part"
            initialCount={animalParts}
            max={20}
            readOnly={f.readOnly}
            empty="None declared."
          >
            {(index) => (
              <Row columns={2}>
                <TextField
                  f={f}
                  path={`composition.nonTextileAnimalParts.${index}.description`}
                  label="Part"
                  required
                />
                <TextField
                  f={f}
                  path={`composition.nonTextileAnimalParts.${index}.species`}
                  label="Species"
                />
              </Row>
            )}
          </Repeatable>
        </>
      )}
    </SectionFrame>
  );
}

/**
 * One fibre, wherever it appears.
 *
 * Recycled and organic content are asked for together with their chain-of-
 * custody model, because a recycled-content figure without one does not tell
 * the reader whether the material is physically in this garment.
 */
function FibreFields({ f, base }: { f: FieldHelpers; base: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Row columns={3}>
        <SelectField
          f={f}
          path={`${base}.fibre`}
          label="Fibre"
          options={FIBRE_OPTIONS}
          required
          series
          placeholder="Choose a fibre"
        />
        <NumberField
          f={f}
          path={`${base}.percentage`}
          label="Percentage"
          min={0}
          max={100}
          suffix="%"
          percentage
          required
        />
        <TextField
          f={f}
          path={`${base}.originCountry`}
          label="Grown or produced in"
          kind="upper"
          maxLength={2}
        />
      </Row>

      <Row columns={3}>
        <NumberField
          f={f}
          path={`${base}.recycled.share`}
          label="Recycled share"
          min={0}
          max={100}
          suffix="%"
        />
        <SelectField
          f={f}
          path={`${base}.recycled.source`}
          label="Recovered from"
          options={SOURCE_OPTIONS}
        />
        <SelectField
          f={f}
          path={`${base}.recycled.custodyModel`}
          label="Chain of custody"
          options={CUSTODY_OPTIONS}
        />
        <TextField
          f={f}
          path={`${base}.recycled.feedstock`}
          label="Feedstock"
          hint="What the material was before, e.g. post-consumer PET bottles."
          className="sm:col-span-2 lg:col-span-3"
        />
      </Row>

      <Row columns={3}>
        <NumberField
          f={f}
          path={`${base}.organic.share`}
          label="Organic share"
          min={0}
          max={100}
          suffix="%"
        />
        <SelectField
          f={f}
          path={`${base}.organic.scheme`}
          label="Organic scheme"
          options={SCHEME_OPTIONS}
        />
        <SelectField
          f={f}
          path={`${base}.organic.custodyModel`}
          label="Organic chain of custody"
          options={CUSTODY_OPTIONS}
        />
      </Row>

      <Row columns={2}>
        <TextField
          f={f}
          path={`${base}.certificationRefs`}
          label="Certificates"
          kind="list"
          hint="Certificate references from the Claims section, separated by commas."
        />
        <TextField f={f} path={`${base}.supplierRef`} label="Supplier reference" mono />
      </Row>
    </div>
  );
}
