# API de vuelos — EcoAirlines (Reto 1)

Backend REST en NestJS que implementa el contrato **`contract/vuelos-openapi.yaml`** (GDS Flight Core API v1.5.0.0):
búsqueda, ofertas y holds, reservas y emisión, postventa (maletas, cambio de fecha, cancelación), check-in, estado de vuelo y webhooks.
El contrato es la fuente de verdad y **no se modifica**; las inconsistencias detectadas están en `../HALLAZGOS.md` y el plan por fases
en `../CAMBIOS.md`.

Monolito modular (`src/modules/*`) preparado para separarse en microservicios: cada dominio depende de sus *ports* y la infraestructura
externa (GDS, Payment API, authorization server) está simulada con adaptadores reemplazables.

## Puesta en marcha

```bash
npm install
npm run start:dev      # desarrollo con recarga (puerto 3000)
npm run build && npm run start:prod
```

Para la página web completa se levantan tres procesos: esta API, `../dev-auth` (tokens de desarrollo) y `../frontend`.
Las instrucciones están en `../frontend/README.md`.

## Documentación interactiva (Swagger)

Con la API levantada, abrir **http://localhost:3000/docs**. El documento crudo está en `/docs/openapi.json`.

- Se publica el contrato `contract/vuelos-openapi.yaml` **tal cual** (se lee en solo lectura; no se regenera desde el código).
- Fuera de producción se aplica un overlay **solo en memoria** para poder usar "Try it out":
  - el servidor local aparece primero en la lista de `servers`;
  - el esquema `DevBearer` permite pegar un JWT de desarrollo en "Authorize", como alternativa al OAuth2 del contrato
    (su authorization server no existe en local). Ver la sección siguiente para generarlo.

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
`POST http://localhost:4000/login` con `demo@ecoairlines.test` / `EcoDemo2026`. Comparte con esta API la configuración por defecto
(`AUTH_JWT_SECRET`, `AUTH_ISSUER`, `AUTH_AUDIENCE`); si se cambian aquí, hay que cambiarlas también allí. Ver `../frontend/README.md`.

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

Los adaptadores mock comparten un GDS en memoria (`src/infrastructure/mock-gds/`): búsqueda, holds, reservas, check-in y estado
de vuelo ven los mismos vuelos, cupos y asientos. Todo se reinicia al reiniciar la API.

- **Aerolínea ficticia:** EcoAirlines (`EA`). Aeropuertos: `UIO`, `GYE`, `CUE`, `BOG`, `MDE`, `LIM`, `SCL`, `MIA`, `MEX`, `MAD`.
- **Vuelos diarios** (ver `network.ts`); por ejemplo `UIO→BOG` (EA300 07:00, EA302 15:30), `UIO→MAD` (EA502), `BOG→MIA` (EA400).
  Si no hay vuelo directo, se arman conexiones con una escala de 1 a 10 h, siempre que no den un rodeo mayor a 1,6 veces
  la distancia directa. No se venden vuelos que salen en menos de 60 min.
- **Familias tarifarias:** `SEMILLA` (económica, sin cambios ni reembolso), `BROTE` (1 maleta, cambios con cargo de 50 USD),
  `BOSQUE` (2 maletas, cambios gratis, reembolsable) y `DOSEL` (business).
- **Identificadores legibles:** segmento `EA300-20261201`, itinerario = segmentos unidos por `.`, oferta = itinerarios unidos por `~`.
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

```bash
npx tsc --noEmit     # tipos (incluye las pruebas)
npm run lint         # oxlint (src, test, scripts)
npm test             # unitarias
npm run test:e2e     # e2e contra la app completa (misma configuración que main.ts)
npm run build
```

Qué cubren las e2e (`test/`):

| Archivo | Qué verifica |
|---------|--------------|
| `contract-conformance.e2e-spec.ts` | **Cada respuesta** de las 25 operaciones se valida contra el schema del contrato (status documentado, body, `Content-Type`). Exige cubrir todas las combinaciones operación + status del YAML, salvo las justificadas. Incluye expiraciones (hold `410`, cambio `410`, cotización, cutoff) con reloj adelantado y `429` |
| `swagger.e2e-spec.ts` | `/docs` publica el contrato sin alterarlo; cada ruta del contrato tiene handler y no hay rutas fuera del contrato |
| `booking-flow.e2e-spec.ts` | Búsqueda → seat map → hold → reserva (201/202) → listado → check-in → pases → estado de vuelo, con sus errores |
| `post-sale.e2e-spec.ts` | Maletas, cambio de fecha y cancelación |
| `auth.e2e-spec.ts` | JWT (firma, scopes, token mock antiguo) y propiedad de holds y webhooks |
| `security.e2e-spec.ts` | Cabeceras, CORS, `429`, límites de body, saneamiento, `additionalProperties: false` |
| `observability.e2e-spec.ts` | `X-Request-Id` y `404` en formato ProblemDetails |
| `audit-fixes.e2e-spec.ts` | Regresión de los hallazgos de la auditoría (AUD-002…013) |
