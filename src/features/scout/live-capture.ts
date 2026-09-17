import { createHmac, timingSafeEqual } from 'node:crypto';

const LIVE_CAPTURE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

type LiveCaptureProof = {
  version: 1;
  userId: number;
  gameId: number;
  gameStartTime: number;
  capturedAt: number;
};

function signature(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

/** El comprobante puede cruzar al cliente; la RIOT_API_KEY que lo firma, no. */
export function createLiveCaptureToken(
  proof: Omit<LiveCaptureProof, 'version'>,
  secret: string,
): string {
  const payload = Buffer.from(JSON.stringify({ version: 1, ...proof } satisfies LiveCaptureProof))
    .toString('base64url');
  return `${payload}.${signature(payload, secret).toString('base64url')}`;
}

export function verifyLiveCaptureToken(
  token: string,
  userId: number,
  secret: string,
  now = Date.now(),
): boolean {
  const [payload, rawSignature, extra] = token.split('.');
  if (!payload || !rawSignature || extra !== undefined || !secret) return false;

  const actual = Buffer.from(rawSignature, 'base64url');
  const expected = signature(payload, secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<LiveCaptureProof>;
    return parsed.version === 1
      && parsed.userId === userId
      && typeof parsed.gameId === 'number'
      && Number.isFinite(parsed.gameId)
      && typeof parsed.gameStartTime === 'number'
      && Number.isFinite(parsed.gameStartTime)
      && typeof parsed.capturedAt === 'number'
      && Number.isFinite(parsed.capturedAt)
      && parsed.capturedAt <= now
      && now - parsed.capturedAt <= LIVE_CAPTURE_MAX_AGE_MS;
  } catch {
    return false;
  }
}
