'use client';

import {
  BoolField,
  SelectField,
  TextAreaField,
  TextField,
  enumOptions,
} from '@/components/form/fields';
import { Repeatable } from '@/components/form/repeatable';
import { Group, Row, SectionFrame } from './frame';
import type { SectionProps } from './types';

const CONCENTRATIONS = enumOptions(
  ['below_0_1', '0_1_to_1', '1_to_10', 'above_10', 'unknown'],
  {
    below_0_1: 'Below 0.1%',
    '0_1_to_1': '0.1% to 1%',
    '1_to_10': '1% to 10%',
    above_10: 'Above 10%',
    unknown: 'Not known',
  },
);

const TEST_RESULTS = enumOptions(['pass', 'fail', 'detected_below_limit'], {
  pass: 'Pass',
  fail: 'Fail',
  detected_below_limit: 'Detected, below the limit',
});

const PFAS = enumOptions(['none_intentionally_added', 'present', 'not_assessed'], {
  none_intentionally_added: 'None intentionally added',
  present: 'Present',
  not_assessed: 'Not assessed',
});

const ZDHC = enumOptions(['level_1', 'level_2', 'level_3', 'none'], {
  level_1: 'Level 1',
  level_2: 'Level 2',
  level_3: 'Level 3',
  none: 'Not in the programme',
});

export function SubstancesSection(props: SectionProps) {
  const concerns = props.payload.substances?.substancesOfConcern?.length ?? 0;
  const tests = props.payload.substances?.restrictedSubstanceTests?.length ?? 0;

  return (
    <SectionFrame {...props}>
      {(f) => (
        <>
          <Repeatable
            legend="Substances of concern"
            description="Anything present that a recycler, a repairer or an authority needs to know about. Saying where it sits is what makes it useful."
            addLabel="Add a substance"
            rowNoun="Substance"
            initialCount={concerns}
            max={100}
            readOnly={f.readOnly}
            empty="None declared."
          >
            {(index) => (
              <div className="flex flex-col gap-4">
                <Row columns={3}>
                  <TextField
                    f={f}
                    path={`substances.substancesOfConcern.${index}.name`}
                    label="Substance"
                    required
                  />
                  <TextField
                    f={f}
                    path={`substances.substancesOfConcern.${index}.casNumber`}
                    label="CAS number"
                    mono
                    hint="Format 1234-56-7."
                  />
                  <TextField
                    f={f}
                    path={`substances.substancesOfConcern.${index}.ecNumber`}
                    label="EC number"
                    mono
                  />
                  <SelectField
                    f={f}
                    path={`substances.substancesOfConcern.${index}.concentrationRange`}
                    label="Concentration"
                    options={CONCENTRATIONS}
                  />
                  <TextField
                    f={f}
                    path={`substances.substancesOfConcern.${index}.componentRef`}
                    label="Located in"
                    mono
                    hint="A component reference from the Composition section."
                  />
                  <TextField
                    f={f}
                    path={`substances.substancesOfConcern.${index}.scipNumber`}
                    label="SCIP number"
                    mono
                  />
                </Row>
                <BoolField
                  f={f}
                  path={`substances.substancesOfConcern.${index}.svhc`}
                  label="On the REACH Candidate List"
                />
                <TextAreaField
                  f={f}
                  path={`substances.substancesOfConcern.${index}.safeUseInstructions.en`}
                  label="Safe use"
                  rows={2}
                />
              </div>
            )}
          </Repeatable>

          <Repeatable
            legend="Restricted substance tests"
            description="An absence claim is only worth what the test behind it is worth. Name the standard, the analyte and the laboratory."
            addLabel="Add a test"
            rowNoun="Test"
            initialCount={tests}
            max={200}
            readOnly={f.readOnly}
            empty="No test results recorded."
          >
            {(index) => (
              <Row columns={3}>
                <TextField
                  f={f}
                  path={`substances.restrictedSubstanceTests.${index}.standard`}
                  label="Standard"
                  required
                />
                <TextField
                  f={f}
                  path={`substances.restrictedSubstanceTests.${index}.analyte`}
                  label="Substance tested"
                  required
                />
                <SelectField
                  f={f}
                  path={`substances.restrictedSubstanceTests.${index}.result`}
                  label="Result"
                  options={TEST_RESULTS}
                  required
                />
                <TextField
                  f={f}
                  path={`substances.restrictedSubstanceTests.${index}.limitValue`}
                  label="Limit"
                  mono
                />
                <TextField
                  f={f}
                  path={`substances.restrictedSubstanceTests.${index}.measuredValue`}
                  label="Measured"
                  mono
                />
                <TextField
                  f={f}
                  path={`substances.restrictedSubstanceTests.${index}.laboratory`}
                  label="Laboratory"
                />
                <TextField
                  f={f}
                  path={`substances.restrictedSubstanceTests.${index}.testedOn`}
                  label="Tested on"
                  type="date"
                />
                <TextField
                  f={f}
                  path={`substances.restrictedSubstanceTests.${index}.reportDocumentId`}
                  label="Report reference"
                  mono
                />
              </Row>
            )}
          </Repeatable>

          <Group title="Chemical management" columns={2}>
            <SelectField f={f} path="substances.pfasStatus" label="PFAS" options={PFAS} />
            <SelectField
              f={f}
              path="substances.chemicalManagement.zdhcConformance"
              label="ZDHC conformance"
              options={ZDHC}
            />
            <TextField
              f={f}
              path="substances.chemicalManagement.mrslVersion"
              label="MRSL version"
              mono
            />
          </Group>

          <BoolField
            f={f}
            path="substances.chemicalManagement.wastewaterTested"
            label="Wastewater from wet processing is tested"
          />
        </>
      )}
    </SectionFrame>
  );
}
