'use client';

import { BoolField, NumberField, SelectField, TextField, enumOptions } from '@/components/form/fields';
import { Repeatable } from '@/components/form/repeatable';
import { Group, Row, SectionFrame } from './frame';
import type { SectionProps } from './types';

const AGAINST = enumOptions(
  ['washing', 'light', 'rubbing_dry', 'rubbing_wet', 'perspiration', 'water'],
  { rubbing_dry: 'Rubbing, dry', rubbing_wet: 'Rubbing, wet' },
);

export function DurabilitySection(props: SectionProps) {
  const fastness = props.payload.durability?.colourFastness?.length ?? 0;

  return (
    <SectionFrame {...props}>
      {(f) => (
        <>
          <Group
            title="Robustness"
            description="Measured on the finished sellable product after five wash cycles at the care-label setting. This is the durability requirement the textile delegated act is expected to carry."
            columns={3}
          >
            <NumberField
              f={f}
              path="durability.robustnessScore"
              label="Robustness score"
              min={0}
              max={100}
              suffix="/100"
            />
            <TextField
              f={f}
              path="durability.robustnessEvidence.visualInspection.standard"
              label="Visual inspection standard"
            />
            <NumberField
              f={f}
              path="durability.robustnessEvidence.visualInspection.grade"
              label="Visual inspection grade"
            />
            <NumberField
              f={f}
              path="durability.robustnessEvidence.spiralityPercent"
              label="Spirality"
              suffix="%"
            />
            <NumberField
              f={f}
              path="durability.robustnessEvidence.dimensionalChangePercent"
              label="Dimensional change"
              suffix="%"
            />
            <NumberField
              f={f}
              path="durability.robustnessEvidence.washCycles"
              label="Wash cycles tested"
              min={1}
              step={1}
            />
          </Group>

          <Group title="Shrinkage" columns={3}>
            <TextField f={f} path="durability.dimensionalStability.standard" label="Standard" />
            <NumberField
              f={f}
              path="durability.dimensionalStability.changePercent"
              label="Change"
              suffix="%"
            />
            <TextField f={f} path="durability.dimensionalStability.wash" label="Wash programme" />
          </Group>

          <Repeatable
            legend="Colour fastness"
            description="One row per thing the colour was tested against, graded 1 to 8."
            addLabel="Add a result"
            rowNoun="Result"
            initialCount={fastness}
            max={20}
            readOnly={f.readOnly}
            empty="No colour fastness results recorded."
          >
            {(index) => (
              <Row columns={3}>
                <TextField
                  f={f}
                  path={`durability.colourFastness.${index}.standard`}
                  label="Standard"
                  required
                />
                <SelectField
                  f={f}
                  path={`durability.colourFastness.${index}.against`}
                  label="Tested against"
                  options={AGAINST}
                  required
                />
                <NumberField
                  f={f}
                  path={`durability.colourFastness.${index}.grade`}
                  label="Grade"
                  min={1}
                  max={8}
                  required
                />
              </Row>
            )}
          </Repeatable>

          <Group title="Wear resistance" columns={3}>
            <TextField f={f} path="durability.pillingResistance.standard" label="Pilling standard" />
            <NumberField
              f={f}
              path="durability.pillingResistance.grade"
              label="Pilling grade"
              min={1}
              max={5}
            />
            <TextField
              f={f}
              path="durability.abrasionResistance.standard"
              label="Abrasion standard"
            />
            <NumberField
              f={f}
              path="durability.abrasionResistance.martindaleCycles"
              label="Martindale cycles"
              min={1}
              step={1}
            />
            <NumberField
              f={f}
              path="durability.tensileStrengthN"
              label="Tensile strength"
              min={0}
              suffix="N"
            />
            <TextField f={f} path="durability.seamSlippage.standard" label="Seam slippage standard" />
          </Group>

          <BoolField f={f} path="durability.seamSlippage.passed" label="Seam slippage test passed" />

          <Group title="Lifetime" columns={3}>
            <NumberField
              f={f}
              path="durability.expectedWashCycles"
              label="Expected wash cycles"
              min={1}
              step={1}
            />
            <NumberField
              f={f}
              path="durability.warrantyMonths"
              label="Warranty"
              min={0}
              step={1}
              suffix="months"
            />
            <NumberField
              f={f}
              path="durability.repairabilityScore"
              label="Repairability score"
              min={0}
              max={100}
              suffix="/100"
              hint="Your own scoring. There is no EU repairability index for textiles, and the passport labels this as a voluntary claim."
            />
          </Group>
        </>
      )}
    </SectionFrame>
  );
}
