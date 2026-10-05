import { Logger, Module } from '@nestjs/common';
import { AUTH_CONFIG, loadAuthConfig } from './auth.config.js';
import { JwtTokenVerifier } from './infrastructure/jwt-token-verifier.js';
import { TOKEN_VERIFIER_PORT } from './interfaces/token-verifier.port.js';
import { OAuth2AuthGuard } from './guards/oauth2-auth.guard.js';
import { ScopesGuard } from './guards/scopes.guard.js';

/**
 * La configuración se valida al arrancar: en producción, una configuración incompleta
 * detiene la aplicación en vez de aceptar tokens sin verificar.
 */
@Module({
  providers: [
    {
      provide: AUTH_CONFIG,
      useFactory: () => {
        const config = loadAuthConfig();
        if (config.mode === 'secret' && config.usingDevDefaults) {
          new Logger('AuthModule').warn(
            'Verificando JWT con el secreto de desarrollo por defecto. Configure AUTH_JWT_SECRET o AUTH_JWKS_URL.',
          );
        }
        return config;
      },
    },
    { provide: TOKEN_VERIFIER_PORT, useClass: JwtTokenVerifier },
    OAuth2AuthGuard,
    ScopesGuard,
  ],
  exports: [AUTH_CONFIG, TOKEN_VERIFIER_PORT, OAuth2AuthGuard, ScopesGuard],
})
export class AuthModule {}
