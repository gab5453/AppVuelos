import { defineConfig } from 'vitest/config';
import { layerAliases } from './vitest.shared.js';

/** Pruebas unitarias de las 4 capas y prueba de arquitectura. */
export default defineConfig({
  resolve: { alias: layerAliases },
  test: {
    globals: true,
    root: './',
    include: ['EcoAirlines.*/src/**/*.spec.ts', 'EcoAirlines.*/test/**/*.spec.ts'],
  },
});
