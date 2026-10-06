import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AliasOptions } from 'vite';

const ROOT = dirname(fileURLToPath(import.meta.url));

const LAYERS: Record<string, string> = {
  api: 'EcoAirlines.API',
  business: 'EcoAirlines.Business',
  'data-management': 'EcoAirlines.DataManagement',
  'data-access': 'EcoAirlines.DataAccess',
};

/**
 * Las pruebas se ejecutan sobre el código fuente: `@ecoairlines/<capa>/x.js` apunta a `<Capa>/src/x.ts`
 * (en producción el mismo import resuelve a `<Capa>/dist/x.js` por el `exports` de cada package.json).
 */
export const layerAliases: AliasOptions = Object.entries(LAYERS).map(([name, dir]) => ({
  find: new RegExp(`^@ecoairlines/${name}/(.*)\.js$`),
  replacement: resolve(ROOT, dir, 'src', '$1.ts'),
}));
