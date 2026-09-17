'use client';

import {
  SelectField,
  TextAreaField,
  TextField,
  enumOptions,
  vocabOptions,
} from '@/components/form/fields';
import { Repeatable } from '@/components/form/repeatable';
import { CERTIFICATION_SCHEMES } from '@/lib/passport/vocab';
import { Group, Row, SectionFrame } from './frame';
import type { SectionProps } from './types';

const OUTCOMES = enumOptions(['pass', 'pass_with_findings', 'fail', 'in_remediation'], {
  pass_with_findings: 'Passed, with findings',
  in_remediation: 'In remediation',
});

export function SocialSection(props: SectionProps) {
  const policies = props.payload.social?.policies?.length ?? 0;
  const audits = props.payload.social?.audits?.length ?? 0;

  return (
    <SectionFrame {...props}>
      {(f) => (
        <>
          <Group title="Due diligence" columns={2}>
            <TextField
              f={f}
              path="social.dueDiligenceStatementUrl"
              label="Due diligence statement"
              type="url"
            />
            <TextField
              f={f}
              path="social.grievanceMechanismUrl"
              label="Grievance mechanism"
              type="url"
              hint="Where a worker or a neighbour can raise a complaint."
            />
          </Group>

          <Repeatable
            legend="Policies"
            addLabel="Add a policy"
            rowNoun="Policy"
            initialCount={policies}
            max={30}
            readOnly={f.readOnly}
            empty="No policies linked."
          >
            {(index) => (
              <Row columns={3}>
                <TextField
                  f={f}
                  path={`social.policies.${index}.kind`}
                  label="Policy"
                  required
                  hint="e.g. Code of conduct."
                />
                <TextField
                  f={f}
                  path={`social.policies.${index}.url`}
                  label="Link"
                  type="url"
                  required
                />
                <TextField
                  f={f}
                  path={`social.policies.${index}.updatedOn`}
                  label="Last updated"
                  type="date"
                />
              </Row>
            )}
          </Repeatable>

          <Repeatable
            legend="Audits"
            description="Findings stay with authorities. What is published is that an audit happened, against what standard and when."
            addLabel="Add an audit"
            rowNoun="Audit"
            initialCount={audits}
            max={100}
            readOnly={f.readOnly}
            empty="No audits recorded."
          >
            {(index) => (
              <div className="flex flex-col gap-4">
                <Row columns={2}>
                  <TextField
                    f={f}
                    path={`social.audits.${index}.stepRef`}
                    label="Facility"
                    mono
                    hint="A supply chain step reference."
                  />
                  <SelectField
                    f={f}
                    path={`social.audits.${index}.standard`}
                    label="Standard"
                    options={vocabOptions(CERTIFICATION_SCHEMES)}
                    required
                  />
                  <TextField
                    f={f}
                    path={`social.audits.${index}.conductedOn`}
                    label="Conducted on"
                    type="date"
                    required
                  />
                  <SelectField
                    f={f}
                    path={`social.audits.${index}.outcome`}
                    label="Outcome"
                    options={OUTCOMES}
                    required
                  />
                  <TextField
                    f={f}
                    path={`social.audits.${index}.reportDocumentId`}
                    label="Report reference"
                    mono
                  />
                </Row>
                <TextAreaField
                  f={f}
                  path={`social.audits.${index}.findingsSummary`}
                  label="Findings"
                  rows={2}
                />
              </div>
            )}
          </Repeatable>

          <Group title="Living wage" columns={3}>
            <TextField f={f} path="social.livingWage.programme" label="Programme" />
            <TextField f={f} path="social.livingWage.benchmarkSource" label="Benchmark source" />
            <TextField
              f={f}
              path="social.livingWage.coveredStepRefs"
              label="Facilities covered"
              kind="list"
              hint="Step references, separated by commas."
            />
          </Group>
        </>
      )}
    </SectionFrame>
  );
}
