import { defineConfig } from 'vitest/config';
import { layerAliases } from './vitest.shared.js';

/** Pruebas e2e contra la aplicación completa (misma configuración que main.ts). */
export default defineConfig({
  resolve: { alias: layerAliases },
  test: {
    globals: true,
    root: './',
    include: ['EcoAirlines.API/test/**/*.e2e-spec.ts'],
  },
});
