'use client';

import {
  GateNotice,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
  enumOptions,
  vocabOptions,
} from '@/components/form/fields';
import { Repeatable } from '@/components/form/repeatable';
import { CATEGORIES } from '@/lib/passport/vocab';
import { Group, Row, SectionFrame } from './frame';
import type { SectionProps } from './types';

const SIZE_SYSTEMS = enumOptions(
  ['EU', 'UK', 'US', 'IT', 'FR', 'JP', 'alpha', 'numeric', 'none'],
  { alpha: 'Alpha (S, M, L)', numeric: 'Numeric', none: 'No size' },
);

const IMAGE_KINDS = enumOptions(['hero', 'detail', 'label', 'flat', 'worn', 'construction'], {
  hero: 'Hero shot',
  detail: 'Detail',
  label: 'Label or tag',
  flat: 'Flat lay',
  worn: 'Worn',
  construction: 'Construction',
});

const OPERATOR_ROLES = enumOptions(
  ['manufacturer', 'importer', 'authorised_representative', 'distributor', 'fulfilment_service_provider'],
  {
    authorised_representative: 'Authorised representative',
    fulfilment_service_provider: 'Fulfilment service provider',
  },
);

const COUNTRY_HINT = 'Two letters, e.g. PT.';

export function IdentitySection(props: SectionProps) {
  const operators = props.payload.identity?.economicOperators?.length ?? 0;
  const images = props.payload.identity?.images?.length ?? 0;

  return (
    <SectionFrame {...props}>
      {(f) => (
        <>
          <GateNotice message={f.gate('identity.productName')} />

          <Group columns={2}>
            <TextField
              f={f}
              path="identity.productName.en"
              label="Product name"
              required
              hint="What a shopper would recognise it as."
            />
            <TextField f={f} path="identity.brandName" label="Brand" required />
            <SelectField
              f={f}
              path="identity.category"
              label="Category"
              required
              options={vocabOptions(CATEGORIES)}
              placeholder="Choose a category"
              hint="Decides the footprint rules and the size system."
            />
            <TextField
              f={f}
              path="identity.countryOfOrigin"
              label="Country of origin"
              kind="upper"
              maxLength={2}
              required
              hint="Where the last substantial transformation happened — not where the fabric came from."
            />
          </Group>

          <Group
            title="Identifiers"
            description="The numbers other systems will use to find this product. A GTIN is what a Digital Link barcode carries."
            columns={3}
          >
            <TextField f={f} path="identity.styleNumber" label="Style reference" mono />
            <TextField f={f} path="identity.sku" label="SKU" mono />
            <TextField
              f={f}
              path="identity.gtin"
              label="GTIN"
              mono
              maxLength={14}
              hint="8 to 14 digits."
            />
            <TextField f={f} path="identity.gmn" label="Global Model Number" mono maxLength={25} />
            <TextField
              f={f}
              path="identity.hsCode"
              label="Customs code"
              mono
              maxLength={10}
              hint="Combined Nomenclature, 4 to 10 digits."
            />
          </Group>

          <Group title="Variant" columns={3}>
            <TextField f={f} path="identity.colourName" label="Colour" />
            <TextField f={f} path="identity.colourCode" label="Colour code" mono />
            <TextField f={f} path="identity.size" label="Size" />
            <SelectField f={f} path="identity.sizeSystem" label="Size system" options={SIZE_SYSTEMS} />
            <TextField f={f} path="identity.season" label="Season" />
            <NumberField
              f={f}
              path="identity.netWeightGrams"
              label="Net weight"
              min={0}
              suffix="g"
              hint="Used for recycling yield and EPR fees."
            />
          </Group>

          <Group columns={1}>
            <TextAreaField
              f={f}
              path="identity.description.en"
              label="Description"
              rows={4}
              placeholder="A plain description of the product, in the words a shopper would use."
            />
          </Group>

          <Repeatable
            legend="Economic operators"
            description="Who is legally answerable for this product in the EU. At least one is required before publishing."
            addLabel="Add an operator"
            rowNoun="Operator"
            initialCount={operators}
            max={10}
            readOnly={f.readOnly}
            empty="No operator named yet."
          >
            {(index) => (
              <Row columns={2}>
                <TextField
                  f={f}
                  path={`identity.economicOperators.${index}.name`}
                  label="Legal name"
                  required
                />
                <SelectField
                  f={f}
                  path={`identity.economicOperators.${index}.role`}
                  label="Role"
                  options={OPERATOR_ROLES}
                  required
                />
                <TextField
                  f={f}
                  path={`identity.economicOperators.${index}.address.line1`}
                  label="Street"
                />
                <TextField
                  f={f}
                  path={`identity.economicOperators.${index}.address.city`}
                  label="City"
                />
                <TextField
                  f={f}
                  path={`identity.economicOperators.${index}.address.postalCode`}
                  label="Postcode"
                />
                <TextField
                  f={f}
                  path={`identity.economicOperators.${index}.address.country`}
                  label="Country"
                  kind="upper"
                  maxLength={2}
                  required
                  hint={COUNTRY_HINT}
                />
                <TextField
                  f={f}
                  path={`identity.economicOperators.${index}.email`}
                  label="Contact email"
                  type="email"
                />
                <TextField
                  f={f}
                  path={`identity.economicOperators.${index}.lei`}
                  label="LEI"
                  mono
                  maxLength={20}
                />
                <TextField
                  f={f}
                  path={`identity.economicOperators.${index}.eori`}
                  label="EORI"
                  mono
                  maxLength={17}
                />
                <TextField
                  f={f}
                  path={`identity.economicOperators.${index}.vat`}
                  label="VAT number"
                  mono
                  maxLength={20}
                />
                <TextField
                  f={f}
                  path={`identity.economicOperators.${index}.gln`}
                  label="GLN"
                  mono
                  maxLength={13}
                />
                <TextField
                  f={f}
                  path={`identity.economicOperators.${index}.did`}
                  label="DID"
                  mono
                  hint="Starts with did:, if the operator has one."
                />
              </Row>
            )}
          </Repeatable>

          <Repeatable
            legend="Images"
            description="Shown on the public passport. Every image needs a description so a screen reader can read it out."
            addLabel="Add an image"
            rowNoun="Image"
            initialCount={images}
            max={20}
            readOnly={f.readOnly}
            empty="No images yet."
          >
            {(index) => (
              <Row columns={3}>
                <TextField
                  f={f}
                  path={`identity.images.${index}.url`}
                  label="Image URL"
                  type="url"
                  required
                />
                <TextField f={f} path={`identity.images.${index}.alt`} label="Description" />
                <SelectField
                  f={f}
                  path={`identity.images.${index}.kind`}
                  label="Type"
                  options={IMAGE_KINDS}
                  placeholder="Detail"
                />
              </Row>
            )}
          </Repeatable>
        </>
      )}
    </SectionFrame>
  );
}
