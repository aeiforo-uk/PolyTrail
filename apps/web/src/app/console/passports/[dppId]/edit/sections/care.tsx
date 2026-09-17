'use client';

import {
  BoolField,
  CheckboxGroupField,
  GateNotice,
  TextAreaField,
  TextField,
  vocabOptions,
} from '@/components/form/fields';
import { Repeatable } from '@/components/form/repeatable';
import { CARE_SYMBOLS } from '@/lib/passport/vocab';
import { Group, Row, SectionFrame } from './frame';
import type { SectionProps } from './types';

const SYMBOLS = vocabOptions(CARE_SYMBOLS);

export function CareSection(props: SectionProps) {
  const tips = props.payload.care?.lowImpactTips?.length ?? 0;
  const spareParts = props.payload.care?.repair?.spareParts?.length ?? 0;

  return (
    <SectionFrame {...props}>
      {(f) => (
        <>
          <GateNotice message={f.gate('care')} />

          <CheckboxGroupField
            f={f}
            path="care.symbols"
            label="Care symbols"
            options={SYMBOLS}
            columns={3}
            hint="The symbols printed on the label. The public passport renders the pictograms and reads out what they mean."
          />

          <Group columns={1}>
            <TextAreaField
              f={f}
              path="care.instructions.en"
              label="Care instructions"
              rows={3}
              placeholder="Wash inside out at 30 °C with similar colours. Line dry."
            />
          </Group>

          <Repeatable
            legend="Low-impact care advice"
            description="Most of a garment's footprint is in the wash basket, and this is the one part of it a shopper controls."
            addLabel="Add advice"
            rowNoun="Tip"
            initialCount={tips}
            max={10}
            readOnly={f.readOnly}
            empty="No advice added."
          >
            {(index) => (
              <TextField f={f} path={`care.lowImpactTips.${index}.en`} label="Advice" required />
            )}
          </Repeatable>

          <Group title="Repair" columns={2}>
            <TextField f={f} path="care.repair.guideUrl" label="Repair guide" type="url" />
            <TextField
              f={f}
              path="care.repair.sparePartsUntil"
              label="Spare parts available until"
              type="date"
            />
            <TextField
              f={f}
              path="care.repair.partnerRefs"
              label="Authorised repair partners"
              kind="list"
              hint="Supply chain step references, separated by commas."
            />
          </Group>

          <BoolField
            f={f}
            path="care.repair.sparePartsAvailable"
            label="Spare parts can be ordered"
          />

          <Group columns={1}>
            <TextAreaField
              f={f}
              path="care.repair.instructions.en"
              label="Repair instructions"
              rows={3}
            />
          </Group>

          <Repeatable
            legend="Spare parts"
            addLabel="Add a part"
            rowNoun="Part"
            initialCount={spareParts}
            max={40}
            readOnly={f.readOnly}
            empty="No spare parts listed."
          >
            {(index) => (
              <Row columns={2}>
                <TextField
                  f={f}
                  path={`care.repair.spareParts.${index}.name`}
                  label="Part"
                  required
                />
                <TextField
                  f={f}
                  path={`care.repair.spareParts.${index}.reference`}
                  label="Reference"
                  mono
                />
              </Row>
            )}
          </Repeatable>
        </>
      )}
    </SectionFrame>
  );
}
