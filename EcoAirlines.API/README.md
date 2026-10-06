# API de vuelos — EcoAirlines (Reto 1)

Backend REST en NestJS que implementa el contrato **`../contract/vuelos-openapi.yaml`** (GDS Flight Core API v1.5.0.0):
búsqueda, ofertas y holds, reservas y emisión, postventa (maletas, cambio de fecha, cancelación), check-in, estado de vuelo y webhooks.
El contrato es la fuente de verdad y **no se modifica**; las inconsistencias detectadas están en `../HALLAZGOS.md` y el plan por fases
en `../CAMBIOS.md`.

## Arquitectura en 4 capas

La solución se divide en 4 proyectos (workspaces npm), como una solución .NET con sus `.csproj`. Cada capa solo usa las inferiores:

| Capa | Paquete | Contenido |
|------|---------|-----------|
| `EcoAirlines.API` | `@ecoairlines/api` | Controllers REST, autenticación JWT/OAuth2, seguridad HTTP, ProblemDetails, idempotencia, Swagger, `main.ts` |
| `EcoAirlines.Business` | `@ecoairlines/business` | Services, `BookingsFacade`, DTOs del contrato, reglas de negocio, excepciones |
| `EcoAirlines.DataManagement` | `@ecoairlines/data-management` | Interfaces de repositorios y gateways, repositorios en memoria, gateways al GDS y a la Payment API |
| `EcoAirlines.DataAccess` | `@ecoairlines/data-access` | Entidades, un contexto de datos por base de datos futura, GDS y Payment API simulados, seed de la red |

Dentro de cada capa los archivos se agrupan **por dominio** (search, offers, bookings, post-sale, check-in, flight-status, webhooks),
para que cada dominio pueda separarse después como microservicio con su propia base de datos. La prueba
`test/architecture.spec.ts` impide importar hacia una capa superior o acceder a los datos de otro dominio.

## Puesta en marcha

Desde la raíz del repositorio:

```bash
npm install
npm run start:dev      # compila las 4 capas en modo watch y reinicia la API (puerto 3000)
npm run build && npm start
```

Para la página web completa se levantan tres procesos: esta API, `../dev-auth` (tokens de desarrollo) y `../ecoairlines-web`.
Las instrucciones están en `../ecoairlines-web/README.md`.

## Documentación interactiva (Swagger)

Con la API levantada, abrir **http://localhost:3000/docs**. El documento crudo está en `/docs/openapi.json`.

- Se publica el contrato `../contract/vuelos-openapi.yaml` **tal cual** (se lee en solo lectura; no se regenera desde el código).
- Fuera de producción se aplica un overlay **solo en memoria** para poder usar "Try it out":
  - el servidor local aparece primero en la lista de `servers`;
  - el esquema `DevBearer` permite pegar un JWT de desarrollo en "Authorize", como alternativa al OAuth2 del contrato
    (su authorization server no existe en local). Ver la sección siguiente para generarlo.
- En el selector de la parte superior aparece un segundo documento, **"Extensiones EcoAirlines"** (`/docs/extensions.json`), con los
  endpoints propios. Ver la sección siguiente.
- Fuera de producción aparece un tercero, **"dev-auth: login y registro"** (`/docs/dev-auth.json`, desde `../dev-auth/openapi.yaml`):
  - "Try it out" llama directamente a dev-auth (otro servicio), así se puede registrar un cliente o iniciar sesión (`200` y el token)
    sin salir de Swagger;
  - la API no gana rutas ni lógica de autenticación;
  - el CORS de dev-auth y la CSP de `/docs` admiten esa llamada.

## Extensiones fuera del contrato (V1.D)

Endpoints propios, documentados en `../contract/ecoairlines-extensions.yaml` con los campos de la plantilla del grupo de vuelos.
El contrato no cambia. Al publicarlo, el anexo se combina en memoria con los schemas del contrato que referencia (`PassengerItem`,
`BookingDetail`, `FlightStatus`, `ProblemDetails`).

| Endpoint | Scope | Qué hace |
|----------|-------|----------|
| `GET/PUT /customers/me` | `ecoairlines:profile` | Perfil del cliente (campos de `PassengerItem`); el dueño es el `sub` del JWT |
| `PUT /bookings/{bookingId}/seat` | `flights:book` + reserva propia | Cambio de asiento: ocupa el nuevo en el GDS y libera el anterior |
| `GET /admin/dashboard-stats` | `ecoairlines:admin` | Indicadores, rutas, ocupación de los vuelos de hoy y reservas recientes |
| `PUT /admin/flights/{flightNumber}/status?date=` | `ecoairlines:admin` | Estado operativo; `GET /flights/{n}/status` del contrato lo devuelve |
| `GET /admin/flights/{flightNumber}/passengers?date=` | `ecoairlines:admin` | Pasajeros confirmados del vuelo, con su asiento |
| `GET /admin/flights?date=&origin=&destination=` | `ecoairlines:admin` | Ocupación de los vuelos por fecha (hoy por defecto), aeropuerto de origen o ruta: asientos de clientes (holds + reservas), simulados y libres |
| `GET /admin/fleet-schedule?date=` | `ecoairlines:admin` | Horario de la flota: qué vuelos opera cada avión ese día (hasta 91 días adelante) |
| `GET/POST /admin/routes`, `GET/PUT/DELETE /admin/routes/{routeId}` | `ecoairlines:admin` | **CRUD de rutas programadas** (línea de ida y vuelta con días y tipo de avión). Cada cambio se publica en el GDS al instante; con pasajeros responde `409` |
| `GET /admin/aircraft-types` | `ecoairlines:admin` | Tipos de avión (solo consulta): asientos por cabina, alcance, tiempo en tierra, cuántos hay |
| `GET/POST /admin/aircraft`, `GET/PUT/DELETE /admin/aircraft/{registration}` | `ecoairlines:admin` | **CRUD de la flota**: registrar (tipo y base, matrícula automática), cambiar base y retirar (solo si no opera rutas: `409`) |
| `GET /admin/events` | `ecoairlines:admin` | Últimos eventos de dominio (`booking.*`, `flight.*`) y el resultado de su entrega por webhook (ver `../EVENTOS.md`) |
| `GET /admin/observability` | `ecoairlines:admin` | Métricas HTTP en memoria: peticiones por patrón de ruta y status, latencias (media, p95, máx.), errores recientes con `X-Request-Id`, memoria y tiempo encendida. Nunca guarda headers, bodies, tokens ni query strings |

Sin token responden `401`; con un token sin el scope, `403`. `npm run token` incluye los scopes propios; `dev-auth` los emite según el rol
(administrador de desarrollo: `admin@ecoairlines.test` / `EcoAdmin2026`).

## Autenticación (JWT)

La API verifica JWT de acceso: firma, `exp`, `nbf`, `iss`, `aud` y lista blanca de algoritmos (`alg: none` se rechaza).
El `sub` del token es el `ownerId`; los scopes se leen del claim `scope` (separados por espacios) o `scp`.

- Sin token o token inválido → `401`; token válido sin el scope requerido → `403` (ambos en formato ProblemDetails).
- Holds y webhooks quedan asociados internamente al `sub` que los creó. Si otro usuario consulta o libera un hold, recibe `404`.
  Cada cliente solo lista sus propios webhooks, y si intenta borrar uno ajeno recibe `204` sin que se elimine nada.

**Generar un token de desarrollo** (por defecto incluye todos los scopes del contrato y dura 1 hora):

```bash
npm run token
npm run token -- --sub user-1 --scopes flights:read,flights:book --expires 2h
```

Separar los scopes con comas, sin espacios (en Windows, `npm` altera los valores entre comillas con espacios).
El token se pega en Swagger → Authorize → `DevBearer`, o se envía como `Authorization: Bearer <token>`.

**Para el frontend** los tokens los emite `../dev-auth` (servidor de autenticación de desarrollo, separado de esta API; HALL-03):
`POST http://localhost:4000/login` con clientes `demo@ecoairlines.test` / `EcoDemo2026`, `maria@ecoairlines.test` / `EcoMaria2026` y `luis@ecoairlines.test` / `EcoLuis2026`. Comparte con esta API la configuración por defecto
(`AUTH_JWT_SECRET`, `AUTH_ISSUER`, `AUTH_AUDIENCE`); si se cambian aquí, hay que cambiarlas también allí. Ver `../ecoairlines-web/README.md`.

| Variable | Default (fuera de producción) | Producción |
|----------|-------------------------------|------------|
| `AUTH_JWKS_URL` | — | Proveedor OAuth2 real (https). Si está definida, se verifica con sus claves públicas |
| `AUTH_JWT_ALGORITHMS` | `RS256,ES256` (solo con JWKS) | Igual |
| `AUTH_JWT_SECRET` | Secreto de desarrollo público | Obligatorio si no hay JWKS; ≥ 32 caracteres; no puede ser el de desarrollo |
| `AUTH_ISSUER` | `vuelos-dev-auth` | Obligatorio |
| `AUTH_AUDIENCE` | `vuelos-api` | Obligatorio |
| `AUTH_CLOCK_TOLERANCE_SECONDS` | `5` | Igual |

Con `NODE_ENV=production` la API **no arranca** si la configuración está incompleta, y `npm run token` se niega a emitir tokens.

## Seguridad HTTP

Se aplica en `src/app.setup.ts` (`configureApp`), que comparten `main.ts` y las pruebas e2e.

- **Cabeceras (helmet):** `nosniff`, `X-Frame-Options`, `Referrer-Policy`, etc. La API JSON usa la CSP `default-src 'none'`;
  Swagger UI (`/docs`) recibe una CSP que le permite cargar sus propios recursos. HSTS solo en producción. Sin `X-Powered-By`.
- **CORS:** lista blanca explícita (nunca `*`), sin credenciales. Headers permitidos: `Authorization`, `Content-Type`,
  `Idempotency-Key`, `X-Device-Fingerprint`, `X-Request-Id`. Headers expuestos: `Retry-After`, `X-Request-Id`.
- **Rate limiting:** límite global por IP; `POST /search` y `GET /offers/{offerId}/seatmap` tienen límites más estrictos.
  Al excederlo: `429` ProblemDetails con `code: RATE_LIMIT_EXCEEDED` y `Retry-After`. El almacenamiento es en memoria (por instancia).
- **Body:** máximo `100kb`, solo `application/json`. Body grande, JSON malformado o `Content-Type` incorrecto → `400` ProblemDetails.
- **Saneamiento:** se rechazan las claves `__proto__`, `constructor` y `prototype`, y los caracteres de control. A los strings se les
  recortan los espacios. No se escapa HTML: eso corresponde a quien presenta los datos.
- **`additionalProperties: false`:** `SearchRequest`, `BookingRequest` y `PaymentReference` (también anidado en `payment`) rechazan propiedades extra.
- **Webhooks (SSRF):** en producción la URL debe ser `https` con host público (se resuelve el DNS y se rechazan IPs privadas,
  loopback, link-local/metadata y similares).

| Variable | Default | Efecto |
|----------|---------|--------|
| `CORS_ORIGINS` | `http://localhost:5173` (vacío en producción) | Orígenes permitidos, separados por coma |
| `TRUST_PROXY` | `false` | `true`, número de saltos o lista de IPs/subredes del proxy (necesario detrás de un balanceador) |
| `BODY_LIMIT` | `100kb` | Tamaño máximo del body JSON |
| `RATE_LIMIT_TTL_MS` | `60000` | Ventana de conteo |
| `RATE_LIMIT_LIMIT` | `300` | Peticiones por IP y ventana (global) |
| `RATE_LIMIT_SEARCH_LIMIT` | `30` | Límite de `POST /search` |
| `RATE_LIMIT_SEATMAP_LIMIT` | `60` | Límite de `GET /offers/{offerId}/seatmap` |
| `HTTPS_KEY_PATH` / `HTTPS_CERT_PATH` | — | HTTPS en local (ambas juntas). En producción el TLS termina en el gateway |

## Datos de prueba (GDS simulado)

Los gateways de EcoAirlines.DataManagement comparten un GDS en memoria (`../EcoAirlines.DataAccess/src/external/gds/`): búsqueda, holds, reservas, check-in y estado
de vuelo ven los mismos vuelos, cupos y asientos. Todo se reinicia al reiniciar la API.

- **Aerolínea ficticia:** EcoAirlines (`EA`). Aeropuertos: `UIO`, `GYE`, `CUE`, `BOG`, `MDE`, `LIM`, `SCL`, `MIA`, `MEX`, `MAD`.
- **Horario generado automáticamente** (`../EcoAirlines.DataAccess/src/seed/timetable.ts`):
  - Rutas directas **todos con todos** (90 rutas), con **2 vuelos diarios** por ruta y sentido: uno en la franja de mañana
    (06:00–11:45) y otro en la de tarde/noche (13:00–21:30), en hora local del origen, con horas variadas y sin repetir hora en un
    mismo aeropuerto. Son 180 vuelos por día.
  - Ejemplos: `UIO→BOG` EA104 07:30 y EA105 14:30; `UIO→LIM` EA108 09:00 y EA109 16:00; `UIO→MEX` EA114 11:00.
  - Cada vuelo declara los días de la semana que opera; cada día repite el horario de su día de la semana.
  - Avión según la distancia: A220-300 (< 1 500 km), A320neo (< 4 500 km) o 787-9.
- **Ventana de venta de 91 días (13 semanas):** se puede reservar desde hoy hasta hoy + 90. Cada día que pasa entra un día nuevo
  al final, con el horario de su día de la semana. No se venden vuelos que salen en menos de 60 min.
- **Asientos:** los vuelos empiezan **vacíos**. Solo los que salen en los 7 días siguientes al arranque de la API tienen una ocupación
  simulada moderada (20–49 %), para ver funcionar el mapa de asientos.
- **Horario semanal fijo por avión** (`../EcoAirlines.DataAccess/src/seed/timetable.ts`):
  - Cada avión tiene una base y un horario semanal: el mismo día de la semana hace siempre los mismos vuelos, durante las 13 semanas.
  - Cada vuelo de ida tiene su vuelta con el mismo avión; al cerrar la semana, cada avión está otra vez en su base.
  - Nunca hay un avión en dos lugares a la vez: sale de donde aterrizó, después de su tiempo en tierra (35–90 min según el tipo).
  - Hoy son 149 aviones (26 A220, 56 A320neo y 67 787-9).
  - El administrador lo ve en la página de observabilidad (`GET /admin/fleet-schedule`).
  - **Agregar una ruta a mano:** se da el origen, el destino, el día de la semana, la hora y el avión. `build()` rechaza el horario
    si un avión queda en dos lugares a la vez o no vuelve a su base:

    ```ts
    const builder = new TimetableBuilder();
    const plane = builder.addAircraft('Airbus A220-300', 'UIO'); // HC-J01
    builder
      .addFlight({ flightNumber: 'EA900', origin: 'UIO', destination: 'CUE', weekday: 1, departureLocal: '07:00', registration: plane })
      .addFlight({ flightNumber: 'EA901', origin: 'CUE', destination: 'UIO', weekday: 1, departureLocal: '12:00', registration: plane });
    const timetable = builder.build();
    ```
- También se ofrecen conexiones con una escala de 1 a 10 h, siempre que no den un rodeo mayor a 1,6 veces la distancia directa.
- **Familias tarifarias:** `SEMILLA` (económica, sin cambios ni reembolso), `BROTE` (1 maleta, cambios con cargo de 50 USD),
  `BOSQUE` (2 maletas, cambios gratis, reembolsable) y `DOSEL` (business).
- **Identificadores legibles:** segmento `EA104-20261201`, itinerario = segmentos unidos por `.`, oferta = itinerarios unidos por `~`.
- **Payment API simulada** (`paymentReference`):

  | Referencia | Resultado |
  |------------|-----------|
  | `pay_<3-64 caracteres>` | Pago autorizado → `201` |
  | contiene `async` (p. ej. `pay_async_1`) | Pago en proceso → `202 PENDING_PAYMENT`; se confirma tras `ASYNC_PROCESSING_DELAY_MS` |
  | contiene `declined` | `PAYMENT_NOT_AUTHORIZED` |
  | otro formato, o ya usada en otra operación | `PAYMENT_REFERENCE_INVALID` |

**Flujo típico en Swagger:** `POST /search` → elegir un `offerId` e `itineraryId` → `POST /offers/hold` (cabina y familia tarifaria) →
`POST /bookings` con el `holdId`, los pasajeros (mismos tipos y cantidades que el hold) y `pay_...` → check-in (abre 48 h antes de la salida).

| Variable | Default | Efecto |
|----------|---------|--------|
| `ASYNC_PROCESSING_DELAY_MS` | `3000` | Demora de los procesos asíncronos simulados (pagos `async`) |
| `DEV_AUTH_URL` | `http://localhost:4000` | URL de dev-auth para su documento en Swagger y la CSP de `/docs` (solo fuera de producción) |
| `WEBHOOK_DELIVERY` | `http` (`log` con `NODE_ENV=test`) | `http` entrega los eventos a las URLs suscritas (POST firmado con HMAC); `log` solo los registra |
| `CHECK_IN_WINDOW_HOURS` | `48` | Apertura del check-in antes de la salida (cierra 60 min antes) |

## Errores, trazabilidad y logs

- **Errores:** todas las respuestas de error son `application/problem+json` con el schema `ProblemDetails` del contrato, incluidas las
  rutas inexistentes y los errores del parser JSON. Un error interno responde `500` genérico: el mensaje y el stack solo van al log.
- **`X-Request-Id`:** cada respuesta lo incluye. Si el cliente o el gateway envían un UUID, se respeta; si no, se genera uno.
  Sirve para buscar una petición concreta en los logs.
- **Log de acceso:** una línea JSON por petición, con `requestId`, `method`, `path`, `status`, `durationMs`, `ip` y `sub`.
  **Nunca** se registran headers (`Authorization`), bodies ni query strings.
- **Arranque:** la configuración se valida completa antes de iniciar. Si hay errores, se listan todos juntos y la API no arranca.
  Se atienden SIGTERM/SIGINT para un apagado ordenado.

| Variable | Default | Efecto |
|----------|---------|--------|
| `HTTP_ACCESS_LOG` | `true` (`false` con `NODE_ENV=test`) | Activa el log de acceso |
| `NODE_ENV` | — | `development`, `production` o `test`. Con `production`: Swagger apagado, HSTS, configuración de auth obligatoria |
| `SWAGGER_ENABLED` | `true` fuera de producción, `false` con `NODE_ENV=production` | Publica `/docs` |
| `PORT` | `3000` | Puerto; también define la URL del servidor local en Swagger |

## Pruebas y verificación

Desde la raíz del repositorio:

```bash
npm run typecheck    # tipos de las 4 capas y de las pruebas
npm run lint         # oxlint (las 4 capas, pruebas y scripts)
npm test             # unitarias de las 4 capas + prueba de arquitectura
npm run test:e2e     # e2e contra la app completa (misma configuración que main.ts)
npm run build        # compila la solución en orden: DataAccess → DataManagement → Business → API
```

Las pruebas se ejecutan sobre el código fuente: `vitest.shared.ts` hace que `@ecoairlines/<capa>/...` apunte a `src` en vez de a `dist`.

Qué cubren las e2e (`test/`):

| Archivo | Qué verifica |
|---------|--------------|
| `contract-conformance.e2e-spec.ts` | **Cada respuesta** de las 22 operaciones se valida contra el schema del contrato (status documentado, body, `Content-Type`). Exige cubrir todas las combinaciones operación + status del YAML, salvo las justificadas. Incluye expiraciones (hold `410`, cambio `410`, cotización, cutoff) con reloj adelantado y `429` |
| `swagger.e2e-spec.ts` | `/docs` publica el contrato sin alterarlo; cada ruta del contrato tiene handler y no hay rutas fuera del contrato |
| `booking-flow.e2e-spec.ts` | Búsqueda → seat map → hold → reserva (201/202) → listado → check-in → pases → estado de vuelo, con sus errores |
| `post-sale.e2e-spec.ts` | Maletas, cambio de fecha y cancelación |
| `auth.e2e-spec.ts` | JWT (firma, scopes, token mock antiguo) y propiedad de holds y webhooks |
| `security.e2e-spec.ts` | Cabeceras, CORS, `429`, límites de body, saneamiento, `additionalProperties: false` |
| `observability.e2e-spec.ts` | `X-Request-Id` y `404` en formato ProblemDetails |
| `audit-fixes.e2e-spec.ts` | Regresión de los hallazgos de la auditoría (AUD-002…013) |
| `admin-routes.e2e-spec.ts` | CRUD de rutas programadas: la búsqueda, la flota y el estado de vuelo ven el horario nuevo; validaciones y bloqueo con pasajeros |
| `admin-fleet.e2e-spec.ts` | CRUD de la flota y rutas con aviones elegidos: tipo, base, alcance, superposición, aviones insuficientes y bloqueo de aviones en servicio |
| `events.e2e-spec.ts` | Eventos y webhooks: firma HMAC, entrega solo al dueño, `flight.*` a todos, reintentos y `/admin/events` |
