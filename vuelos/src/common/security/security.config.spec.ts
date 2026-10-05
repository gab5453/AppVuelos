import { SecurityConfigError, loadSecurityConfig } from './security.config.js';

describe('loadSecurityConfig', () => {
  it('fuera de producción permite el frontend local y no confía en proxies', () => {
    const config = loadSecurityConfig({});
    expect(config.corsOrigins).toEqual(['http://localhost:5173']);
    expect(config.trustProxy).toBe(false);
    expect(config.bodyLimit).toBe('100kb');
    expect(config.rateLimit).toEqual({ ttlMs: 60_000, limit: 300, searchLimit: 30, seatmapLimit: 60 });
  });

  it('en producción no permite orígenes CORS salvo que se declaren', () => {
    expect(loadSecurityConfig({ NODE_ENV: 'production' }).corsOrigins).toEqual([]);
    expect(
      loadSecurityConfig({ NODE_ENV: 'production', CORS_ORIGINS: 'https://a.example.com, https://b.example.com' }).corsOrigins,
    ).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('rechaza el comodín "*" en CORS_ORIGINS', () => {
    expect(() => loadSecurityConfig({ CORS_ORIGINS: '*' })).toThrow(SecurityConfigError);
  });

  it('interpreta TRUST_PROXY como booleano, número de saltos o lista', () => {
    expect(loadSecurityConfig({ TRUST_PROXY: 'true' }).trustProxy).toBe(true);
    expect(loadSecurityConfig({ TRUST_PROXY: '2' }).trustProxy).toBe(2);
    expect(loadSecurityConfig({ TRUST_PROXY: 'loopback, 10.0.0.0/8' }).trustProxy).toBe('loopback, 10.0.0.0/8');
  });

  it('rechaza límites de peticiones no positivos', () => {
    expect(() => loadSecurityConfig({ RATE_LIMIT_SEARCH_LIMIT: '0' })).toThrow(SecurityConfigError);
    expect(() => loadSecurityConfig({ RATE_LIMIT_LIMIT: 'abc' })).toThrow(SecurityConfigError);
  });
});
