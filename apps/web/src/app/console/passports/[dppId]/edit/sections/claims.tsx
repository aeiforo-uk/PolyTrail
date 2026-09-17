'use client';

import {
  GateNotice,
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

const KINDS = enumOptions(
  [
    'recycled_content',
    'organic_content',
    'animal_welfare',
    'carbon',
    'water',
    'chemical_safety',
    'labour',
    'durability',
    'recyclability',
    'circular_design',
    'other',
  ],
  {
    recycled_content: 'Recycled content',
    organic_content: 'Organic content',
    animal_welfare: 'Animal welfare',
    chemical_safety: 'Chemical safety',
    circular_design: 'Circular design',
  },
);

const SCOPES = enumOptions(['whole_product', 'component', 'material', 'facility'], {
  whole_product: 'The whole product',
});

export function ClaimsSection(props: SectionProps) {
  const claims = props.payload.claims?.length ?? 0;
  const certifications = props.payload.certifications?.length ?? 0;

  return (
    <SectionFrame {...props}>
      {(f) => (
        <>
          <GateNotice message={f.gate('claims')} />

          <Repeatable
            legend="Certifications"
            description="Add these first. A claim can only point at evidence that already exists in this passport, and a certificate is what that evidence usually is."
            addLabel="Add a certificate"
            rowNoun="Certificate"
            initialCount={certifications}
            max={60}
            readOnly={f.readOnly}
            empty="No certificates recorded."
          >
            {(index) => (
              <Row columns={3}>
                <TextField
                  f={f}
                  path={`certifications.${index}.id`}
                  label="Reference"
                  mono
                  required
                  hint="Your own key, e.g. gots-2026. Claims point at this."
                />
                <SelectField
                  f={f}
                  path={`certifications.${index}.scheme`}
                  label="Scheme"
                  options={vocabOptions(CERTIFICATION_SCHEMES)}
                  required
                />
                <TextField
                  f={f}
                  path={`certifications.${index}.licenceNumber`}
                  label="Licence number"
                  mono
                  hint="Lets a reader check the certifier's own database."
                />
                <TextField
                  f={f}
                  path={`certifications.${index}.issuedBy`}
                  label="Issued by"
                  required
                />
                <TextField
                  f={f}
                  path={`certifications.${index}.validFrom`}
                  label="Valid from"
                  type="date"
                />
                <TextField
                  f={f}
                  path={`certifications.${index}.validUntil`}
                  label="Valid until"
                  type="date"
                />
                <TextField f={f} path={`certifications.${index}.scope`} label="Scope" />
                <TextField
                  f={f}
                  path={`certifications.${index}.credentialId`}
                  label="Verifiable credential"
                  mono
                />
                <TextField
                  f={f}
                  path={`certifications.${index}.documentId`}
                  label="Certificate document"
                  mono
                />
                <TextField
                  f={f}
                  path={`certifications.${index}.appliesToStepRefs`}
                  label="Covers steps"
                  kind="list"
                />
                <TextField
                  f={f}
                  path={`certifications.${index}.appliesToComponentRefs`}
                  label="Covers components"
                  kind="list"
                />
              </Row>
            )}
          </Repeatable>

          <Repeatable
            legend="Claims"
            description="Every claim must name evidence that exists in this passport. A claim without substantiation is prohibited by Directive (EU) 2024/825, and publication will refuse it."
            addLabel="Add a claim"
            rowNoun="Claim"
            initialCount={claims}
            max={60}
            readOnly={f.readOnly}
            empty="No claims made."
          >
            {(index) => (
              <div className="flex flex-col gap-4">
                <Row columns={3}>
                  <TextField f={f} path={`claims.${index}.id`} label="Reference" mono required />
                  <SelectField
                    f={f}
                    path={`claims.${index}.kind`}
                    label="Type"
                    options={KINDS}
                    required
                  />
                  <SelectField
                    f={f}
                    path={`claims.${index}.scope`}
                    label="Applies to"
                    options={SCOPES}
                    placeholder="The whole product"
                  />
                  <TextField
                    f={f}
                    path={`claims.${index}.scopeRef`}
                    label="Which one"
                    mono
                    hint="A component, material or facility reference."
                  />
                  <TextField
                    f={f}
                    path={`claims.${index}.verifiedBy`}
                    label="Verified by"
                  />
                  <TextField
                    f={f}
                    path={`claims.${index}.validUntil`}
                    label="Valid until"
                    type="date"
                  />
                </Row>
                <TextAreaField
                  f={f}
                  path={`claims.${index}.statement.en`}
                  label="Claim"
                  rows={2}
                  required
                  placeholder="Made with 60% post-consumer recycled polyester."
                />
                <TextField
                  f={f}
                  path={`claims.${index}.evidence`}
                  label="Evidence"
                  kind="list"
                  required
                  hint="Certificate references from above, separated by commas. Publication checks that each one exists."
                />
              </div>
            )}
          </Repeatable>

          <Group columns={1}>
            <p className="text-xs leading-relaxed text-ink-muted">
              Certificates are listed first on purpose: the publication gate walks every claim and
              refuses the passport if any of them points at evidence this passport does not carry.
            </p>
          </Group>
        </>
      )}
    </SectionFrame>
  );
}
