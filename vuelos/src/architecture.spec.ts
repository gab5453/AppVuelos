import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Prueba de arquitectura (auditoría de Gemini, CRITICAL "acoplamiento entre dominios").
 *
 * Cada dominio de `src/modules/*` es dueño de sus datos (su futura base de datos). Un dominio solo puede
 * usar de otro su **API pública**; nunca sus repositorios, ports ni modelos internos. Esta prueba falla si
 * alguien vuelve a importar algo interno de otro dominio.
 */

const MODULES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'modules');

/**
 * API pública de cada dominio: lo único que otros dominios pueden importar.
 * El `*.module.ts` se incluye porque es el que expone la API a la inyección de dependencias de NestJS
 * (y solo exporta la fachada y el guard, nunca repositorios).
 */
const PUBLIC_API: Record<string, string[]> = {
  bookings: [
    'bookings.module.ts',
    'application/bookings.facade.ts',
    'presentation/guards/booking-ownership.guard.ts',
    'presentation/decorators/current-booking.decorator.ts',
  ],
  offers: ['offers.module.ts', 'application/hold.service.ts'],
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

interface CrossImport {
  from: string;
  fromModule: string;
  toModule: string;
  target: string;
}

function crossDomainImports(): CrossImport[] {
  const imports: CrossImport[] = [];
  for (const file of sourceFiles(MODULES_DIR)) {
    const fromModule = relative(MODULES_DIR, file).split(sep)[0]!;
    for (const match of readFileSync(file, 'utf8').matchAll(/from\s+'(\.[^']+)'/g)) {
      const resolved = resolve(dirname(file), match[1]!.replace(/\.js$/, '.ts'));
      const fromModules = relative(MODULES_DIR, resolved);
      if (fromModules.startsWith('..')) continue; // common/, infrastructure/: compartido, no es otro dominio
      const [toModule, ...rest] = fromModules.split(sep);
      if (toModule && toModule !== fromModule) {
        imports.push({ from: relative(MODULES_DIR, file), fromModule, toModule, target: rest.join('/') });
      }
    }
  }
  return imports;
}

describe('Arquitectura: aislamiento de datos entre dominios', () => {
  const imports = crossDomainImports();

  it('ningún dominio importa internos de otro (solo su API pública)', () => {
    const violations = imports
      .filter((entry) => !(PUBLIC_API[entry.toModule] ?? []).includes(entry.target))
      .map((entry) => `${entry.from} → ${entry.toModule}/${entry.target}`);
    expect(violations, `Imports internos entre dominios:\n${violations.join('\n')}`).toEqual([]);
  });

  it('ningún dominio accede al repositorio o a los ports de otro', () => {
    const touchingData = imports.filter((entry) => /domain\/ports\/|repository/.test(entry.target));
    expect(touchingData).toEqual([]);
  });

  it('documenta las dependencias permitidas entre dominios', () => {
    const edges = [...new Set(imports.map((entry) => `${entry.fromModule} → ${entry.toModule}`))].sort();
    expect(edges).toEqual(['bookings → offers', 'check-in → bookings', 'post-sale → bookings']);
  });
});
