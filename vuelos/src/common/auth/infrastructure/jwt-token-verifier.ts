import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { AUTH_CONFIG, type AuthConfig } from '../auth.config.js';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';
import type { TokenVerifierPort } from '../interfaces/token-verifier.port.js';

/**
 * Verifica JWT de acceso: firma, `exp`, `nbf`, `iss` y `aud`, con lista blanca de algoritmos
 * (un token con `alg: none` o con un algoritmo no permitido se rechaza).
 * El `sub` es el único origen del ownerId; los scopes salen del claim estándar `scope`
 * (separado por espacios, RFC 9068) o de `scp`.
 */
@Injectable()
export class JwtTokenVerifier implements TokenVerifierPort {
  private readonly key: Uint8Array | JWTVerifyGetKey;

  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {
    this.key =
      config.mode === 'jwks'
        ? createRemoteJWKSet(new URL(config.jwksUrl))
        : new TextEncoder().encode(config.secret);
  }

  async verify(bearerToken: string): Promise<AuthenticatedUser> {
    const options = {
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithms: this.config.algorithms,
      clockTolerance: this.config.clockToleranceSeconds,
      requiredClaims: ['sub', 'exp'],
    };
    // jose separa las firmas por tipo de clave; el resultado es el mismo en ambos modos.
    const { payload } =
      this.key instanceof Uint8Array
        ? await jwtVerify(bearerToken, this.key, options)
        : await jwtVerify(bearerToken, this.key, options);

    return {
      sub: payload.sub!,
      scopes: extractScopes(payload),
      clientId: extractClientId(payload),
    };
  }
}

function extractScopes(payload: JWTPayload): string[] {
  const raw = payload.scope ?? payload.scp;
  if (typeof raw === 'string') {
    return raw.split(' ').filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw.filter((scope): scope is string => typeof scope === 'string');
  }
  return [];
}

function extractClientId(payload: JWTPayload): string | undefined {
  const raw = payload.client_id ?? payload.azp;
  return typeof raw === 'string' ? raw : undefined;
}
