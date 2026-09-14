import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import type { Identity } from './identity';

export const ACCESS_JWT_HEADER = 'cf-access-jwt-assertion';
export const ACCESS_TEAM_DOMAIN = 'pipiscats.cloudflareaccess.com';

export type AccessJwtConfig = {
  teamDomain: string;
  audience: string;
};

export function readAccessJwtConfig(
  env: NodeJS.ProcessEnv = process.env,
): AccessJwtConfig | null {
  const audience = env.LOLVAULT_ACCESS_AUD?.trim();
  if (!audience) return null;

  return { teamDomain: ACCESS_TEAM_DOMAIN, audience };
}

function issuerFor(teamDomain: string): string {
  return `https://${teamDomain}`;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(teamDomain: string) {
  const cached = jwksCache.get(teamDomain);
  if (cached) return cached;

  const jwks = createRemoteJWKSet(
    new URL(`${issuerFor(teamDomain)}/cdn-cgi/access/certs`),
  );
  jwksCache.set(teamDomain, jwks);
  return jwks;
}

function emailFrom(payload: JWTPayload): string | null {
  const email = payload.email;
  return typeof email === 'string' && email.length > 0 ? email : null;
}

/** Valida firma, issuer y AUD; los tokens inválidos se tratan como anónimos. */
export async function verifyAccessJwt(
  token: string,
  config: AccessJwtConfig,
): Promise<Identity | null> {
  try {
    const { payload } = await jwtVerify(token, getJwks(config.teamDomain), {
      issuer: issuerFor(config.teamDomain),
      audience: config.audience,
    });

    const email = emailFrom(payload);
    if (!payload.sub || !email) return null;

    return { externalIdentity: payload.sub, email, source: 'access-jwt' };
  } catch {
    return null;
  }
}
