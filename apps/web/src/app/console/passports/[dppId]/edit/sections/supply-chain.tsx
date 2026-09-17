'use client';

import {
  BoolField,
  NumberField,
  SelectField,
  TextField,
  enumOptions,
  vocabOptions,
} from '@/components/form/fields';
import { Repeatable } from '@/components/form/repeatable';
import { CUSTODY_MODELS } from '@/lib/passport/vocab';
import { Group, Row, SectionFrame } from './frame';
import type { SectionProps } from './types';

const TIERS = enumOptions(
  ['tier_0_retail', 'tier_1_assembly', 'tier_2_material', 'tier_3_processing', 'tier_4_raw_material'],
  {
    tier_0_retail: 'Tier 0 — retail',
    tier_1_assembly: 'Tier 1 — assembly',
    tier_2_material: 'Tier 2 — material',
    tier_3_processing: 'Tier 3 — processing',
    tier_4_raw_material: 'Tier 4 — raw material',
  },
);

const PROCESSES = enumOptions(
  [
    'design',
    'cut_make_trim',
    'assembly',
    'embroidery',
    'printing',
    'washing',
    'dyeing',
    'finishing',
    'weaving',
    'knitting',
    'spinning',
    'ginning',
    'scouring',
    'tanning',
    'fibre_production',
    'farming',
    'material_recovery',
    'packing',
    'distribution',
  ],
  {
    cut_make_trim: 'Cut, make, trim',
    fibre_production: 'Fibre production',
    material_recovery: 'Material recovery',
  },
);

const EVIDENCE = enumOptions(
  ['self_declared', 'supplier_declared', 'document_verified', 'third_party_audited'],
  {
    self_declared: 'We declared it',
    supplier_declared: 'The supplier declared it',
    document_verified: 'Verified against documents',
    third_party_audited: 'Audited by a third party',
  },
);

const DEPTHS = enumOptions(['tier_1', 'tier_2', 'tier_3', 'tier_4', 'full'], {
  tier_1: 'To tier 1 — assembly',
  tier_2: 'To tier 2 — material',
  tier_3: 'To tier 3 — processing',
  tier_4: 'To tier 4 — raw material',
  full: 'Fully mapped',
});

export function SupplyChainSection(props: SectionProps) {
  const steps = props.payload.supplyChain?.steps?.length ?? 0;

  return (
    <SectionFrame {...props}>
      {(f) => (
        <>
          <Group
            title="How far you have mapped"
            description="Buyers ask this before they ask anything else. An honest tier-2 answer is worth more than an aspirational one."
            columns={2}
          >
            <SelectField
              f={f}
              path="supplyChain.traceabilityDepth"
              label="Traceability depth"
              options={DEPTHS}
            />
            <SelectField
              f={f}
              path="supplyChain.chainOfCustodyModel"
              label="Chain of custody model"
              options={vocabOptions(CUSTODY_MODELS)}
            />
          </Group>

          <Repeatable
            legend="Supply chain steps"
            description="One row per stage that happened somewhere. Withholding a facility name while publishing its country is a legitimate position — untick the disclosure box and the name stays with authorities."
            addLabel="Add a step"
            rowNoun="Step"
            initialCount={steps}
            max={200}
            readOnly={f.readOnly}
            empty="No steps mapped yet."
          >
            {(index) => (
              <div className="flex flex-col gap-4">
                <Row columns={3}>
                  <TextField
                    f={f}
                    path={`supplyChain.steps.${index}.ref`}
                    label="Reference"
                    mono
                    required
                    hint="Your own key, e.g. cmt-porto."
                  />
                  <SelectField
                    f={f}
                    path={`supplyChain.steps.${index}.tier`}
                    label="Tier"
                    options={TIERS}
                    required
                  />
                  <SelectField
                    f={f}
                    path={`supplyChain.steps.${index}.process`}
                    label="Process"
                    options={PROCESSES}
                    required
                  />
                  <TextField
                    f={f}
                    path={`supplyChain.steps.${index}.facilityName`}
                    label="Facility"
                  />
                  <TextField
                    f={f}
                    path={`supplyChain.steps.${index}.country`}
                    label="Country"
                    kind="upper"
                    maxLength={2}
                    required
                  />
                  <TextField f={f} path={`supplyChain.steps.${index}.city`} label="City" />
                  <TextField
                    f={f}
                    path={`supplyChain.steps.${index}.gln`}
                    label="Facility GLN"
                    mono
                    maxLength={13}
                  />
                  <TextField
                    f={f}
                    path={`supplyChain.steps.${index}.osId`}
                    label="Open Supply Hub ID"
                    mono
                  />
                  <SelectField
                    f={f}
                    path={`supplyChain.steps.${index}.evidence`}
                    label="How you know"
                    options={EVIDENCE}
                  />
                  <NumberField
                    f={f}
                    path={`supplyChain.steps.${index}.coordinates.latitude`}
                    label="Latitude"
                    min={-90}
                    max={90}
                  />
                  <NumberField
                    f={f}
                    path={`supplyChain.steps.${index}.coordinates.longitude`}
                    label="Longitude"
                    min={-180}
                    max={180}
                  />
                  <NumberField
                    f={f}
                    path={`supplyChain.steps.${index}.workerCount`}
                    label="Workers at site"
                    min={0}
                    step={1}
                  />
                  <TextField
                    f={f}
                    path={`supplyChain.steps.${index}.componentRefs`}
                    label="Components made here"
                    kind="list"
                    hint="Component references, separated by commas."
                  />
                  <TextField
                    f={f}
                    path={`supplyChain.steps.${index}.certificationRefs`}
                    label="Certificates"
                    kind="list"
                    hint="Certificate references, separated by commas."
                  />
                </Row>

                <BoolField
                  f={f}
                  path={`supplyChain.steps.${index}.facilityDisclosed`}
                  label="Publish this facility's name"
                  defaultOn
                  hint="Untick to publish the country only. The name stays readable by authorities."
                />
              </div>
            )}
          </Repeatable>
        </>
      )}
    </SectionFrame>
  );
}
