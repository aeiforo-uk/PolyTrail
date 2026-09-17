import {
  MECHANISM_LABELS,
  MECHANISM_SPECIFICATIONS,
  registerIntegrityProvider,
  unsupported,
  type IntegrityEnvelope,
  type IntegrityMechanism,
  type IntegrityProvider,
  type VerificationVerdict,
} from '../integrity';

/**
 * The three EN 18246 mechanisms Polytrail does not implement yet.
 *
 * They are registered rather than omitted so that the capability endpoint can
 * answer "which mechanisms does this platform support?" with the truth —
 * "four are permitted, one is implemented" — instead of implying that one is
 * all there is. Each carries the note that decides whether it is worth
 * building, because the reason each is unbuilt is different and a future
 * reader should not have to rediscover it.
 */

interface DeclaredOptions {
  mechanism: IntegrityMechanism;
  /** How an envelope of this kind would be recognised, once implemented. */
  detect: (envelope: Record<string, unknown>) => boolean;
  note: string;
}

class DeclaredProvider implements IntegrityProvider {
  readonly mechanism: IntegrityMechanism;
  readonly label: string;
  readonly specification: string;
  readonly implemented = false;
  readonly note: string;
  private readonly detect: DeclaredOptions['detect'];

  constructor(options: DeclaredOptions) {
    this.mechanism = options.mechanism;
    this.label = MECHANISM_LABELS[options.mechanism];
    this.specification = MECHANISM_SPECIFICATIONS[options.mechanism];
    this.note = options.note;
    this.detect = options.detect;
  }

  detects(envelope: Record<string, unknown>): boolean {
    return this.detect(envelope);
  }

  async sign(): Promise<IntegrityEnvelope> {
    return unsupported(this.mechanism, 'sign');
  }

  async verify(): Promise<VerificationVerdict> {
    return {
      valid: false,
      mechanism: this.mechanism,
      reason: `This envelope uses ${this.label}, which Polytrail recognises but cannot verify. ${this.note}`,
      issuer: null,
      subject: null,
      checks: [{ name: 'mechanism-supported', passed: false, detail: this.specification }],
    };
  }
}

export const eidasEaaProvider = new DeclaredProvider({
  mechanism: 'eidas-eaa',
  // A JAdES signature is a JWS with an ETSI-registered header; the `sigT` or
  // `x5c` chain is what distinguishes it from a bare JOSE credential.
  detect: (envelope) => 'jades' in envelope || 'etsiU' in envelope,
  note:
    'It needs a qualified trust service provider under Regulation (EU) 2024/1183, whose certificate chain — not a self-managed DID — is the root of trust. That is a procurement decision before it is an engineering one.',
});

export const iso22376Provider = new DeclaredProvider({
  mechanism: 'iso-22376-vds',
  detect: (envelope) => typeof envelope.vds === 'string' || envelope.type === 'VisibleDigitalSeal',
  note:
    'A visible digital seal encodes the signed data in the carrier itself, so it verifies offline with no network at all. That is a real advantage for customs inspection and a real constraint on payload size — a few hundred bytes, not a passport.',
});

export const iso20248Provider = new DeclaredProvider({
  mechanism: 'iso-iec-20248',
  detect: (envelope) => typeof envelope.DigSig === 'string' || 'digsig' in envelope,
  note:
    'ISO/IEC 20248 signs the barcode payload against a DNS-published data description. It suits high-volume item marking where the reader is a scanner rather than a browser.',
});

registerIntegrityProvider(eidasEaaProvider);
registerIntegrityProvider(iso22376Provider);
registerIntegrityProvider(iso20248Provider);
