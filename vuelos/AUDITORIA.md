# Informe de auditoria

## Alcance

- **Fuente de verdad:** `contract/vuelos-openapi.yaml`
- **Proyecto auditado:** `Reto 1/vuelos`
- **Fecha:** 2026-09-23
- **Archivos modificados durante la auditoria:** ninguno.

Se revisaron controllers, DTOs, servicios, guards, scopes OAuth2, idempotencia, ProblemDetails, modulos, repositorios y pruebas.

## CRITICAL

### AUD-001 - OAuth2 no esta implementado realmente

- **ARCHIVO:** `src/common/auth/infrastructure/mock-token-verifier.ts:6`
- **ELEMENTO DEL CONTRATO:** `components.securitySchemes.OAuth2Security`
- **PROBLEMA:** El verificador activo acepta tokens falsos con formato `sub:scope1,scope2`. No valida firma, issuer, audience ni expiracion JWT.
- **IMPACTO:** Un atacante puede fabricar un token y acceder a endpoints protegidos.
- **CORRECCION PROPUESTA:** Implementar validacion real mediante JWKS, introspeccion OAuth2 o middleware del gateway. Mantener el mock unicamente para desarrollo explicito.

### AUD-002 - Falta autorizacion por propietario de la reserva

- **ARCHIVOS:** `src/modules/bookings/presentation/bookings.controller.ts:49`, `src/modules/bookings/application/bookings.service.ts:44`, `src/modules/bookings/presentation/tickets.controller.ts:15`
- **ELEMENTO DEL CONTRATO:** `ownerId` se deriva exclusivamente del `sub` del JWT.
- **PROBLEMA:** `getDetail`, `listTickets` y `getTicket` consultan unicamente por `bookingId`; no verifican `user.sub`.
- **IMPACTO:** Vulnerabilidad IDOR y exposicion de PNR, pasajeros, tickets e itinerarios.
- **CORRECCION PROPUESTA:** Consultar reservas mediante `bookingId + ownerId` y devolver `404` o `403` segun la politica definida.

## HIGH

### AUD-003 - Cancelacion ignora el request body

- **ARCHIVOS:** `src/modules/post-sale/presentation/cancellation.controller.ts:27`, `src/modules/post-sale/application/cancellation.service.ts:21`
- **ELEMENTO DEL CONTRATO:** `POST /bookings/{bookingId}/cancel`, schema `CancelBookingRequest`.
- **PROBLEMA:** El controller descarta el body y el servicio recibe unicamente `bookingId`. No valida `quoteId`, expiracion ni estado.
- **IMPACTO:** Una cancelacion invalida puede responder exitosamente sin actualizar la reserva.
- **CORRECCION PROPUESTA:** Propagar `CancelBookingRequestDto`, validar la cotizacion y actualizar el estado a `CANCELLATION_PENDING` o `CANCELLED`.

### AUD-004 - Postventa sin validacion de reserva ni propietario

- **ARCHIVOS:** `src/modules/post-sale/presentation/baggage.controller.ts:15`, `src/modules/post-sale/presentation/date-change.controller.ts:16`, `src/modules/post-sale/presentation/cancellation.controller.ts:15`
- **ELEMENTO DEL CONTRATO:** Endpoints `/bookings/{bookingId}/...`.
- **PROBLEMA:** Los servicios no reciben `ownerId`, ni verifican existencia, estado o pertenencia de la reserva.
- **IMPACTO:** Se pueden ejecutar operaciones sobre reservas inexistentes o de otros usuarios.
- **CORRECCION PROPUESTA:** Centralizar una validacion de reserva propietaria antes de cada operacion postventa.

### AUD-005 - Idempotencia vulnerable a concurrencia

- **ARCHIVO:** `src/common/idempotency/idempotency.interceptor.ts:42`
- **ELEMENTO DEL CONTRATO:** `Idempotency-Key` en hold, bookings, baggage, date-change y cancelacion.
- **PROBLEMA:** La secuencia `find` y `save` no es atomica. Una misma clave con otro payload devuelve la respuesta cacheada sin producir `409`.
- **IMPACTO:** Posibles reservas, pagos o cancelaciones duplicadas.
- **CORRECCION PROPUESTA:** Usar una operacion atomica `claim`, almacenamiento persistente/distribuido y hash de metodo, ruta, usuario y body.

### AUD-006 - Status incorrecto al agregar equipaje

- **ARCHIVO:** `src/modules/post-sale/presentation/baggage.controller.ts:21`
- **ELEMENTO DEL CONTRATO:** `POST /bookings/{bookingId}/baggage`.
- **PROBLEMA:** El metodo `POST` no define `@HttpCode`; NestJS respondera `201`, mientras el contrato exige `200` o `202`.
- **IMPACTO:** Incumplimiento directo del codigo HTTP contratado.
- **CORRECCION PROPUESTA:** Definir explicitamente `200` para operacion sincronica o `202` para procesamiento asincrono.

### AUD-007 - `X-Device-Fingerprint` no se valida

- **ARCHIVO:** `src/modules/search/presentation/search.controller.ts:10`
- **ELEMENTO DEL CONTRATO:** Header obligatorio `X-Device-Fingerprint` en `POST /search`.
- **PROBLEMA:** El header se recibe pero se ignora; una peticion sin el puede llegar al servicio.
- **IMPACTO:** Se incumple el contrato y pueden omitirse controles antifraude o rate limiting.
- **CORRECCION PROPUESTA:** Rechazar su ausencia con `ProblemDetails` `400`.

### AUD-008 - Servicios principales son placeholders

- **ARCHIVOS:** `src/modules/post-sale/application/baggage.service.ts:6`, `src/modules/post-sale/application/date-change.service.ts:7`, `src/modules/check-in/application/check-in.service.ts:5`, `src/modules/post-sale/application/cancellation.service.ts:5`
- **ELEMENTO DEL CONTRATO:** Respuestas y reglas de postventa, check-in y cancelacion.
- **PROBLEMA:** Devuelven respuestas estaticas o vacias sin consultar reservas, inventario, pagos ni estados.
- **IMPACTO:** Los endpoints pueden responder estructuras validas, pero no implementan el comportamiento contractual.
- **CORRECCION PROPUESTA:** Integrar repositorios y servicios de dominio, y generar los errores contractuales correspondientes.

## MEDIUM

### AUD-009 - Campos anidados requeridos no siempre son obligatorios

- **ARCHIVOS:** `src/modules/search/presentation/dto/search-request.dto.ts:19`, `src/modules/offers/presentation/dto/hold-request.dto.ts:15`, `src/modules/bookings/presentation/dto/booking-request.dto.ts:96`
- **ELEMENTO DEL CONTRATO:** `SearchRequest.passengers`, `HoldRequest.passengersBreakdown`, `BookingRequest.payment`.
- **PROBLEMA:** Se usa `@ValidateNested()` sin `@IsDefined()`.
- **IMPACTO:** Algunos objetos requeridos podrian omitirse sin generar error de validacion.
- **CORRECCION PROPUESTA:** Anadir `@IsDefined()` a las propiedades requeridas.

### AUD-010 - Parametros UUID sin validacion

- **ARCHIVOS:** `src/modules/offers/presentation/hold.controller.ts:34`, `src/modules/bookings/presentation/bookings.controller.ts:49`, `src/modules/webhooks/presentation/webhooks.controller.ts:29`
- **ELEMENTO DEL CONTRATO:** `holdId`, `bookingId` e `id` con `format: uuid`.
- **PROBLEMA:** Se reciben como `string` sin `ParseUUIDPipe` ni validacion equivalente.
- **IMPACTO:** Valores invalidos alcanzan los servicios y pueden producir respuestas inconsistentes.
- **CORRECCION PROPUESTA:** Aplicar `ParseUUIDPipe` o DTOs con `@IsUUID()`.

### AUD-011 - Ownership ausente en check-in y boarding pass

- **ARCHIVO:** `src/modules/check-in/presentation/check-in.controller.ts:14`
- **ELEMENTO DEL CONTRATO:** `/bookings/{bookingId}/check-in` y `/boarding-passes`.
- **PROBLEMA:** El servicio no recibe usuario ni consulta la reserva.
- **IMPACTO:** Un usuario autenticado podria operar o consultar recursos ajenos.
- **CORRECCION PROPUESTA:** Validar propietario, estado de reserva y elegibilidad antes de ejecutar la operacion.

### AUD-012 - Cobertura de pruebas insuficiente

- **ARCHIVO:** `test/app.e2e-spec.ts:10`
- **PROBLEMA:** Solo existen 3 pruebas e2e. No cubren ownership, scopes, UUID, idempotencia, respuestas `201/202/204`, postventa, webhooks, DTOs ni schemas completos.
- **IMPACTO:** Los incumplimientos detectados no estan protegidos por pruebas de regresion.
- **CORRECCION PROPUESTA:** Anadir pruebas contractuales por endpoint y casos negativos de autorizacion, ownership, UUID, payload duplicado y reutilizacion de `Idempotency-Key`.

## LOW

### AUD-013 - `additionalProperties: false` no se respeta estrictamente

- **ARCHIVO:** `src/main.ts:10`
- **ELEMENTO DEL CONTRATO:** Schemas con `additionalProperties: false`.
- **PROBLEMA:** `ValidationPipe({ whitelist: true })` elimina propiedades desconocidas silenciosamente en vez de rechazarlas.
- **IMPACTO:** El servidor acepta bodies que el contrato declara invalidos.
- **CORRECCION PROPUESTA:** Evaluar `forbidNonWhitelisted: true` y mapear el error a `ProblemDetails 400`.

## Compatibilidad general

- Los paths principales revisados coinciden con el contrato.
- Los metodos HTTP principales coinciden, salvo el status de agregar equipaje.
- Los scopes declarados en controllers coinciden nominalmente con el contrato.
- La separacion modular es razonable y no se observaron dependencias circulares directas entre dominios.
- La proteccion real de scopes depende del verificador OAuth2 simulado, por lo que no es suficiente para produccion.

## Verificaciones ejecutadas

- `npm run build`: correcto.
- `npm run lint`: correcto.
- `npm test`: 2 pruebas correctas.
- `npm run test:e2e`: 3 pruebas correctas.

## Estado final

- **Problemas encontrados:** 13.
- **Problemas corregidos:** 0.
- **Problemas pendientes:** 13.
- **Archivos de codigo modificados:** ninguno.

---

## Seguimiento (agregado por el programador principal, 2026-10-03)

> Sección nueva; el informe original de arriba no se modificó. Detalle de cada cambio en `../CAMBIOS.md` (fases 1–7).
> Se recomienda que OpenCode vuelva a auditar para confirmar este seguimiento.

| ID | Severidad | Estado | Corrección | Prueba que lo protege |
|----|-----------|--------|------------|-----------------------|
| AUD-001 | CRITICAL | ✅ Corregido (Fase 2) | `JwtTokenVerifier`: firma, `exp`/`nbf`, `iss`, `aud`, lista blanca de algoritmos; modo JWKS para el proveedor real. En producción la API no arranca sin configuración. `MockTokenVerifier` eliminado | `jwt-token-verifier.spec.ts` (firma, expirado, `alg: none`, iss/aud, confusión de algoritmos), `auth.config.spec.ts`, `auth.e2e-spec.ts` |
| AUD-002 | CRITICAL | ✅ Corregido (antes de la Fase 1) | `BookingOwnershipGuard`: reserva ajena o inexistente → `404` | `booking-ownership.guard.spec.ts`, `audit-fixes.e2e-spec.ts` |
| AUD-003 | HIGH | ✅ Corregido y ampliado (Fase 5) | La cancelación valida `quoteId` (existencia, reserva y vencimiento) y libera cupos y asientos | `post-sale.e2e-spec.ts`, `contract-conformance.e2e-spec.ts` (`QUOTE_EXPIRED`) |
| AUD-004 | HIGH | ✅ Corregido | Toda la postventa pasa por `BookingOwnershipGuard` y exige reserva confirmada | `audit-fixes.e2e-spec.ts`, `post-sale.e2e-spec.ts` |
| AUD-005 | HIGH | ✅ Corregido y ampliado (Fase 5) | `claim` atómico + huella de método, ruta, usuario y body. Además: clave aislada por usuario y expiración de 24 h (REV-07) | `in-memory-idempotency-store.spec.ts`, `audit-fixes.e2e-spec.ts` |
| AUD-006 | HIGH | ✅ Corregido | `POST /baggage` responde `200`, o `202` si el pago está en proceso | `audit-fixes.e2e-spec.ts`, `contract-conformance.e2e-spec.ts` |
| AUD-007 | HIGH | ✅ Corregido | `DeviceFingerprintGuard` → `400` | `audit-fixes.e2e-spec.ts` |
| AUD-008 | HIGH | ✅ Corregido (Fase 5) | GDS simulado compartido: búsqueda, holds con cupos, reservas con tickets, check-in, pases, maletas, cambio de fecha, cancelación y estado de vuelo con lógica real | `booking-flow.e2e-spec.ts`, `post-sale.e2e-spec.ts`, `mock-gds.service.spec.ts` |
| AUD-009 | MEDIUM | ✅ Corregido | `@IsDefined()` en objetos anidados requeridos | `search-request.dto.spec.ts` |
| AUD-010 | MEDIUM | ✅ Corregido | `ParseUUIDPipe` / validación UUID en parámetros `format: uuid` | `audit-fixes.e2e-spec.ts` |
| AUD-011 | MEDIUM | ✅ Corregido (Fase 5) | El check-in valida propiedad, estado y ventana (48 h / cierre 60 min) | `booking-flow.e2e-spec.ts`, `contract-conformance.e2e-spec.ts` (`CUTOFF_PASSED`) |
| AUD-012 | MEDIUM | ✅ Corregido (Fase 7) | De 3 a 96 pruebas e2e (y de 2 a 126 unitarias). Cada respuesta de las 25 operaciones se valida contra el schema del contrato | `contract-conformance.e2e-spec.ts` y el resto de `test/` |
| AUD-013 | LOW | ✅ Corregido (Fase 3) | `additionalProperties: false` respetado en SearchRequest, BookingRequest y `PaymentReference` anidado; en el resto de schemas se permiten propiedades extra, como dice el contrato | `security.e2e-spec.ts`, `audit-fixes.e2e-spec.ts` |

**Estado final del seguimiento:** 13 encontrados, 13 corregidos, 0 pendientes.

**Fuera del alcance de la auditoría original, pero relevantes para la próxima revisión:**
- Las inconsistencias del contrato quedaron documentadas en `../HALLAZGOS.md` (HALL-01 a HALL-26) para decidir con el líder de booking.
- Persisten como limitaciones conocidas del Reto 1: almacenamiento en memoria (idempotencia, rate limiting, holds y reservas),
  despachador de webhooks *noop* (no se emiten eventos) y GDS / Payment API simulados.
