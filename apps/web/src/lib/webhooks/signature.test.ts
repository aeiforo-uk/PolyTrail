import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { signWebhook, verifyWebhookSignature } from './signature';

const SECRET = 'a-webhook-secret-that-is-long-enough';
const BODY = JSON.stringify({ id: 'evt_1', type: 'passport.published' });

describe('webhook signatures', () => {
  it('produces a header a receiver can verify by following the documented recipe', () => {
    const header = signWebhook(SECRET, BODY);
    const [t, v1] = header.split(',').map((part) => part.split('=')[1]);

    const expected = createHmac('sha256', SECRET).update(`${t}.${BODY}`).digest('hex');

    expect(v1).toBe(expected);
    expect(verifyWebhookSignature(SECRET, BODY, header).valid).toBe(true);
  });

  it('rejects a body that changed after signing', () => {
    const header = signWebhook(SECRET, BODY);
    const result = verifyWebhookSignature(SECRET, BODY.replace('evt_1', 'evt_2'), header);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/does not match/);
  });

  it('rejects the wrong secret', () => {
    const header = signWebhook(SECRET, BODY);
    expect(verifyWebhookSignature('another-secret-entirely-long-enough', BODY, header).valid).toBe(
      false,
    );
  });

  // The point of putting the timestamp inside the MAC: a captured delivery
  // cannot be replayed later, and cannot have its timestamp edited forward.
  it('rejects a replayed delivery outside the tolerance window', () => {
    const anHourAgo = Math.floor(Date.now() / 1000) - 3600;
    const header = signWebhook(SECRET, BODY, anHourAgo);

    const result = verifyWebhookSignature(SECRET, BODY, header);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/replay window/);
  });

  it('rejects a delivery whose timestamp was moved forward to look fresh', () => {
    const anHourAgo = Math.floor(Date.now() / 1000) - 3600;
    const original = signWebhook(SECRET, BODY, anHourAgo);
    const v1 = original.split(',')[1];
    const forged = `t=${Math.floor(Date.now() / 1000)},${v1}`;

    expect(verifyWebhookSignature(SECRET, BODY, forged).valid).toBe(false);
  });

  it('explains a missing or malformed header instead of just failing', () => {
    expect(verifyWebhookSignature(SECRET, BODY, null).reason).toMatch(/No Polytrail-Signature/);
    expect(verifyWebhookSignature(SECRET, BODY, 'garbage').reason).toMatch(/missing its/);
    expect(verifyWebhookSignature(SECRET, BODY, 't=nope,v1=abc').reason).toMatch(/not a number/);
  });
});
