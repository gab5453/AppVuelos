import type { AuthenticatedUser } from './authenticated-user.interface.js';

export const TOKEN_VERIFIER_PORT = Symbol('TOKEN_VERIFIER_PORT');

/**
 * Puerto que abstrae la verificación del token OAuth2. La implementación real
 * (introspección/JWKS contra https://auth.booking-hub.com) se conecta después
 * sin tocar guards, controllers ni el contrato HTTP.
 */
export interface TokenVerifierPort {
  verify(bearerToken: string): Promise<AuthenticatedUser>;
}
