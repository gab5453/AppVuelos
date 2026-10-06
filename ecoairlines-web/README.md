# EcoAirlines — Frontend

Sitio web de la aerolínea ficticia **EcoAirlines** (proyecto académico). React + TypeScript + Vite.
Consume la API de vuelos (`../EcoAirlines.API`, solución en 4 capas) respetando su contrato OpenAPI y obtiene
los tokens del servidor de autenticación de desarrollo (`../dev-auth`).

## Levantar todo en local

Tres procesos, cada uno en su terminal, desde la raíz del repositorio:

```bash
# 1) API de vuelos (puerto 3000) — Swagger en http://localhost:3000/docs
npm install && npm run start:dev

# 2) Autenticación de desarrollo (puerto 4000) — sin dependencias
cd dev-auth && npm start

# 3) Frontend (puerto 5173)
cd ecoairlines-web && npm install && npm run dev
```

Abrir **http://localhost:5173**. Usuario de prueba: `demo@ecoairlines.test` / `EcoDemo2026` (o crear una cuenta).

Si la API corre en otro puerto, copiar `.env.example` a `.env` y ajustar `VITE_API_URL`. La API solo acepta
el origen del frontend que figure en su `CORS_ORIGINS` (por defecto `http://localhost:5173`).

## Qué incluye

| Página | Ruta | Endpoints del contrato |
|--------|------|------------------------|
| Inicio con buscador (ida, ida y vuelta, multidestino) | `/` | — |
| Resultados y tarifas | `/vuelos` | `POST /search`, `POST /offers/hold` |
| Checkout (pasajeros, asientos, maletas, pago) | `/reserva` | `GET /offers/{offerId}/seatmap`, `GET/DELETE /offers/hold/{holdId}`, `POST /bookings` |
| Mis viajes | `/mis-viajes` | `GET /bookings` |
| Detalle, check-in, pases, maletas, cambio de fecha, cancelación | `/mis-viajes/:id` | `GET /bookings/{id}`, `/check-in`, `/boarding-passes`, `/baggage-options`, `/baggage`, `/date-change/search`, `/date-change`, `/cancellation-quote`, `/cancel` |
| Estado de vuelo (público) | `/estado-de-vuelo` | `GET /flights/{flightNumber}/status` |
| Compromiso verde | `/compromiso-verde` | — |

**Extensiones fuera del contrato** (`../contract/ecoairlines-extensions.yaml`, ver HALLAZGOS EXT-01):

| Página | Ruta | Endpoints propios | Quién |
|--------|------|-------------------|-------|
| Mi perfil (autocompleta al pasajero 1 en el checkout) | `/mi-perfil` | `GET/PUT /customers/me` | Cliente |
| Cambiar asiento (pestaña del detalle de la reserva) | `/mis-viajes/:id` | `PUT /bookings/{id}/seat` | Cliente |
| Panel de administración (indicadores, vuelos, pasajeros, rutas, reservas) | `/admin` | `GET /admin/dashboard-stats`, `PUT /admin/flights/{n}/status`, `GET /admin/flights/{n}/passengers` | Administrador |
| Observabilidad (backend + navegador) | `/admin/observabilidad` | `GET /admin/observability` | Administrador |

El administrador de desarrollo es `admin@ecoairlines.test` / `EcoAdmin2026`. La observabilidad del navegador (`src/lib/observability.ts`,
basada en Ejemplo 1) guarda los datos solo en el `localStorage` de cada navegador y nunca registra el valor de los campos.

## Seguridad

- El token (JWT) vive **solo en memoria**: no se guarda en `localStorage`. Se pierde al recargar y la sesión se cierra al vencer.
- Los datos de la API se renderizan con React (escapados); no se usa `dangerouslySetInnerHTML`.
- Cada operación con `Idempotency-Key` genera una clave por intento: se reutiliza en reintentos y se renueva si cambian los datos.
- `X-Device-Fingerprint` es un UUID aleatorio por navegador (no identifica a la persona).
- Los errores se muestran a partir del ProblemDetails del contrato (por `code`), incluido `429` con cuenta regresiva de `Retry-After`.
- El pago es solo una **referencia** (`pay_…`): el sitio nunca pide datos de tarjeta, como exige el contrato.
- Tras el login solo se redirige a rutas internas (evita *open redirect*).

## Verificación

```bash
npm run lint    # oxlint
npm run build   # tsc -b && vite build
```

El CO₂ por vuelo es una **estimación ilustrativa** calculada en el navegador; no es un dato de la API.
