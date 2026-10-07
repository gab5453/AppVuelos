# EcoAirlines — Frontend

Sitio web de la aerolínea ficticia **EcoAirlines** (proyecto académico). React 19 + TypeScript + Vite 8.
Consume la API de vuelos (`../EcoAirlines.API`, solución en 4 capas) respetando su contrato OpenAPI y obtiene
los tokens del servidor de autenticación (`../dev-auth`).

**En línea:** https://nice-hill-090e19c10.1.azurestaticapps.net (Azure Static Web Apps).

## Levantar todo en local

Tres procesos, cada uno en su terminal, desde la raíz del repositorio:

```bash
# 1) API de vuelos (puerto 3000) — Swagger en http://localhost:3000/docs
npm install && npm run start:dev

# 2) Autenticación (puerto 4000)
cd dev-auth && npm install && npm start

# 3) Frontend (puerto 5173)
cd ecoairlines-web && npm install && npm run dev
```

Abrir **http://localhost:5173**.

**Usuarios de prueba:**
- Clientes: `demo@ecoairlines.test` / `EcoDemo2026`, `maria@ecoairlines.test` / `EcoMaria2026` y `luis@ecoairlines.test` / `EcoLuis2026`.
  También se puede crear una cuenta.
- Administrador: `admin@ecoairlines.test` / `EcoAdmin2026` en local. En la nube, la clave es la de `ADMIN_PASSWORD`.

Si la API o dev-auth corren en otro puerto, copiar `.env.example` a `.env` y ajustar `VITE_API_URL` / `VITE_AUTH_URL`. La API solo acepta
el origen del frontend que figure en su `CORS_ORIGINS` (por defecto `http://localhost:5173`).

## Despliegue (Azure Static Web Apps)

El workflow `../.github/workflows/azure-static-web-apps-nice-hill-090e19c10.yml` se ejecuta en cada push a `main` que toque esta
carpeta:
1. Compila con Node 24, con las URLs públicas de la API y de dev-auth (`VITE_API_URL` y `VITE_AUTH_URL` se fijan **al compilar**).
2. Pasa el lint.
3. Sube `dist`.

`public/staticwebapp.config.json` hace que recargar una ruta interna (`/admin`, `/mis-viajes/…`) devuelva `index.html` en vez de
404, y agrega cabeceras de seguridad.

## Qué incluye

| Página | Ruta | Endpoints del contrato |
|--------|------|------------------------|
| Inicio con buscador (ida, ida y vuelta, multidestino; fechas desde hoy, hasta 91 días) | `/` | — |
| Resultados y tarifas | `/vuelos` | `POST /search`, `POST /offers/hold` |
| Checkout: pasajeros validados (edad según el tipo, cédula ecuatoriana, documento único), **asientos y equipaje del grupo en un solo panel**, pago | `/reserva` | `GET /offers/{offerId}/seatmap`, `GET/DELETE /offers/hold/{holdId}`, `POST /bookings` |
| Mis viajes | `/mis-viajes` | `GET /bookings` |
| Detalle, check-in, pases, maletas, cambio de fecha, cancelación | `/mis-viajes/:id` | `GET /bookings/{id}`, `/check-in`, `/boarding-passes`, `/baggage-options`, `/baggage`, `/date-change/search`, `/date-change`, `/cancellation-quote`, `/cancel` |
| Estado de vuelo (público) | `/estado-de-vuelo` | `GET /flights/{flightNumber}/status` |
| Compromiso verde | `/compromiso-verde` | — |

**Extensiones fuera del contrato** (`../contract/ecoairlines-extensions.yaml`, ver HALLAZGOS EXT-01):

| Página | Ruta | Endpoints propios | Quién |
|--------|------|-------------------|-------|
| Mi perfil (autocompleta al pasajero 1 en el checkout) | `/mi-perfil` | `GET/PUT /customers/me` | Cliente |
| Cambiar asiento (pestaña del detalle de la reserva) | `/mis-viajes/:id` | `PUT /bookings/{id}/seat` | Cliente |
| Panel: indicadores, **vuelos y asientos** por fecha/origen/ruta, estado de vuelo y pasajeros | `/admin` | `GET /admin/dashboard-stats`, `GET /admin/flights`, `PUT /admin/flights/{n}/status`, `GET /admin/flights/{n}/passengers` | Administrador |
| Panel: **rutas programadas** (crear, editar, dar de baja; elegir aviones) | `/admin` → "Rutas programadas" | `GET/POST /admin/routes`, `GET/PUT/DELETE /admin/routes/{routeId}` | Administrador |
| Panel: **flota** (tipos de avión, registrar, cambiar base, retirar) | `/admin` → "Flota" | `GET /admin/aircraft-types`, `GET/POST /admin/aircraft`, `PUT/DELETE /admin/aircraft/{registration}` | Administrador |
| Panel: ventas por ruta y reservas recientes | `/admin` | `GET /admin/dashboard-stats` | Administrador |
| Observabilidad: backend, **eventos y webhooks**, horario de la flota, navegador | `/admin/observabilidad` | `GET /admin/observability`, `GET /admin/events`, `GET /admin/fleet-schedule` | Administrador |

La observabilidad del navegador (`src/lib/observability.ts`, basada en Ejemplo 1) guarda los datos solo en el `localStorage` de cada
navegador y nunca registra el valor de los campos.

## Seguridad

- El token (JWT) vive **solo en memoria**: no se guarda en `localStorage`. Se pierde al recargar y la sesión se cierra al vencer.
- Los datos de la API se renderizan con React (escapados); no se usa `dangerouslySetInnerHTML`.
- Cada operación con `Idempotency-Key` genera una clave por intento: se reutiliza en reintentos y se renueva si cambian los datos.
- `X-Device-Fingerprint` es un UUID aleatorio por navegador (no identifica a la persona).
- Los errores se muestran a partir del ProblemDetails del contrato (por `code`), incluido `429` con cuenta regresiva de `Retry-After`.
- El pago es solo una **referencia** (`pay_…`): el sitio nunca pide datos de tarjeta, como exige el contrato.
- Tras el login solo se redirige a rutas internas (evita *open redirect*). El cliente y el administrador van cada uno a su página.

## Verificación

```bash
npm run lint    # oxlint
npm run build   # tsc -b && vite build
```

El CO₂ por vuelo es una **estimación ilustrativa** calculada en el navegador; no es un dato de la API.
