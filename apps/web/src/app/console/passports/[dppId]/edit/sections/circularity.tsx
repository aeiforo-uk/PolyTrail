'use client';

import {
  BoolField,
  CheckboxGroupField,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
  enumOptions,
  vocabOptions,
} from '@/components/form/fields';
import { Repeatable } from '@/components/form/repeatable';
import { RECYCLING_DISRUPTORS } from '@/lib/passport/vocab';
import { Group, Row, SectionFrame } from './frame';
import type { SectionProps } from './types';

const ROUTES = enumOptions(['mechanical', 'chemical', 'thermal', 'none_available'], {
  none_available: 'No route available',
});

const DISRUPTORS = vocabOptions(RECYCLING_DISRUPTORS);

export function CircularitySection(props: SectionProps) {
  const steps = props.payload.circularity?.recyclability?.disassemblySteps?.length ?? 0;
  const epr = props.payload.circularity?.eprRegistrations?.length ?? 0;

  return (
    <SectionFrame {...props}>
      {(f) => (
        <>
          <Group title="Recyclability" columns={3}>
            <NumberField
              f={f}
              path="circularity.recyclability.score"
              label="Recyclability score"
              min={0}
              max={100}
              suffix="/100"
            />
            <NumberField
              f={f}
              path="circularity.recyclability.recyclableShare"
              label="Recyclable share"
              min={0}
              max={100}
              suffix="%"
            />
            <SelectField
              f={f}
              path="circularity.recyclability.route"
              label="Recycling route"
              options={ROUTES}
            />
          </Group>

          <CheckboxGroupField
            f={f}
            path="circularity.recyclability.disruptors"
            label="What stops this being recycled"
            options={DISRUPTORS}
            columns={2}
            hint="Naming these is the single most useful thing a passport does for a sorting facility, which otherwise has to guess from the outside of the garment."
          />

          <Repeatable
            legend="Disassembly steps"
            description="Written for a sorter with a pair of pliers and thirty seconds, in the order they would do it."
            addLabel="Add a step"
            rowNoun="Step"
            initialCount={steps}
            max={40}
            readOnly={f.readOnly}
            empty="No disassembly instructions yet."
          >
            {(index) => (
              <Row columns={3}>
                <NumberField
                  f={f}
                  path={`circularity.recyclability.disassemblySteps.${index}.order`}
                  label="Order"
                  min={1}
                  step={1}
                  required
                />
                <TextField
                  f={f}
                  path={`circularity.recyclability.disassemblySteps.${index}.instruction.en`}
                  label="Instruction"
                  required
                  className="sm:col-span-2"
                />
                <TextField
                  f={f}
                  path={`circularity.recyclability.disassemblySteps.${index}.componentRef`}
                  label="Component"
                  mono
                />
                <TextField
                  f={f}
                  path={`circularity.recyclability.disassemblySteps.${index}.toolRequired`}
                  label="Tool needed"
                />
                <NumberField
                  f={f}
                  path={`circularity.recyclability.disassemblySteps.${index}.estimatedSeconds`}
                  label="Time"
                  min={1}
                  step={1}
                  suffix="s"
                />
              </Row>
            )}
          </Repeatable>

          <Group columns={1}>
            <TextAreaField
              f={f}
              path="circularity.recyclability.separationNotes.en"
              label="Fibre separation notes"
              rows={3}
            />
          </Group>

          <Group title="Take-back" columns={2}>
            <TextField f={f} path="circularity.takeBack.url" label="Take-back link" type="url" />
            <TextField f={f} path="circularity.takeBack.incentive" label="Incentive" />
            <TextAreaField
              f={f}
              path="circularity.takeBack.instructions.en"
              label="How to return it"
              rows={2}
              className="sm:col-span-2"
            />
          </Group>

          <BoolField f={f} path="circularity.takeBack.available" label="We take this product back" />

          <Group title="Resale and rental" columns={2}>
            <TextField f={f} path="circularity.resale.url" label="Resale link" type="url" />
            <TextField f={f} path="circularity.rental.url" label="Rental link" type="url" />
          </Group>

          <div className="flex flex-col gap-3">
            <BoolField
              f={f}
              path="circularity.resale.brandAuthorised"
              label="Resale is authorised by the brand"
            />
            <BoolField
              f={f}
              path="circularity.resale.authenticationSupported"
              label="We authenticate items for resale"
            />
            <BoolField f={f} path="circularity.rental.available" label="Available to rent" />
          </div>

          <Repeatable
            legend="Producer responsibility registrations"
            description="Textile EPR is rolling out country by country, so this is a list rather than one number."
            addLabel="Add a registration"
            rowNoun="Registration"
            initialCount={epr}
            max={40}
            readOnly={f.readOnly}
            empty="None recorded."
          >
            {(index) => (
              <Row columns={2}>
                <TextField
                  f={f}
                  path={`circularity.eprRegistrations.${index}.country`}
                  label="Country"
                  kind="upper"
                  maxLength={2}
                  required
                />
                <TextField
                  f={f}
                  path={`circularity.eprRegistrations.${index}.scheme`}
                  label="Scheme"
                  required
                />
                <TextField
                  f={f}
                  path={`circularity.eprRegistrations.${index}.producerNumber`}
                  label="Producer number"
                  mono
                  required
                />
                <TextField
                  f={f}
                  path={`circularity.eprRegistrations.${index}.validUntil`}
                  label="Valid until"
                  type="date"
                />
              </Row>
            )}
          </Repeatable>

          <Group title="End of life" columns={2}>
            <TextField
              f={f}
              path="circularity.wasteCode"
              label="Waste code"
              mono
              hint="European List of Waste, e.g. 20 01 10."
            />
            <TextAreaField
              f={f}
              path="circularity.endOfLifeInstructions.en"
              label="What to do with it at the end"
              rows={2}
            />
          </Group>
        </>
      )}
    </SectionFrame>
  );
}
