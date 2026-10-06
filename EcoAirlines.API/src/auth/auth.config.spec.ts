import { AuthConfigError, DEV_JWT_SECRET, loadAuthConfig } from './auth.config.js';

const PROD_SECRET = 'a-real-production-secret-with-enough-length-123';

describe('loadAuthConfig', () => {
  it('fuera de producción usa valores de desarrollo (HS256) y lo indica', () => {
    const config = loadAuthConfig({ NODE_ENV: 'development' });
    expect(config).toMatchObject({ mode: 'secret', secret: DEV_JWT_SECRET, algorithms: ['HS256'], usingDevDefaults: true });
  });

  it('usa JWKS con algoritmos asimétricos cuando se configura AUTH_JWKS_URL', () => {
    const config = loadAuthConfig({ AUTH_JWKS_URL: 'https://auth.example.com/.well-known/jwks.json' });
    expect(config).toMatchObject({ mode: 'jwks', algorithms: ['RS256', 'ES256'] });
  });

  it('rechaza secretos de menos de 32 caracteres', () => {
    expect(() => loadAuthConfig({ AUTH_JWT_SECRET: 'corto' })).toThrow(AuthConfigError);
  });

  describe('en producción', () => {
    const base = { NODE_ENV: 'production', AUTH_ISSUER: 'https://auth.example.com', AUTH_AUDIENCE: 'vuelos-api' };

    it('exige AUTH_ISSUER y AUTH_AUDIENCE', () => {
      expect(() => loadAuthConfig({ NODE_ENV: 'production', AUTH_JWT_SECRET: PROD_SECRET })).toThrow(AuthConfigError);
    });

    it('exige AUTH_JWKS_URL o AUTH_JWT_SECRET (no hay valores por defecto)', () => {
      expect(() => loadAuthConfig(base)).toThrow(AuthConfigError);
    });

    it('rechaza el secreto de desarrollo', () => {
      expect(() => loadAuthConfig({ ...base, AUTH_JWT_SECRET: DEV_JWT_SECRET })).toThrow(AuthConfigError);
    });

    it('exige https para el JWKS', () => {
      expect(() => loadAuthConfig({ ...base, AUTH_JWKS_URL: 'http://auth.example.com/jwks' })).toThrow(AuthConfigError);
    });

    it('acepta una configuración completa', () => {
      expect(loadAuthConfig({ ...base, AUTH_JWT_SECRET: PROD_SECRET })).toMatchObject({
        mode: 'secret',
        issuer: base.AUTH_ISSUER,
        audience: base.AUTH_AUDIENCE,
        usingDevDefaults: false,
      });
    });
  });
});
