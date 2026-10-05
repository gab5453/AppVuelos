import { validateEnvironment } from './validate-environment.js';

describe('validateEnvironment', () => {
  it('acepta la configuración por defecto de desarrollo', () => {
    expect(validateEnvironment({})).toEqual([]);
  });

  it('acepta una configuración de producción completa', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'production',
        AUTH_JWT_SECRET: 'a-real-production-secret-with-enough-length-123',
        AUTH_ISSUER: 'https://auth.example.com',
        AUTH_AUDIENCE: 'vuelos-api',
        CORS_ORIGINS: 'https://www.example.com',
      }),
    ).toEqual([]);
  });

  it('reúne todos los errores en vez de detenerse en el primero', () => {
    const errors = validateEnvironment({
      NODE_ENV: 'production',
      PORT: '99999',
      SWAGGER_ENABLED: 'yes',
      HTTPS_KEY_PATH: './key.pem',
      CORS_ORIGINS: '*',
    });

    expect(errors).toEqual([
      'PORT debe ser un entero entre 1 y 65535.',
      'SWAGGER_ENABLED debe ser "true" o "false".',
      'HTTPS_KEY_PATH y HTTPS_CERT_PATH deben definirse juntos.',
      'En producción AUTH_ISSUER y AUTH_AUDIENCE son obligatorios.',
      expect.stringContaining('CORS_ORIGINS no admite "*"'),
    ]);
  });

  it('rechaza un NODE_ENV desconocido', () => {
    expect(validateEnvironment({ NODE_ENV: 'prod' })).toEqual([expect.stringContaining('NODE_ENV')]);
  });
});
