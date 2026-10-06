// Desarrollo con recarga: compila la solución en modo watch (`tsc -b -w`) y reinicia la API cuando cambia
// cualquier archivo compilado de las 4 capas (`node --watch`). Uso: `npm run start:dev` desde la raíz.
import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tsc = resolve(root, 'node_modules', 'typescript', 'bin', 'tsc');
const run = (args, options = {}) => spawn(process.execPath, args, { cwd: root, stdio: 'inherit', ...options });

// Primera compilación completa antes de arrancar, para no levantar la API con un dist viejo.
const build = spawnSync(process.execPath, [tsc, '-b'], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

const children = [
  run([tsc, '-b', '-w', '--preserveWatchOutput']),
  run(['--watch', '--enable-source-maps', 'EcoAirlines.API/dist/main.js']),
];

const stop = () => {
  for (const child of children) child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
