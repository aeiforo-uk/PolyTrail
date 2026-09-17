'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatDppId } from '@/lib/passport/identifier';

/**
 * The passport as an object.
 *
 * Until now a passport was a URL and a row in a table. Nothing in the product
 * looked like the thing it is, and there was no data carrier anywhere — the
 * one artefact ESPR actually requires to be on the garment.
 *
 * So this is laid out as a passport data page, because that is what it is: an
 * identity band, a portrait, a field block, and a machine-readable zone. The
 * MRZ is not decoration — it prints the URI the code encodes, in a monospace
 * face, so a human can read and re-key what the scanner reads optically. That
 * is exactly the job an MRZ does on a travel document.
 *
 * The reverse carries the code itself. A passport has two sides; putting the
 * identity on one and the carrier on the other is the arrangement the physical
 * object already settled on, and it means neither side is crowded.
 */

export interface PassportCardProps {
  dppId: string;
  productName: string;
  brandName?: string | null;
  category?: string | null;
  countryOfOrigin?: string | null;
  gtin?: string | null;
  status?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  /** Pre-rendered on the server: see `carrierSvg`. */
  qrSvg: string;
  /** What the code resolves to, printed in the machine-readable zone. */
  carrierUri: string;
  carrierScheme: 'gs1' | 'native';
  className?: string;
}

export function PassportCard({
  dppId,
  productName,
  brandName,
  category,
  countryOfOrigin,
  gtin,
  status,
  imageUrl,
  imageAlt,
  qrSvg,
  carrierUri,
  carrierScheme,
  className,
}: PassportCardProps) {
  const [showCarrier, setShowCarrier] = useState(false);

  return (
    <figure className={cn('flex w-full max-w-[20rem] flex-col gap-3', className)}>
      {/*
        `perspective` lives on the parent rather than the card, so the vanishing
        point stays fixed while the card turns. Set on the card itself, the
        perspective rotates with it and the near edge swells — the effect every
        CSS flip-card tutorial ships and nobody can name.
      */}
      <div className="passport-stage">
        <div
          className={cn('passport-card', showCarrier && 'is-turned')}
          data-turned={showCarrier ? 'true' : 'false'}
        >
          <div className="passport-face">
            <Face
              dppId={dppId}
              productName={productName}
              brandName={brandName}
              category={category}
              countryOfOrigin={countryOfOrigin}
              gtin={gtin}
              status={status}
              imageUrl={imageUrl}
              imageAlt={imageAlt}
              carrierUri={carrierUri}
            />
          </div>
          <div className="passport-face passport-face-back">
            <Carrier
              dppId={dppId}
              qrSvg={qrSvg}
              carrierUri={carrierUri}
              carrierScheme={carrierScheme}
            />
          </div>
        </div>
      </div>

      <figcaption className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowCarrier((v) => !v)}
          aria-pressed={showCarrier}
          className="press rounded-md border border-line bg-surface px-2.5 py-1.5 text-label-3 text-ink-muted transition-colors duration-[--duration-fast] hover:border-line-hover hover:text-ink"
        >
          {showCarrier ? 'Show details' : 'Show code'}
        </button>
        <a
          href={`/api/passports/${dppId}/carrier.svg`}
          download={`polytrail-${dppId}.svg`}
          className="text-label-3 text-accent underline-offset-2 hover:underline"
        >
          Download artwork
        </a>
      </figcaption>
    </figure>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.5625rem] leading-3 font-medium tracking-[0.1em] text-ink-subtle uppercase">
        {label}
      </dt>
      <dd className={cn('truncate text-label-3 text-ink', mono && 'mono')}>{value}</dd>
    </div>
  );
}

function Face({
  dppId,
  productName,
  brandName,
  category,
  countryOfOrigin,
  gtin,
  status,
  imageUrl,
  imageAlt,
  carrierUri,
}: Omit<PassportCardProps, 'qrSvg' | 'carrierScheme' | 'className'>) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-baseline justify-between gap-2 border-b border-line px-4 pt-3.5 pb-2.5">
        <span className="text-[0.5625rem] leading-3 font-semibold tracking-[0.14em] text-ink uppercase">
          Digital Product Passport
        </span>
        <span className="text-[0.5625rem] leading-3 tracking-[0.1em] text-ink-subtle uppercase">
          ESPR
        </span>
      </header>

      {/*
        The plate stretches to the data area rather than sitting at a fixed
        aspect: a fixed one left a column of empty card beneath it, which is the
        single thing that made this read as a mock-up rather than a document.
      */}
      <div className="flex min-h-0 flex-1 gap-3.5 px-4 py-3.5">
        <div className="relative w-[38%] shrink-0 self-stretch overflow-hidden rounded-sm border border-line bg-surface-sunken">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={imageAlt ?? ''}
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            /*
              Not an icon and not the word "No image". A twill hatch reads as
              an absent swatch, which is what it is, and it keeps the plate
              the same weight as a filled one so the card does not reflow
              between a passport that has a photograph and one that does not.
            */
            <div className="passport-swatch size-full" aria-hidden />
          )}
        </div>

        <dl className="flex min-w-0 flex-1 flex-col gap-2.5">
          <Field label="Product" value={productName} />
          {brandName ? <Field label="Brand" value={brandName} /> : null}
          {category ? <Field label="Type" value={category} /> : null}
          {countryOfOrigin ? <Field label="Origin" value={countryOfOrigin} /> : null}
          <div className="mt-auto flex flex-col gap-2.5">
            {gtin ? <Field label="GTIN" value={gtin} mono /> : null}
            {status ? <Field label="Status" value={status} /> : null}
          </div>
        </dl>
      </div>

      {/*
        The machine-readable zone: the same identifier the code carries, set so
        a human can read it back. The passport number leads, because that is
        what someone re-keys when a scan fails; the URI sits under it in a
        lighter ink as the thing the number resolves to.
      */}
      <footer className="border-t border-line bg-surface-sunken px-4 py-2.5">
        <p className="mono text-[0.6875rem] leading-4 tracking-[0.08em] text-ink">
          {formatDppId(dppId)}
        </p>
        <p className="mono mt-0.5 truncate text-[0.5625rem] leading-[1.4] text-ink-subtle">
          {carrierUri.replace(/^https?:\/\//, '')}
        </p>
      </footer>
    </div>
  );
}

function Carrier({
  dppId,
  qrSvg,
  carrierUri,
  carrierScheme,
}: {
  dppId: string;
  qrSvg: string;
  carrierUri: string;
  carrierScheme: 'gs1' | 'native';
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-5 text-center">
      {/*
        Inlined as markup rather than an <img>, so it survives blocked images
        and needs no second request. It keeps a white ground in both themes —
        see `.passport-qr`; a themed code is a code a scanner cannot read.
      */}
      <div
        className="passport-qr w-full max-w-[10.5rem] shadow-xs"
        aria-hidden
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />
      <div className="flex flex-col gap-1">
        <p className="text-label-3 text-ink">Scan to open this passport</p>
        <p className="mono text-[0.5625rem] leading-[1.4] break-all text-ink-subtle">
          {carrierUri.replace(/^https?:\/\//, '')}
        </p>
        <p className="mt-1 text-[0.5625rem] leading-3 tracking-[0.1em] text-ink-subtle uppercase">
          {carrierScheme === 'gs1' ? 'GS1 Digital Link' : 'Polytrail resolver'}
        </p>
      </div>
      <span className="sr-only">
        Passport {formatDppId(dppId)}. The code opens {carrierUri}.
      </span>
    </div>
  );
}
