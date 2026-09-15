import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { ACCESS_TEAM_DOMAIN, readAccessJwtConfig, verifyAccessJwt } from '@/auth/access-jwt';
import { resolveIdentity } from '@/auth/current-user';

const AUDIENCE = 'aud-lolvault-test';
const ISSUER = `https://${ACCESS_TEAM_DOMAIN}`;
const config = { teamDomain: ACCESS_TEAM_DOMAIN, audience: AUDIENCE };

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;
let accessKey: KeyPair;
let otherKey: KeyPair;
let jwks: ReturnType<typeof createLocalJWKSet>;

async function sign(
  claims: JWTPayload,
  options: { key?: KeyPair; issuer?: string; audience?: string; expiresIn?: string | number } = {},
): Promise<string> {
  let jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'access-key' })
    .setIssuedAt()
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE);
  jwt = jwt.setExpirationTime(options.expiresIn ?? '1h');
  return jwt.sign((options.key ?? accessKey).privateKey);
}

beforeAll(async () => {
  accessKey = await generateKeyPair('RS256');
  otherKey = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(accessKey.publicKey);
  jwks = createLocalJWKSet({ keys: [{ ...publicJwk, kid: 'access-key', alg: 'RS256', use: 'sig' }] });
});

describe('verifyAccessJwt', () => {
  it('acepta un token de Access válido y usa sub + email', async () => {
    const token = await sign({ sub: 'access-sub-1', email: 'amigo@example.test' });
    await expect(verifyAccessJwt(token, config, jwks)).resolves.toEqual({
      externalIdentity: 'access-sub-1',
      email: 'amigo@example.test',
      source: 'access-jwt',
    });
  });

  it('rechaza un token emitido para otra app de Access (AUD distinto)', async () => {
    const token = await sign({ sub: 's', email: 'a@example.test' }, { audience: 'aud-de-otra-app' });
    await expect(verifyAccessJwt(token, config, jwks)).resolves.toBeNull();
  });

  it('rechaza otro issuer', async () => {
    const token = await sign({ sub: 's', email: 'a@example.test' }, { issuer: 'https://otro.cloudflareaccess.com' });
    await expect(verifyAccessJwt(token, config, jwks)).resolves.toBeNull();
  });

  it('rechaza un token vencido', async () => {
    const token = await sign({ sub: 's', email: 'a@example.test' }, { expiresIn: Math.floor(Date.now() / 1000) - 60 });
    await expect(verifyAccessJwt(token, config, jwks)).resolves.toBeNull();
  });

  it('rechaza una firma que no es de las claves de Access', async () => {
    const token = await sign({ sub: 's', email: 'a@example.test' }, { key: otherKey });
    await expect(verifyAccessJwt(token, config, jwks)).resolves.toBeNull();
  });

  it('rechaza tokens sin sub o sin email', async () => {
    await expect(verifyAccessJwt(await sign({ email: 'a@example.test' }), config, jwks)).resolves.toBeNull();
    await expect(verifyAccessJwt(await sign({ sub: 's' }), config, jwks)).resolves.toBeNull();
  });

  it('rechaza basura y tokens sin firmar', async () => {
    await expect(verifyAccessJwt('no-es-un-jwt', config, jwks)).resolves.toBeNull();
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: 's', email: 'a@example.test', iss: ISSUER, aud: AUDIENCE }),
    ).toString('base64url')}.`;
    await expect(verifyAccessJwt(unsigned, config, jwks)).resolves.toBeNull();
  });
});

describe('configuración y resolución de identidad', () => {
  it('sin LOLVAULT_ACCESS_AUD no hay configuración de Access', () => {
    expect(readAccessJwtConfig({ LOLVAULT_ACCESS_AUD: '  ' } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(readAccessJwtConfig({ LOLVAULT_ACCESS_AUD: AUDIENCE } as unknown as NodeJS.ProcessEnv)).toEqual(config);
  });

  it('en producción, sin token válido nadie entra aunque haya bypass de dev o cookie', async () => {
    const env = {
      NODE_ENV: 'production',
      LOLVAULT_ACCESS_AUD: AUDIENCE,
      LOLVAULT_DEV_USER_EMAIL: 'dev@example.test',
    } as NodeJS.ProcessEnv;
    await expect(resolveIdentity(null, env, 'amigo@dev.local')).resolves.toBeNull();
    await expect(resolveIdentity(undefined, env)).resolves.toBeNull();
  });
});
