'use client';

import { NumberField, SelectField, TextField, enumOptions } from '@/components/form/fields';
import { Group, SectionFrame } from './frame';
import type { SectionProps } from './types';

const CLASSES = enumOptions(['A', 'B', 'C', 'D', 'E'], {
  A: 'A — best in category',
  E: 'E — worst in category',
});

const BOUNDARIES = enumOptions(['cradle_to_gate', 'cradle_to_grave', 'gate_to_gate'], {
  cradle_to_gate: 'Cradle to gate',
  cradle_to_grave: 'Cradle to grave',
  gate_to_gate: 'Gate to gate',
});

export function EnvironmentSection(props: SectionProps) {
  return (
    <SectionFrame {...props}>
      {(f) => (
        <>
          <Group
            title="Footprint class"
            description="A class is comparable between products in the same category; a raw score is not. This is the figure the public passport leads with."
            columns={2}
          >
            <SelectField
              f={f}
              path="environment.footprintClass"
              label="Footprint class"
              options={CLASSES}
            />
          </Group>

          <Group
            title="Product Environmental Footprint"
            description="Record the method version alongside the score. PEF results from different rule versions are not comparable, and presenting them as though they were is how a passport misleads."
            columns={3}
          >
            <NumberField f={f} path="environment.pef.score" label="PEF score" suffix="mPt" />
            <TextField f={f} path="environment.pef.methodVersion" label="Method version" />
            <TextField f={f} path="environment.pef.categoryRules" label="Category rules" />
            <TextField
              f={f}
              path="environment.pef.calculatedOn"
              label="Calculated on"
              type="date"
            />
            <TextField f={f} path="environment.pef.verifiedBy" label="Verified by" />
          </Group>

          <Group title="Carbon" columns={3}>
            <NumberField
              f={f}
              path="environment.carbon.totalKgCo2e"
              label="Carbon footprint"
              min={0}
              suffix="kg"
            />
            <SelectField
              f={f}
              path="environment.carbon.boundary"
              label="System boundary"
              options={BOUNDARIES}
            />
            <TextField f={f} path="environment.carbon.methodology" label="Methodology" />
            <TextField f={f} path="environment.carbon.verifiedBy" label="Verified by" />
            <TextField
              f={f}
              path="environment.carbon.calculatedOn"
              label="Calculated on"
              type="date"
            />
          </Group>

          <Group
            title="Carbon by life cycle stage"
            description="Optional, and worth doing: a reader can see whether the impact sits in the fibre, the dyehouse or the wash basket."
            columns={3}
          >
            <NumberField
              f={f}
              path="environment.carbon.byStage.rawMaterial"
              label="Raw material"
              min={0}
              suffix="kg"
            />
            <NumberField
              f={f}
              path="environment.carbon.byStage.processing"
              label="Processing"
              min={0}
              suffix="kg"
            />
            <NumberField
              f={f}
              path="environment.carbon.byStage.manufacturing"
              label="Manufacturing"
              min={0}
              suffix="kg"
            />
            <NumberField
              f={f}
              path="environment.carbon.byStage.transport"
              label="Transport"
              min={0}
              suffix="kg"
            />
            <NumberField
              f={f}
              path="environment.carbon.byStage.use"
              label="Use phase"
              min={0}
              suffix="kg"
            />
            <NumberField
              f={f}
              path="environment.carbon.byStage.endOfLife"
              label="End of life"
              min={0}
              suffix="kg"
            />
          </Group>

          <Group title="Water, energy and land" columns={3}>
            <NumberField f={f} path="environment.water.litres" label="Water use" min={0} suffix="L" />
            <NumberField
              f={f}
              path="environment.water.scarcityWeightedM3"
              label="Scarcity-weighted water"
              min={0}
              suffix="m³"
            />
            <TextField f={f} path="environment.water.methodology" label="Water methodology" />
            <NumberField f={f} path="environment.energyMj" label="Energy" min={0} suffix="MJ" />
            <NumberField
              f={f}
              path="environment.landUseM2Year"
              label="Land use"
              min={0}
              suffix="m²·yr"
            />
          </Group>

          <Group
            title="Microplastics"
            description="There is no settled test method yet, so the method is recorded beside the number rather than assumed."
            columns={3}
          >
            <TextField f={f} path="environment.microplastics.testMethod" label="Test method" />
            <NumberField
              f={f}
              path="environment.microplastics.releaseMgPerKgWash"
              label="Release per wash"
              min={0}
              suffix="mg/kg"
            />
            <TextField f={f} path="environment.microplastics.mitigation" label="Mitigation" />
          </Group>

          <Group columns={2}>
            <TextField f={f} path="environment.lcaDocumentId" label="LCA study reference" mono />
          </Group>
        </>
      )}
    </SectionFrame>
  );
}
