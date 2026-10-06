import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Prueba de arquitectura de la solución en 4 capas (cambio parte 3) que conserva la división de datos por
 * dominio (V1.A, hallazgo CRITICAL de la auditoría de Gemini).
 *
 * 1. **Capas:** cada capa solo usa capas inferiores, como las referencias entre proyectos de la plantilla:
 *    API → Business → DataManagement → DataAccess.
 * 2. **Dominios:** dentro de cada capa los archivos se agrupan por dominio. Un dominio solo usa de otro su
 *    **API pública**; nunca sus repositorios, gateways, entidades ni contextos de datos (su futura base de datos).
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Capas de abajo hacia arriba: una capa solo puede importar las que tienen un índice menor. */
const LAYERS = [
  { dir: 'EcoAirlines.DataAccess', pkg: '@ecoairlines/data-access' },
  { dir: 'EcoAirlines.DataManagement', pkg: '@ecoairlines/data-management' },
  { dir: 'EcoAirlines.Business', pkg: '@ecoairlines/business' },
  { dir: 'EcoAirlines.API', pkg: '@ecoairlines/api' },
];

/** Los 7 dominios del contrato y las 2 extensiones propias (V1.D): customers y admin. */
const DOMAINS = ['search', 'offers', 'bookings', 'post-sale', 'check-in', 'flight-status', 'webhooks', 'customers', 'admin'];

/** Carpetas que se organizan por dominio (`<carpeta>/<dominio>/...`). El resto es código compartido. */
const DOMAIN_FOLDERS = ['controllers', 'services', 'dto', 'rules', 'interfaces', 'repositories', 'gateways', 'entities'];

/** API pública de cada dominio (ruta dentro de `src`, con su capa): lo único que otros dominios pueden importar. */
const PUBLIC_API = new Set([
  'EcoAirlines.Business/services/bookings/bookings.facade.ts',
  'EcoAirlines.Business/services/offers/hold.service.ts',
  'EcoAirlines.Business/services/flight-status/flight-status.service.ts',
  'EcoAirlines.Business/dto/flight-status/flight-status.dto.ts',
  'EcoAirlines.API/controllers/bookings/booking-ownership.guard.ts',
  'EcoAirlines.API/controllers/bookings/current-booking.decorator.ts',
]);

/** Raíces de composición: registran todos los dominios de su capa (equivalen a los DependencyInjection.cs). */
const COMPOSITION_ROOTS = new Set([
  'EcoAirlines.DataAccess/data-access.module.ts',
  'EcoAirlines.DataManagement/data-management.module.ts',
  'EcoAirlines.Business/business.module.ts',
  'EcoAirlines.API/app.module.ts',
]);

interface SourceFile {
  layer: number;
  /** `<Capa>/<ruta dentro de src>`. */
  id: string;
  domain?: string;
  absolute: string;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

function describeFile(absolute: string): SourceFile {
  const layer = LAYERS.findIndex(({ dir }) => absolute.startsWith(join(ROOT, dir, 'src') + sep));
  const inSrc = relative(join(ROOT, LAYERS[layer]!.dir, 'src'), absolute).split(sep);
  const [folder, second] = inSrc;
  const contextDomain = folder === 'context' ? second?.replace(/\.context\.ts$/, '') : undefined;
  const domain =
    folder && DOMAIN_FOLDERS.includes(folder) && second && DOMAINS.includes(second)
      ? second
      : contextDomain && DOMAINS.includes(contextDomain)
        ? contextDomain
        : undefined;
  return { layer, id: `${LAYERS[layer]!.dir}/${inSrc.join('/')}`, domain, absolute };
}

interface Edge {
  from: SourceFile;
  to?: SourceFile;
  /** Capa importada, si es un import de otro paquete de la solución. */
  toLayer?: number;
  specifier: string;
}

function collectEdges(): Edge[] {
  const files = LAYERS.flatMap(({ dir }) => walk(join(ROOT, dir, 'src')));
  return files.flatMap((absolute) => {
    const from = describeFile(absolute);
    const specifiers = [...readFileSync(absolute, 'utf8').matchAll(/(?:from|import)\s+'([^']+)'/g)].map((match) => match[1]!);
    return specifiers.flatMap((specifier): Edge[] => {
      if (specifier.startsWith('.')) {
        const target = resolve(dirname(absolute), specifier.replace(/\.js$/, '.ts'));
        const inSameLayer = target.startsWith(join(ROOT, LAYERS[from.layer]!.dir, 'src') + sep);
        return [{ from, to: inSameLayer ? describeFile(target) : undefined, toLayer: inSameLayer ? from.layer : -1, specifier }];
      }
      const layer = LAYERS.findIndex(({ pkg }) => specifier.startsWith(`${pkg}/`));
      if (layer === -1) return []; // librería externa (@nestjs, class-validator, node:...)
      const target = join(ROOT, LAYERS[layer]!.dir, 'src', specifier.slice(LAYERS[layer]!.pkg.length + 1).replace(/\.js$/, '.ts'));
      return [{ from, to: describeFile(target), toLayer: layer, specifier }];
    });
  });
}

describe('Arquitectura: 4 capas con datos separados por dominio', () => {
  const edges = collectEdges();
  const show = (edge: Edge) => `${edge.from.id} → ${edge.specifier}`;

  it('cada capa solo usa capas inferiores (API → Business → DataManagement → DataAccess)', () => {
    const violations = edges.filter((edge) => edge.toLayer === -1 || edge.toLayer! > edge.from.layer).map(show);
    expect(violations, `Imports hacia una capa superior o fuera de src:\n${violations.join('\n')}`).toEqual([]);
  });

  it('cada package.json declara como dependencia solo capas inferiores', () => {
    LAYERS.forEach(({ dir }, layer) => {
      const { dependencies = {} } = JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
      };
      const declared = LAYERS.filter(({ pkg }) => pkg in dependencies).map(({ pkg }) => pkg);
      expect(declared, dir).toEqual(LAYERS.slice(0, layer).map(({ pkg }) => pkg));
    });
  });

  it('ningún dominio importa internos de otro dominio (solo su API pública)', () => {
    const violations = edges
      .filter((edge) => edge.from.domain && edge.to?.domain && edge.to.domain !== edge.from.domain)
      .filter((edge) => !PUBLIC_API.has(edge.to!.id))
      .map(show);
    expect(violations, `Imports internos entre dominios:\n${violations.join('\n')}`).toEqual([]);
  });

  it('ningún dominio accede a los repositorios, gateways, entidades o contextos de datos de otro', () => {
    const touchingData = edges
      .filter((edge) => edge.from.domain && edge.to?.domain && edge.to.domain !== edge.from.domain)
      .filter((edge) => edge.to!.layer <= 1)
      .map(show);
    expect(touchingData).toEqual([]);
  });

  it('el código compartido no depende de ningún dominio (salvo las raíces de composición)', () => {
    const violations = edges
      .filter((edge) => !edge.from.domain && edge.to?.domain && !COMPOSITION_ROOTS.has(edge.from.id))
      .map(show);
    expect(violations, `Código compartido que depende de un dominio:\n${violations.join('\n')}`).toEqual([]);
  });

  it('documenta las dependencias permitidas entre dominios', () => {
    const domainEdges = edges
      .filter((edge) => edge.from.domain && edge.to?.domain && edge.to.domain !== edge.from.domain)
      .map((edge) => `${edge.from.domain} → ${edge.to!.domain}`);
    expect([...new Set(domainEdges)].sort()).toEqual([
      'admin → bookings',
      'admin → flight-status',
      'bookings → offers',
      'check-in → bookings',
      'post-sale → bookings',
    ]);
  });
});
