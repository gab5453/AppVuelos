# CAMBIOS PROPUESTOS — Reto 1 (Vuelos)

> **Estado: PENDIENTE DE APROBACIÓN.** No se ha modificado ningún archivo de código.
> Marca cada bloque con ✅ (aprobado), ❌ (rechazado) o ✏️ (aprobar con cambios) antes de que empiece.
> Todo lo que no aparezca aquí **no se hará**. Si durante el desarrollo surge algo nuevo, se agregará primero
> a este archivo o a `HALLAZGOS.md` y se te consultará.

**Restricción global:** `vuelos/contract/vuelos-openapi.yaml` **no se modifica**. Todo cambio se adapta al contrato.
Los puntos que dependen de una decisión del líder de booking están marcados con 🔶 y referencian `HALLAZGOS.md`.

---

## Resumen de fases

| Fase | Bloque | Qué se entrega |
|------|--------|----------------|
| 1 | Swagger / documentación interactiva | `/docs` con el contrato real, listo para pruebas |
| 2 | Seguridad: JWT | Reemplazo del token mock por JWT firmado y validado (cierra AUD-001) |
| 3 | Seguridad: HTTP, CORS, rate limit, sanitización | Cabeceras de seguridad, CORS por lista blanca, 429 contractual, saneamiento de entradas |
| 4 | Excepciones y trazabilidad | Errores homogéneos en ProblemDetails, sin fugas de información, `X-Request-Id` |
| 5 | Depuración de lógica de negocio | Mocks con datos realistas y flujo coherente search → hold → booking → check-in |
| 6 | Frontend "eco" | Sitio web verde/blanco con hoja como logo, consumiendo la API |
| 7 | Pruebas y verificación | Unitarias + e2e de todo lo anterior; build, lint, tests |

---

## Fase 1 — Swagger (documentación interactiva para pruebas) — ✅ IMPLEMENTADA (2026-10-02)

> **Resultado:** `src/docs/swagger.setup.ts` (nuevo), `src/main.ts` (modificado), `README.md` (sección Swagger),
> `src/docs/swagger.setup.spec.ts` y `test/swagger.e2e-spec.ts` (nuevos). Dependencias: `swagger-ui-express`, `js-yaml` (+ `@types`).
> Verificado: build ✅, lint ✅, unitarias 26/26 ✅, e2e 20/20 ✅, y servidor real con `/docs` y `/docs/openapi.json` respondiendo.
> Conformidad: las 25 operaciones del contrato tienen handler y no hay rutas fuera del contrato.
> Desviación respecto al plan: ninguna. El prefijo `/flights/v1` (HALL-01) **no** se tocó.

**Enfoque recomendado: servir el contrato tal cual, no regenerarlo desde decoradores.**

Motivo: si se genera Swagger con `@nestjs/swagger` a partir del código, el documento resultante sería *una copia
reinterpretada* del contrato y podría divergir de él. Sirviendo el YAML original garantizamos que lo que se prueba es
exactamente el contrato.

1.1. Instalar `swagger-ui-express` y `js-yaml` (dependencias).
1.2. Crear `src/docs/swagger.setup.ts` que:
   - Lee `contract/vuelos-openapi.yaml` **en solo lectura** al arrancar.
   - Sirve Swagger UI en `GET /docs` y el JSON en `GET /docs/openapi.json`.
   - **Solo en memoria y solo en desarrollo** aplica un *overlay* mínimo para que "Try it out" funcione en local:
     - Antepone `http://localhost:3000` a la lista de `servers` (los servidores del contrato se mantienen).
     - Agrega un esquema extra `DevBearer` (HTTP bearer) para pegar el JWT de desarrollo, ya que el flujo OAuth2 del
       contrato apunta a `auth.booking-hub.com`, que no existe para nosotros.
   - El archivo en disco **nunca** se escribe. El overlay se desactiva con `NODE_ENV=production`.
1.3. Variable `SWAGGER_ENABLED` (por defecto `true` en desarrollo, `false` en producción).
1.4. Prueba e2e: `/docs/openapi.json` devuelve los mismos `paths` y `components.schemas` que el YAML original.
1.5. Prueba de conformidad: cada `path + método` del contrato tiene un handler registrado en Nest (detecta rutas faltantes o sobrantes).

🔶 Ver **HALL-01** (prefijo `/flights/v1` de los `servers`).

---

## Fase 2 — Seguridad: JWT (cierra AUD-001) — ✅ IMPLEMENTADA (2026-10-02)

> **Resultado:**
> - Nuevos: `src/common/auth/auth.config.ts`, `src/common/auth/infrastructure/jwt-token-verifier.ts`,
>   `src/common/auth/infrastructure/dev-token-issuer.ts`, `scripts/generate-token.mjs`, `test/helpers/auth.ts`.
> - Pruebas nuevas: `auth.config.spec.ts`, `jwt-token-verifier.spec.ts`, `test/auth.e2e-spec.ts`.
> - Modificados: `auth.module.ts`, `hold.controller.ts`, `hold.service.ts`, `hold-repository.port.ts`, el controller, servicio,
>   puerto y repositorio de webhooks, `test/audit-fixes.e2e-spec.ts` (ahora usa JWT firmados), `swagger.setup.ts` (texto de `DevBearer`),
>   `package.json` (`npm run token`; el lint ahora también revisa `scripts/`) y `README.md`.
> - Dependencia nueva: `jose`.
> - Verificado: build ✅, lint ✅, unitarias 46/46 ✅, e2e 28/28 ✅. Con el servidor real: JWT válido → 200, token mock antiguo → 401,
>   sin token → 401, sin scope → 403. Con `NODE_ENV=production` y sin configuración, la API no arranca (`AuthConfigError`).
>
> **Decisiones tomadas durante la implementación (revísalas):**
> - **2.3:** `MockTokenVerifier` ya no se registra en ningún módulo, así que no se puede usar ni en producción ni en desarrollo.
>   Por eso no hizo falta el bloqueo de arranque que planeé para él. El archivo y su prueba se conservan; si prefieres, se borran.
> - **2.4:** el script está en `.mjs` e importa del código compilado (`dist`), para usar exactamente la misma configuración que la API.
>   Por eso `npm run token` compila antes (tarda unos segundos). Los scopes se pasan separados por comas y se validan contra el contrato.
> - **2.6:** borrar un webhook ajeno o inexistente responde `204` sin efecto, porque el contrato solo documenta `204`. No se usó `404`.
> - **HALL-03** sigue pendiente: por ahora se usa la opción (c), `npm run token`.

2.1. Instalar `jose` (librería estándar para JWT/JWKS, sin dependencias nativas).
2.2. Crear `src/common/auth/infrastructure/jwt-token-verifier.ts` que implementa el `TokenVerifierPort` existente:
   - Valida **firma**, `exp`, `nbf`, `iss` y `aud`.
   - Algoritmos permitidos explícitamente (evita el ataque `alg: none`).
   - Modo **JWKS** (`AUTH_JWKS_URL`, RS256) para un proveedor real, o modo **secreto compartido** (`AUTH_JWT_SECRET`, HS256) para desarrollo.
   - Extrae `sub` → `ownerId` y los scopes desde el claim `scope` (separado por espacios, estándar OAuth2) o `scp`.
2.3. `auth.module.ts` elige el verificador según configuración. `MockTokenVerifier` queda **solo para tests** y
   el arranque falla si se intenta usar en `NODE_ENV=production`.
2.4. Script `npm run token -- --sub user-1 --scopes "flights:read flights:book"` para generar JWT de desarrollo
   firmados (para Swagger y Postman). No agrega endpoints a la API.
2.5. Ownership de **holds**: guardar internamente el `sub` del creador del hold (no se expone en la respuesta) y
   responder `404` si otro usuario consulta/libera ese hold. Hoy cualquier usuario puede ver o liberar holds ajenos.
2.6. Ownership de **webhooks**: cada suscripción se asocia internamente al `sub`/client; `GET /webhooks` solo lista las
   propias y `DELETE` solo elimina las propias. Hoy cualquiera con el scope ve todos los `secret`.
2.7. Actualizar los tests e2e para usar JWT firmados en vez de `sub:scopes`.

🔶 Ver **HALL-02** (401 no documentado), **HALL-03** (endpoint de login para el frontend), **HALL-09** (`secret` expuesto en respuestas).

---

## Fase 3 — Seguridad HTTP, CORS, rate limit y sanitización — ✅ IMPLEMENTADA (2026-10-02)

> **Resultado:**
> - Nuevos en `src/common/security/`: `security.config.ts`, `http-security.ts`, `sanitize-input.pipe.ts`,
>   `problem-details-throttler.guard.ts`, `rate-limit.decorators.ts` y `security.module.ts`.
> - Otros nuevos: `src/app.setup.ts` (`configureApp`), `src/modules/webhooks/domain/webhook-url-policy.ts` y `test/helpers/app.ts`.
> - Pruebas nuevas: `security.config.spec.ts`, `sanitize-input.pipe.spec.ts`, `webhook-url-policy.spec.ts` y `test/security.e2e-spec.ts`.
> - Modificados: `main.ts`, `common.module.ts`, `forbid-unknown-properties.guard.ts`, los controllers de search, seatmap, bookings,
>   baggage y date-change, el servicio y módulo de webhooks, los 4 archivos e2e existentes (ahora usan `createTestApp`) y `README.md`.
> - Dependencias nuevas: `helmet` y `@nestjs/throttler`. Las dependencias de producción siguen con 0 vulnerabilidades.
> - Verificado: build ✅, lint ✅, unitarias 78/78 ✅, e2e 43/43 ✅.
>   - Servidor real en desarrollo: cabeceras correctas, Swagger UI carga con su CSP, CORS acepta `localhost:5173` y rechaza otros orígenes,
>     y la 4.ª búsqueda con límite 3 → `429` + `Retry-After: 60`.
>   - En producción: HSTS activo, `/docs` apagado, CORS cerrado y los webhooks a localhost, `169.254.169.254` o `10.x` → `400`.
>
> **Desviaciones respecto al plan (revísalas):**
> - **3.8:** el límite de `/search` se cuenta **solo por IP**, no por IP + `X-Device-Fingerprint` como propuse. El fingerprint lo
>   controla el cliente: cambiándolo en cada petición, un atacante tendría un contador nuevo cada vez y evadiría el límite.
> - **3.11:** **no** se activó `forbidNonWhitelisted` global, porque rechazaría propiedades extra en schemas donde el contrato
>   sí las permite (HoldRequest, AddBaggageRequest, etc.). En su lugar se extendió el guard existente. Al hacerlo encontré un
>   **bug**: `PaymentReference` (`additionalProperties: false`) aceptaba en silencio campos extra dentro de `payment`
>   (p. ej. `cardNumber`) en bookings, baggage y date-change. Ahora se rechazan con `400`.
> - **3.9 / 4.1:** el `400` ProblemDetails para JSON malformado (planeado en la Fase 4) se adelantó. Ocurre en la misma capa
>   que el límite de tamaño, antes de llegar a Nest, y se resolvió con el mismo manejador.
> - **No estaba en el plan:** se creó `configureApp` y se migraron los e2e existentes a él, para que las pruebas ejerciten
>   exactamente la misma cadena de seguridad que la app real (antes cada test armaba la suya a mano).
> - **3.12:** además de lo planeado, se rechazan URLs con credenciales (`https://user:pass@...`). Cuando exista el despachador
>   real de webhooks, deberá repetir la comprobación al enviar (protección ante DNS rebinding).
> - Los códigos `413`/`415` y el `429` en endpoints que no lo documentan están descritos en **HALL-15** y **HALL-16**.

**Cabeceras HTTP**
3.1. Instalar `helmet`: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, CSP, etc.
   HSTS solo en producción. CSP relajada únicamente en la ruta `/docs` (Swagger UI la necesita).
3.2. Desactivar `X-Powered-By`, habilitar `trust proxy` configurable (`TRUST_PROXY`) para que el rate limit vea la IP real detrás de un balanceador.
3.3. HTTPS opcional en local mediante `HTTPS_KEY_PATH` / `HTTPS_CERT_PATH`; en producción se asume TLS en el gateway.

**CORS**
3.4. CORS con **lista blanca** desde `CORS_ORIGINS` (por defecto `http://localhost:5173`, el frontend). Nada de `*`.
3.5. Headers permitidos: `Authorization`, `Content-Type`, `Idempotency-Key`, `X-Device-Fingerprint`, `X-Request-Id`.
   Headers expuestos al navegador: `Retry-After`, `X-Request-Id`.

**Rate limiting (429 contractual)**
3.6. Instalar `@nestjs/throttler`. Límite global configurable y uno más estricto en `POST /search` y `GET /offers/{offerId}/seatmap`
   (los dos endpoints que el contrato documenta con `429`).
3.7. Al exceder: `ProblemDetails` con `status: 429`, `code: RATE_LIMIT_EXCEEDED` y header `Retry-After` (todo definido en el contrato).
3.8. Clave del límite en `/search`: IP + `X-Device-Fingerprint` (aprovecha el header obligatorio del contrato).

**Sanitización y validación de entrada**
3.9. Límite de tamaño del body JSON (`100kb`) y rechazo de `Content-Type` distinto de `application/json` en endpoints con body.
3.10. Pipe global de sanitización **no destructiva**:
   - Rechaza (400 `VALIDATION_FAILED`) claves peligrosas `__proto__`, `constructor`, `prototype` (prototype pollution).
   - Rechaza caracteres de control / bytes nulos en strings.
   - Recorta espacios al inicio y final de strings.
   - **No** reescribe ni "escapa" HTML en los datos guardados: el escape se hace al mostrar (frontend), que es la práctica correcta.
3.11. `forbidNonWhitelisted` global (hoy solo search y bookings rechazan propiedades extra) para los schemas con `additionalProperties: false`.
3.12. Validación de la URL de webhooks contra SSRF (solo `https`, sin IPs privadas/localhost) **únicamente en producción**.

🔶 Ver **HALL-04** (strings sin `maxLength`/`format`), **HALL-08** (SSRF en webhooks).

---

## Fase 4 — Manejo de excepciones y trazabilidad — ✅ IMPLEMENTADA (2026-10-02)

> **Resultado:**
> - Nuevos: `src/common/observability/request-context.ts` (X-Request-Id), `src/common/observability/access-log.middleware.ts`
>   y `src/config/validate-environment.ts`.
> - Pruebas nuevas: `problem-details.filter.spec.ts`, `observability.spec.ts`, `validate-environment.spec.ts` y `test/observability.e2e-spec.ts`.
> - Modificados: `problem-details.filter.ts` (reescrito), `problem-details.exception.ts` (constructor `notFound`), `app.setup.ts`, `main.ts`
>   y `http-security.ts`; también las 5 excepciones `NotFoundException` nativas (booking-ownership guard, holds, tickets, seatmap,
>   flight-status) y `booking-ownership.guard.spec.ts`.
> - Verificado: build ✅, lint ✅, unitarias 94/94 ✅, e2e 49/49 ✅. Con el servidor real: `X-Request-Id` en todas las respuestas,
>   el log de acceso en JSON sin token ni PNR de la query, la ruta inexistente → `404` ProblemDetails, y con configuración
>   inválida la API lista los 3 errores y sale con código 1.
>
> **Desviaciones y notas (revísalas):**
> - **4.1:** el estado de vuelo inexistente usa `code: FLIGHT_STATUS_NOT_AVAILABLE`, que es un valor del contrato. Los demás 404
>   siguen con `VALIDATION_FAILED` porque el enum no tiene otro valor aplicable (HALL-05).
> - **4.1, no planeado:** los errores de los middlewares de Express previos a Nest caían en el manejador por defecto de Express.
>   Ese manejador responde en HTML y, fuera de producción, incluye el stack. Ahora todos salen como ProblemDetails.
> - **4.2:** el `requestId` va solo en el header `X-Request-Id`, no en el body. ProblemDetails tiene `additionalProperties: false`
>   en el contrato. Si el cliente envía un `X-Request-Id` que no es UUID, se reemplaza (evita inyección de líneas falsas en los logs).
> - **4.3:** el log incluye la `ip` y el `sub` del token (son identificadores, no credenciales). Si se consideran datos personales
>   que no deben registrarse, se quitan con un cambio de una línea.
> - **4.4:** `enableShutdownHooks` está activo, pero el apagado ordenado por señal **no se probó en Windows**, donde detener el
>   proceso desde la terminal no envía SIGTERM. Conviene verificarlo en el entorno de despliegue (Linux/contenedor).
> - El header `X-Request-Id` no está en el contrato: es un header adicional que no rompe nada (ver **HALL-17**).

4.1. Revisar el `ProblemDetailsFilter`:
   - Las `NotFoundException` nativas que hoy se lanzan en servicios (holds, tickets) pasan a `ProblemDetailsException` explícitas.
   - Errores 500 nunca devuelven stack ni mensaje interno; solo se registran en el log.
   - Errores de JSON malformado y de body demasiado grande → `400` en formato ProblemDetails.
   - Rutas inexistentes → `404` en formato ProblemDetails.
4.2. Interceptor/middleware `X-Request-Id`: se genera (o se respeta si viene del cliente y es UUID) y se incluye en logs y respuesta.
4.3. Logs estructurados por petición (método, ruta, status, duración, requestId) **sin** registrar `Authorization`, `secret`, documentos ni `paymentReference`.
4.4. Apagado ordenado (`enableShutdownHooks`) y validación de variables de entorno al arrancar (falla rápido si falta configuración obligatoria).

🔶 Ver **HALL-05** (el enum `code` no tiene valores para 401/403/404/500).

---

## Revisión general previa a la Fase 5 (2026-10-03)

Se revisó todo `src/` contra `contract/vuelos-openapi.yaml` y contra lo implementado en las fases 1–4.
Las fases 1–4 cumplen lo planeado; no se encontraron regresiones. Hallazgos nuevos:

| ID | Tipo | Hallazgo | Archivo | Acción |
|----|------|----------|---------|--------|
| REV-01 | Contrato | Las fechas `format: date` se validan solo con regex: `2026-02-31` y `2026-13-45` se aceptan | DTOs de search, bookings, list, date-change, flight-status | Validar fechas de calendario reales (en esta fase) |
| REV-02 | Contrato | Validaciones **más estrictas que el contrato**: `minItems: 1` en `HoldRequest.itinerarySelections`, `BookingRequest.passengers`, `DateChangeSearchRequest.changes` y `WebhookSubscription.events`, y `minimum: 1` en `PassengerItem.extraBaggage[].quantity`. El contrato no los declara | DTOs de offers, bookings, post-sale y webhooks | Quitar del DTO; las reglas de negocio responden `422` donde el contrato lo documenta (en esta fase) |
| REV-03 | Contrato | `segmentId` es `required` en `GET /offers/{offerId}/seatmap`, pero no se valida (llega `undefined` al servicio) | `seatmap.controller.ts` | DTO de query obligatorio (en esta fase) |
| REV-04 | Contrato | `POST /bookings/{id}/date-change` responde `200` con `status: CHANGE_PENDING`; el contrato reserva `CHANGE_PENDING` para el `202`. Además devuelve la reserva sin itinerarios ni pasajeros | `date-change.service.ts` | Implementar el cambio real (en esta fase) |
| REV-05 | Contrato | `PassengerBreakdown` tiene defaults (`adults: 1`, resto `0`) que no se aplican | search / hold | Aplicar los defaults en la lógica (en esta fase) |
| REV-06 | Funcional | Equipaje, cambio de fecha y cancelación son *placeholders* (AUD-008 seguía abierto): cotización siempre `0.00`, `quoteId` no se valida, la maleta no se guarda | `post-sale/*` | Implementar (agregado a esta fase; ver 5.10–5.12) |
| REV-07 | Seguridad | La clave de idempotencia no incluye al usuario: dos usuarios con la misma `Idempotency-Key` en la misma ruta colisionan (`409`). Además las claves nunca expiran (memoria sin límite) | `idempotency.interceptor.ts`, `in-memory-idempotency-store.ts` | Clave por usuario y expiración de 24 h (en esta fase) |
| REV-08 | Plan | CAMBIOS 5.4 decía "hold inexistente → 404", pero **`POST /bookings` no documenta `404`** | — | Corregido: se usa `422` (ver HALL-19) |
| REV-09 | Calidad | `GET /bookings?limit=-5` se acepta (el contrato no define `minimum`) | `list-bookings-query.dto.ts` | `limit` ≥ 1 (ver HALL-14) |
| REV-10 | Calidad | Código muerto: `common/persistence/repository.port.ts` no se usa; `MockTokenVerifier` no se registra (Fase 2) | — | Se informa; no se borra sin tu aprobación |

---

## Fase 5 — Depuración de la lógica de negocio (dentro del contrato) — ✅ IMPLEMENTADA (2026-10-03)

> **Resultado:**
> - **GDS simulado compartido** (`src/infrastructure/mock-gds/`): 10 aeropuertos, 36 vuelos diarios, 3 aviones con mapa de asientos,
>   4 familias tarifarias (SEMILLA/BROTE/BOSQUE/DOSEL), inventario de cupos, asientos y estado operativo. Los dominios no lo conocen:
>   cada uno usa sus ports (`FlightCatalogPort`, `OfferInventoryPort`, `HoldGatewayPort`, `PaymentVerifierPort`, `ReservationSystemPort`).
> - **5.1–5.8** según lo planeado: ofertas reales (directos y con escala, ida y vuelta, multidestino), seat map, holds con precio congelado,
>   cupos y expiración automática (cada 30 s y al consultar), reservas con tickets, listado con filtros y cursor, check-in con
>   asignación de asiento y pases con QR, y estado de vuelo coherente con el itinerario.
> - **5.10–5.12 (agregados tras la revisión, REV-06; cierra AUD-008):** equipaje, cambio de fecha y cancelación con lógica real.
> - **Revisión REV-01…REV-09:** todas aplicadas (fechas de calendario, restricciones más estrictas que el contrato, `segmentId` obligatorio,
>   cambio de fecha, defaults de pasajeros, idempotencia por usuario con expiración de 24 h, `limit ≥ 1`).
> - Pruebas nuevas: `mock-gds.service.spec.ts`, `hold.service.spec.ts`, `passenger-rules.spec.ts`, `test/booking-flow.e2e-spec.ts`,
>   `test/post-sale.e2e-spec.ts` y `test/helpers/flow.ts`. Los e2e existentes ahora reservan con holds reales.
> - Verificado: tipos ✅, build ✅, lint ✅, unitarias 126/126 ✅, e2e 74/74 ✅ (incluye conformidad de rutas con el contrato). Con el servidor
>   real: búsqueda UIO→BOG (4 ofertas) → hold BROTE 160.35 USD → reserva `201 CONFIRMED` con PNR y e-ticket → check-in con asiento 4A →
>   pase de abordar con QR → estado de vuelo `SCHEDULED`.
>
> **Desviaciones y decisiones (revísalas):**
> - **5.4:** hold inexistente o ajeno → `422`, no `404` como decía el plan, porque `POST /bookings` no documenta `404` (HALL-19).
> - **5.5:** se usó `PENDING_PAYMENT` (no `TICKET_ISSUING`) para el `202`: lo que queda pendiente es el pago. Los tickets pasan a `ISSUED` al confirmarse.
> - **5.3:** las selecciones inválidas (itinerario o tarifa inexistente) responden `422`, no `409`: no es que la oferta "ya no esté disponible",
>   es que la petición no corresponde a la oferta. `409 OFFER_NO_LONGER_AVAILABLE` queda para oferta vencida o sin cupo.
> - **5.7:** el check-in es del próximo itinerario que aún no sale; asigna asiento automáticamente a quien no eligió uno.
>   Los infantes reciben pase con asiento `INF`. Cierra 60 min antes de la salida (`422 CUTOFF_PASSED`).
> - **No planeado:** la Payment API simulada no permite usar una referencia de pago dos veces (HALL-24). Por eso las pruebas generan referencias únicas.
> - **No planeado:** los procesos asíncronos simulados (pago `async` → `202`) usan `DeferredTaskRunner` con una demora configurable.
> - Nuevos hallazgos del contrato: **HALL-18 a HALL-24**.
> - ~~Pendiente de tu decisión (REV-10)~~: código muerto **borrado** con tu aprobación (ver Fase 6).
> - Los eventos de webhooks (`booking.confirmed`, etc.) **no se emiten** todavía: el despachador sigue siendo *noop*. No estaba en el plan.

Los adaptadores actuales devuelven respuestas vacías o con `0.00`. Para que Swagger y el frontend muestren un flujo real:

5.1. **Catálogo mock**: rutas de ejemplo (p. ej. UIO, GYE, BOG, LIM, MIA, MAD) con ofertas, itinerarios, segmentos,
   tarifas por cabina y equipaje, respetando exactamente `SearchResponse` / `FlightOffer`. Generadas de forma determinista por fecha.
5.2. **Seat map mock**: cabinas, filas y asientos con `WINDOW`/`AISLE`/`EXTRA_LEGROOM`/`EMERGENCY_EXIT`; `404` si la oferta o segmento no existe.
5.3. **Hold**: valida que `offerId`/`itineraryId`/`cabinClass`/`fareBrand` existan (si no → `409 OFFER_NO_LONGER_AVAILABLE`)
   y que los infantes no superen a los adultos (`422 INFANT_SEAT_NOT_ALLOWED`); `lockedPrice` se calcula a partir de la oferta.
   Expiración real: al vencer el TTL, el estado pasa a `EXPIRED`.
5.4. **Booking**: valida el hold (inexistente/ajeno → 404 vía regla de ownership, expirado → `410`, ya consumido → `409`),
   lo marca `CONSUMED`, copia `grandTotal = lockedPrice` e itinerarios, valida que el número y tipo de pasajeros coincida con el hold (`422`),
   que `associatedAdultId` exista para infantes (`422`), y genera tickets mock.
5.5. **Código de respuesta de `POST /bookings`**: hoy devuelve `201` con `status: PENDING`, lo que contradice la descripción del `201`
   ("ticket emitido correctamente"). Propuesta: `201` + `CONFIRMED` con tickets `ISSUED` en el mock síncrono; `202` + `TICKET_ISSUING` si se simula emisión asíncrona.
5.6. **Listado de reservas**: aplicar los filtros `pnr`, `status`, `createdFrom`, `createdTo`, `limit` (máx. 50, default 10) y paginación por `cursor`, que hoy se ignoran.
5.7. **Check-in y boarding passes**: devolver pasajeros/segmentos reales de la reserva; `409 BOOKING_NOT_CONFIRMED` si no está confirmada,
   `422 CHECK_IN_NOT_AVAILABLE` fuera de ventana; boarding passes solo tras check-in (si no → `404`/`BOARDING_PASS_NOT_AVAILABLE`).
5.8. **Flight status mock**: datos coherentes con el catálogo; `404 FLIGHT_STATUS_NOT_AVAILABLE` si el vuelo no existe.
5.9. Mantener todos los adaptadores detrás de sus *ports* actuales (sin cambiar controllers ni contrato HTTP), según `CLAUDE.md`.
5.10. **Equipaje** (agregado tras la revisión): opciones por pasajero e itinerario, compra con pago, límite de 3 extra (`409 BAGGAGE_LIMIT_EXCEEDED`).
5.11. **Cambio de fecha** (agregado tras la revisión): alternativas en la misma tarifa, diferencia de precio + cargo, `FARE_NOT_CHANGEABLE`,
   `CHANGE_OFFER_EXPIRED` (`410`), reemisión de cupones.
5.12. **Cancelación** (agregado tras la revisión): cotización según la tarifa (reembolsable o solo impuestos) con vencimiento, validación
   del `quoteId` y liberación de cupos y asientos.

🔶 Ver **HALL-06** (201 vs PENDING), **HALL-07** (`cabinClass` libre en HoldRequest).

---

## Fase 6 — Frontend "eco" (nueva carpeta `Reto 1/frontend`) — ✅ IMPLEMENTADA (2026-10-03)

> **Decisiones tuyas aplicadas antes de empezar:**
> - **REV-10:** borrado el código muerto (`common/persistence/repository.port.ts`, `MockTokenVerifier` y su prueba).
> - **HALL-10:** marca **EcoAirlines**. El código ficticio de aerolínea pasó de `HV` a `EA` (vuelos `EA300`…), para no arrastrar "Hoja Verde".
> - **HALL-03:** opción (a): `Reto 1/dev-auth/`, un servidor de autenticación de desarrollo **separado** de la API (sin dependencias).
>   Registro y login con contraseña derivada con scrypt, límite de intentos y JWT con la misma configuración que verifica la API.
>   La API de vuelos no ganó rutas.
>
> **Resultado:**
> - `Reto 1/frontend/` (React 19 + TypeScript + Vite + react-router + qrcode): páginas 6.5–6.12, además de `/ingresar` (login/registro)
>   y `/compromiso-verde`. Las dependencias de producción tienen 0 vulnerabilidades.
> - Tipos del frontend = schemas del contrato (`src/api/types.ts`). Hay una función por operación (`src/api/endpoints.ts`) y un cliente
>   único que maneja ProblemDetails, `Retry-After` y `X-Request-Id`.
> - Seguridad 6.13–6.16 cumplida: token solo en memoria, sin `dangerouslySetInnerHTML`, `Idempotency-Key` por intento (se reutiliza
>   en reintentos), `X-Device-Fingerprint`, mensajes por `code`, cuenta regresiva para 409/429 y sin *open redirect* tras el login.
> - Accesibilidad y responsive (6.17): enlace "saltar al contenido", foco visible, roles ARIA en pestañas y alertas, sin desbordamiento
>   horizontal en móvil (390 px), y modo claro y oscuro.
> - Verificado: `tsc` ✅, lint ✅ (0 advertencias), build ✅. **En navegador real** (Chrome sin interfaz, con API + dev-auth + Vite):
>   inicio → búsqueda UIO→BOG → login demo → tarifa BROTE → hold → checkout con asiento 5C → reserva `201` → check-in → pase con QR →
>   mis viajes → estado de vuelo. También se vio el error contractual de un vuelo inexistente. Sin errores de JS ni respuestas 5xx; los
>   únicos 404 fueron los esperados (pases antes del check-in y el vuelo `EA999` de prueba).
>
> **Desviaciones y notas (revísalas):**
> - **Corrección de la Fase 5**, detectada en las capturas: el GDS ofrecía Quito→**Madrid**→Bogotá (23 h). Se agregó un tope de rodeo
>   (≤ 1,6 veces la distancia directa) con su prueba unitaria. Quito→Bogotá ahora solo ofrece los dos vuelos directos.
> - **6.4:** el CO₂ es una estimación del navegador (distancia × factor por cabina). La API no tiene ese dato y no se le agregó.
> - **No planeado:** páginas `/ingresar` y `/compromiso-verde`, y el servidor `dev-auth` (HALL-03).
> - **6.14:** como el token vive solo en memoria, **recargar la página cierra la sesión**. Es el comportamiento elegido por seguridad.
> - Los rangos de edad por tipo de pasajero y la lista de aeropuertos los define el frontend: el contrato no los tiene (HALL-25 y HALL-26).
> - Al probar encontré otro proceso `node dist/main.js` ocupando el puerto 3000 desde el 2 de octubre, que no inicié yo, así que no lo detuve.
>   La prueba se hizo con la API en el 3001.

**Stack:** React + TypeScript + Vite (proyecto separado del backend, consume la API por HTTP con CORS).

**Identidad visual**
6.1. Nombre de marca: **"EcoAirlines"** (decidido; ver HALL-10). Logo: hoja verde en SVG propio.
6.2. Paleta: verdes (`#1B5E20`, `#2E7D32`, `#66BB6A`, `#E8F5E9`) y blanco como dominantes; modo claro/oscuro.
6.3. Diseño **inspirado en la estructura** de la web de Avianca (barra superior, hero con buscador, pestañas de gestión),
   **sin copiar** su logo, textos, imágenes ni marca. Todo el contenido gráfico será propio (SVG/CSS).
6.4. Enganche ecológico: indicador de CO₂ estimado por vuelo, sello "vuelo compensado", sección de compromisos verdes.
   Es **contenido solo del frontend** (calculado en el cliente con una fórmula ilustrativa); no se añade ningún campo a la API.

**Páginas**
6.5. Inicio: hero + buscador (solo ida / ida y vuelta / multidestino hasta 6 tramos, pasajeros por tipo) → `POST /search`.
6.6. Resultados: tarjetas de ofertas, cabinas y tarifas, CO₂ estimado.
6.7. Selección de asientos → `GET /offers/{offerId}/seatmap`.
6.8. Hold con contador de expiración → `POST /offers/hold`, `GET/DELETE /offers/hold/{holdId}`.
6.9. Datos de pasajeros + referencia de pago (solo un campo `paymentReference`; **no** se piden tarjetas, según el contrato) → `POST /bookings`.
6.10. "Mis viajes": listado y detalle, tickets, maletas extra, cambio de fecha, cotización y cancelación.
6.11. Check-in y pases de abordar (código QR renderizado en el cliente).
6.12. Estado de vuelo (público) → `GET /flights/{flightNumber}/status`.

**Seguridad en el frontend**
6.13. Nunca usar `innerHTML`/`dangerouslySetInnerHTML` con datos de la API (React escapa por defecto).
6.14. Token en memoria (no `localStorage`) y envío de `Authorization: Bearer`.
6.15. `Idempotency-Key` UUID generado por intento de operación y reutilizado en reintentos; `X-Device-Fingerprint` generado por navegador.
6.16. Manejo visual de ProblemDetails (mensajes por `code`), incluido `429` respetando `Retry-After`.
6.17. Responsive (móvil a escritorio) y accesible (contraste AA, navegación por teclado).

🔶 Ver **HALL-03** (cómo obtiene el frontend un JWT).

---

## Fase 7 — Pruebas y verificación — ✅ IMPLEMENTADA (2026-10-03)

> **Resultado por punto:**
> - **7.1:** ya existían las unitarias del verificador JWT y del pipe de saneamiento; se agregó `problem-details-throttler.guard.spec.ts` (`429` +
>   `RATE_LIMIT_EXCEEDED` + `Retry-After` ≥ 1).
> - **7.2:** se completaron los errores que faltaban, los de **expiración**, con reloj adelantado: hold vencido → `410`, oferta de cambio vencida
>   → `410 CHANGE_OFFER_EXPIRED`, cotización vencida → `409 QUOTE_EXPIRED` y check-in a menos de 60 min → `422 CUTOFF_PASSED`.
> - **7.3:** se mantuvo la conformidad de rutas y se **amplió a conformidad de respuestas** (ver agregado).
> - **7.4:** API: tipos ✅, lint ✅, unitarias **126/126** ✅, e2e **96/96** ✅, build ✅. Frontend: lint ✅ (0 advertencias), build ✅.
>   dev-auth: sintaxis ✅. El contrato no se modificó (última escritura: 22/09/2026).
> - **7.5:** `vuelos/README.md` reescrito: quedó sin el texto de la plantilla de NestJS e incluye la puesta en marcha, una tabla de qué cubre cada
>   prueba e2e y las variables de entorno unificadas. `frontend/README.md` explica cómo levantar los tres servicios.
> - **7.6:** `vuelos/AUDITORIA.md`: sección nueva "Seguimiento" al final (el informe de OpenCode no se tocó). **13/13 hallazgos corregidos**,
>   cada uno con la prueba que lo protege.
>
> **Agregado (no estaba en el plan, revísalo):** `test/contract-conformance.e2e-spec.ts` + `test/helpers/contract.ts`. Usan las
> dependencias **solo de desarrollo** `ajv` y `ajv-formats`.
> - Cada respuesta real de las 25 operaciones se valida contra el YAML del contrato: el status debe estar documentado y el body debe cumplir
>   el schema, con `nullable`, formatos `date`/`date-time`/`uuid`/`uri` y `additionalProperties: false`.
> - La prueba exige cubrir **todas** las combinaciones operación + status del contrato. La única excluida, con su motivo, es
>   `POST /cancel 202`: la cancelación es síncrona y nunca queda `CANCELLATION_PENDING`.
> - Incluye pruebas de control que demuestran que el validador sí detecta incumplimientos: status no documentado, propiedad extra en
>   ProblemDetails, `code` fuera del enum, campo requerido faltante y formato inválido.
> - Resultado: **ninguna respuesta de la API infringe el contrato** en los casos documentados.
>
> **Limitaciones que siguen (documentadas en AUDITORIA.md):** almacenamiento en memoria, webhooks sin envío real de eventos y GDS / Payment API
> simulados. El frontend se verifica con build, lint y el recorrido en navegador de la Fase 6; no tiene pruebas automatizadas propias,
> porque el plan solo pedía build y lint.

7.1. Unitarias: verificador JWT (firma inválida, expirado, `alg: none`, `aud`/`iss` incorrectos), pipe de sanitización, throttler → 429.
7.2. e2e: CORS (origen permitido/denegado), cabeceras de helmet, 429 con `Retry-After`, ownership de holds y webhooks,
   flujo completo search → hold → booking → check-in → boarding pass, errores 404/409/410/422 de cada fase.
7.3. e2e de Swagger y conformidad de rutas con el contrato (Fase 1).
7.4. Al terminar cada fase: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`; en el frontend `npm run build` y lint.
7.5. Actualizar `vuelos/README.md` con variables de entorno, cómo generar tokens, cómo abrir `/docs` y cómo levantar el frontend.
7.6. Actualizar el estado de los hallazgos en `vuelos/AUDITORIA.md` **solo** en una sección nueva de "seguimiento" (sin reescribir el informe de OpenCode).

---

## Fase 8 — Publicación en GitHub (aprobada 2026-10-04) — ✅ IMPLEMENTADA

> **Resultado:**
> - `.gitignore` en la raíz (nuevo) y `frontend/.gitignore` corregido: ahora ignora `.env` y `.env.*` y conserva `.env.example`.
> - `README.md` general en la raíz (nuevo).
> - **Revisión antes de subir:** 230 archivos. Quedan fuera `node_modules`, `dist` y la caché de TypeScript. El único `.env*` incluido es
>   `frontend/.env.example`, con dos URLs de localhost. Ningún archivo pesa más de 300 KB. No hay rutas del equipo local, correos personales,
>   tokens ni claves privadas. El secreto de desarrollo aparece solo en `dev-auth/server.mjs` y en `vuelos/src/common/auth/auth.config.ts`
>   (es público a propósito y se rechaza en producción).
> - Commit `ede437d` en `main` y etiqueta **`v0.1.0`**, subidos a `https://github.com/gab5453/AppVuelos`. Verificado: el remoto coincide
>   con el commit local.
>
> **Desviaciones y notas (revísalas):**
> - **No planeado:** `vuelos/` tenía un repositorio git propio, vacío (0 commits, sin remotos), creado por `nest new` el 22/09. Impedía
>   incluir la carpeta en el monorepo. **No se borró**: se movió como respaldo fuera del proyecto, a la carpeta temporal de la sesión.
>   No había historia que perder.
> - **El repositorio quedó PÚBLICO.** En la Fase 8 se había sugerido privado porque el contrato incluye el nombre y el correo de su autor
>   (`info.contact`). Conviene confirmarlo con el líder de booking o cambiar la visibilidad en GitHub (Settings → General → Danger Zone).

**Decisión:** un solo repositorio (monorepo) con backend, frontend y dev-auth en carpetas separadas, publicado en
`https://github.com/gab5453/AppVuelos`. **La estructura de carpetas se sube tal cual** (`vuelos/`, `frontend/`, `dev-auth/` y los documentos
en la raíz); no se reorganiza ni se modifica código.

8.1. **`.gitignore`:**
   - Uno en la raíz para todo el repo: dependencias, builds, cobertura, logs, archivos de entorno y archivos de editor y sistema operativo.
   - Corregir `frontend/.gitignore`, que no ignoraba `.env`. Se excluyen `.env` y `.env.*`, y se conserva `.env.example`.
8.2. **`README.md` general** en la raíz: qué es el proyecto, estructura, cómo levantar los 3 servicios y enlaces a la documentación.
8.3. **Revisión antes de subir:** que no entren `node_modules`, `dist`, archivos `.env`, logs ni secretos reales. El secreto de desarrollo
   del código es público a propósito y la API lo rechaza en producción.
8.4. **Primer commit** en la rama `main` con la versión actual, y etiqueta **`v0.1.0`** (primera versión funcional, fases 1–7).
8.5. **Subida** al remoto `origin` y verificación de que el contenido del repositorio coincide con lo esperado.

---

## Archivos que se tocarán (previsión)

**Nuevos (backend):** `src/docs/swagger.setup.ts`, `src/common/auth/infrastructure/jwt-token-verifier.ts`, `src/common/config/*`,
`src/common/security/*` (helmet/cors/throttler/sanitización), `src/common/logging/request-id.*`, `scripts/generate-token.ts`, nuevos `*.spec.ts` y `test/*.e2e-spec.ts`.

**Modificados (backend):** `src/main.ts`, `src/app.module.ts`, `src/common/auth/auth.module.ts`, `src/common/problem-details/problem-details.filter.ts`,
servicios/adaptadores mock de `search`, `offers`, `bookings`, `post-sale`, `check-in`, `flight-status`, `webhooks`, sus repositorios in-memory,
`package.json`, `README.md`, tests e2e existentes (cambio de token).

**Nuevos (frontend):** toda la carpeta `Reto 1/frontend/`.

**No se tocan:** `contract/vuelos-openapi.yaml`, `CLAUDE.md`, `AGENTS.md`, el informe original de `AUDITORIA.md`.

**Nuevas dependencias:** `swagger-ui-express`, `js-yaml`, `jose`, `helmet`, `@nestjs/throttler` (+ tipos). Frontend: `react`, `react-dom`, `react-router-dom`, `vite`, `qrcode`.
