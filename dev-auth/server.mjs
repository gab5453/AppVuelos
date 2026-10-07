// Servidor de autenticación de DESARROLLO (HALL-03, opción a).
//
// Simula el authorization server externo del contrato (auth.booking-hub.com): emite JWT de acceso
// que la API de vuelos verifica. Vive FUERA de la API de vuelos, que no gana ninguna ruta nueva.
// No usar en producción: allí los tokens los emite el proveedor OAuth2 real (AUTH_JWKS_URL).
//
//   POST /register  { name, email, password }  → 201 { access_token, token_type, expires_in, scope, user }
//   POST /login     { email, password }        → 200 (misma respuesta)
//   La respuesta incluye user { name, email, role }: CUSTOMER o ADMIN (campos de la plantilla del grupo).
//   GET  /health                               → 200
//
// Node ≥ 20. Con DATABASE_URL las cuentas se guardan en PostgreSQL (tabla auth.users, driver "pg"); sin ella, en memoria.
// Documento OpenAPI: openapi.yaml (lo publica el Swagger de la API en desarrollo y en la nube).
import { createHash, createHmac, randomUUID, scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

if (process.env.NODE_ENV === 'production') {
  console.error('dev-auth es solo para desarrollo: no arranca con NODE_ENV=production.');
  process.exit(1);
}

// Deben coincidir con la configuración de la API (EcoAirlines.API/src/auth/auth.config.ts).
const DEV_SECRET = 'vuelos-dev-only-secret-do-not-use-in-production-0001';
const SECRET = process.env.AUTH_JWT_SECRET ?? DEV_SECRET;
const ISSUER = process.env.AUTH_ISSUER ?? 'vuelos-dev-auth';
const AUDIENCE = process.env.AUTH_AUDIENCE ?? 'vuelos-api';
const PORT = Number(process.env.PORT ?? 4000);
// Por defecto: la web (5173) y el Swagger de la API (3000), que puede llamar a /login y /register (dev-auth/openapi.yaml).
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3000').split(',').map((origin) => origin.trim());
const TOKEN_TTL_SECONDS = 3600;
/**
 * Un cliente final no gestiona webhooks (flights:webhooks es para integraciones B2B). `ecoairlines:profile` es un
 * scope PROPIO (fuera del contrato) para su perfil.
 */
const CUSTOMER_SCOPES = 'flights:read flights:hold flights:book flights:cancel ecoairlines:profile';
/** El administrador opera el panel (`ecoairlines:admin`, fuera del contrato) y puede consultar vuelos y reservas. */
const ADMIN_SCOPES = 'flights:read flights:webhooks ecoairlines:admin';
const SCOPES_BY_ROLE = { CUSTOMER: CUSTOMER_SCOPES, ADMIN: ADMIN_SCOPES };
const MAX_BODY_BYTES = 10 * 1024;
const DATABASE_URL = process.env.DATABASE_URL?.trim() || undefined;

// En Azure App Service (WEBSITE_SITE_NAME) es un servicio público: exige un secreto propio, el mismo que usa la API.
if (process.env.WEBSITE_SITE_NAME && (SECRET === DEV_SECRET || SECRET.length < 32)) {
  console.error('dev-auth en la nube necesita AUTH_JWT_SECRET propio (≥ 32 caracteres, el mismo que la API).');
  process.exit(1);
}
const LOGIN_ATTEMPTS_PER_MINUTE = 10;

/**
 * Usuarios por correo, con contraseña derivada con scrypt + salt. Con DATABASE_URL se cargan al arrancar desde
 * PostgreSQL (auth.users) y cada alta se guarda antes de responder; sin ella viven en memoria y se pierden al reiniciar.
 */
const users = new Map();
const attempts = new Map();
let pool;

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}

/** `sub` fijo para los usuarios de prueba (derivado del correo): sus reservas siguen siendo suyas tras un reinicio. */
function seedSub(email) {
  const hex = createHash('sha256').update(`ecoairlines-seed:${email}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function saveUser(user) {
  users.set(user.email, user);
  if (pool) {
    await pool.query(
      'INSERT INTO auth.users (id, data, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()',
      [user.email, JSON.stringify(user)],
    );
  }
  return user;
}

function addUser(name, email, password, role = 'CUSTOMER', sub = randomUUID()) {
  return saveUser({ sub, name, email, role, ...hashPassword(password) });
}

/**
 * Usuarios de prueba (se vuelven a escribir en cada arranque: si cambia ADMIN_PASSWORD, cambia la clave). Tres clientes, para
 * probar reservas, asientos y aislamiento, y el administrador. Las cuentas creadas con /register son siempre CUSTOMER: nadie
 * puede registrarse como ADMIN. En la nube conviene definir ADMIN_PASSWORD: la clave por defecto está en el repositorio.
 */
const SEED_USERS = [
  ['Usuario Demo', 'demo@ecoairlines.test', 'EcoDemo2026', 'CUSTOMER'],
  ['María Torres', 'maria@ecoairlines.test', 'EcoMaria2026', 'CUSTOMER'],
  ['Luis Andrade', 'luis@ecoairlines.test', 'EcoLuis2026', 'CUSTOMER'],
  ['Administrador de Operaciones EcoAirlines', 'admin@ecoairlines.test', process.env.ADMIN_PASSWORD || 'EcoAdmin2026', 'ADMIN'],
];

async function initStore() {
  if (DATABASE_URL) {
    const { default: pg } = await import('pg');
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3, connectionTimeoutMillis: 10_000 });
    await pool.query('CREATE SCHEMA IF NOT EXISTS auth');
    await pool.query('CREATE TABLE IF NOT EXISTS auth.users (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
    const { rows } = await pool.query('SELECT data FROM auth.users');
    for (const { data } of rows) users.set(data.email, data);
  }
  for (const [name, email, password, role] of SEED_USERS) await addUser(name, email, password, role, seedSub(email));
}

const base64url = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/** JWT HS256 con los claims que verifica la API: sub, scope, iss, aud, iat, exp, jti (más name y role). */
function issueToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: 'HS256', typ: 'JWT' });
  const payload = base64url({
    sub: user.sub,
    scope: SCOPES_BY_ROLE[user.role],
    name: user.name,
    role: user.role,
    iss: ISSUER,
    aud: AUDIENCE,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
    jti: randomUUID(),
  });
  const signature = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  return {
    access_token: `${header}.${payload}.${signature}`,
    token_type: 'Bearer',
    expires_in: TOKEN_TTL_SECONDS,
    scope: SCOPES_BY_ROLE[user.role],
    user: { name: user.name, email: user.email, role: user.role },
  };
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function problem(res, status, title) {
  send(res, status, { type: 'about:blank', title, status });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return reject(new Error('content-type'));
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('too-large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        reject(new Error('json'));
      }
    });
  });
}

/** Limita intentos por IP para frenar fuerza bruta de contraseñas. */
function tooManyAttempts(ip) {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((time) => now - time < 60_000);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length > LOGIN_ATTEMPTS_PER_MINUTE;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

async function handle(req, res) {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return void res.writeHead(204).end();
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { status: 'ok' });
  if (req.method !== 'POST' || !['/login', '/register'].includes(req.url)) return problem(res, 404, 'Not Found');

  if (tooManyAttempts(req.socket.remoteAddress ?? '-')) {
    res.setHeader('Retry-After', '60');
    return problem(res, 429, 'Demasiados intentos. Espere un minuto.');
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    return problem(res, 400, 'Se esperaba un body JSON válido (máx. 10 KB).');
  }

  const email = text(body.email, 254).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  if (req.url === '/register') {
    const name = text(body.name, 80);
    if (!name || !EMAIL.test(email) || password.length < 8 || password.length > 128) {
      return problem(res, 400, 'Nombre requerido, correo válido y contraseña de 8 a 128 caracteres.');
    }
    if (users.has(email)) return problem(res, 409, 'Ya existe una cuenta con ese correo.');
    return send(res, 201, issueToken(await addUser(name, email, password)));
  }

  const user = users.get(email);
  const candidate = hashPassword(password, user?.salt ?? 'no-user');
  const valid = user && timingSafeEqual(Buffer.from(candidate.hash, 'hex'), Buffer.from(user.hash, 'hex'));
  // Mismo mensaje para correo inexistente o contraseña incorrecta: no revela qué cuentas existen.
  if (!valid) return problem(res, 401, 'Correo o contraseña incorrectos.');
  return send(res, 200, issueToken(user));
}

await initStore();
createServer((req, res) => {
  handle(req, res).catch(() => problem(res, 500, 'Internal Server Error'));
}).listen(PORT, () => {
  console.log(
    `dev-auth escuchando en el puerto ${PORT} (${pool ? 'cuentas en PostgreSQL' : 'cuentas en memoria'}). Clientes: demo@ecoairlines.test / EcoDemo2026, ` +
      `maria@ecoairlines.test / EcoMaria2026, luis@ecoairlines.test / EcoLuis2026; administrador: admin@ecoairlines.test` +
      (process.env.ADMIN_PASSWORD ? ' (clave en ADMIN_PASSWORD)' : ' / EcoAdmin2026'),
  );
});
