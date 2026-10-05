import {
  DEV_SECURITY_SCHEME,
  applyDevOverlay,
  isSwaggerEnabled,
  loadContract,
} from './swagger.setup.js';

describe('swagger.setup', () => {
  describe('applyDevOverlay', () => {
    const contract = loadContract();
    const overlaid = applyDevOverlay(contract, 'http://localhost:3000');

    it('no altera el documento original (trabaja sobre una copia)', () => {
      expect(loadContract()).toEqual(contract);
      expect(contract.components?.securitySchemes).not.toHaveProperty(DEV_SECURITY_SCHEME);
    });

    it('antepone el servidor local y conserva los servidores del contrato', () => {
      expect(overlaid.servers?.[0]?.url).toBe('http://localhost:3000');
      expect(overlaid.servers?.slice(1)).toEqual(contract.servers);
    });

    it('agrega DevBearer como alternativa sin quitar OAuth2Security ni sus scopes', () => {
      const original = contract.paths['/bookings']!.post!.security!;
      const withDev = overlaid.paths['/bookings']!.post!.security!;

      expect(withDev.slice(0, original.length)).toEqual(original);
      expect(withDev).toContainEqual({ [DEV_SECURITY_SCHEME]: [] });
    });

    it('no agrega seguridad a endpoints públicos (security: [])', () => {
      expect(overlaid.paths['/search']!.post!.security).toEqual([]);
      expect(overlaid.paths['/flights/{flightNumber}/status']!.get!.security).toEqual([]);
    });

    it('no cambia schemas ni responses del contrato', () => {
      const { securitySchemes: _a, ...originalComponents } = contract.components ?? {};
      const { securitySchemes: _b, ...overlaidComponents } = overlaid.components ?? {};
      expect(overlaidComponents).toEqual(originalComponents);
    });
  });

  describe('isSwaggerEnabled', () => {
    it('está habilitado por defecto fuera de producción', () => {
      expect(isSwaggerEnabled({ NODE_ENV: 'development' })).toBe(true);
      expect(isSwaggerEnabled({})).toBe(true);
    });

    it('está deshabilitado por defecto en producción', () => {
      expect(isSwaggerEnabled({ NODE_ENV: 'production' })).toBe(false);
    });

    it('SWAGGER_ENABLED tiene prioridad sobre NODE_ENV', () => {
      expect(isSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' })).toBe(true);
      expect(isSwaggerEnabled({ NODE_ENV: 'development', SWAGGER_ENABLED: 'false' })).toBe(false);
    });
  });
});
