# HALLAZGOS — Inconsistencias y decisiones pendientes del contrato

> Fuente: `vuelos/contract/vuelos-openapi.yaml` (v1.5.0.0). **El contrato NO se ha modificado.**
> Cada hallazgo indica qué se hará mientras tanto (**acción provisional**) sin romper el contrato.
> Completar la columna **Decisión** tras conversarlo con el líder de booking.

| ID | Tema | Severidad | Requiere decisión | Decisión |
|----|------|-----------|-------------------|----------|
| HALL-01 | Prefijo `/flights/v1` | Media | Sí | |
| HALL-02 | 401 no documentado | Media | Sí | |
| HALL-03 | Login para el frontend | Alta | Sí | ✅ Permitido si no infringe el contrato → opción (a), `dev-auth` separado |
| HALL-04 | Strings sin límites ni formato | Media | Sí | |
| HALL-05 | Enum `code` incompleto | Media | Sí | |
| HALL-06 | `201` vs `PENDING` en reservas | Media | Sí | |
| HALL-07 | `cabinClass` libre en HoldRequest | Baja | Sí | |
| HALL-08 | SSRF en URL de webhooks | Alta | Sí | |
| HALL-09 | `secret` del webhook devuelto en respuestas | Alta | Sí | |
| HALL-10 | Nombre de marca del frontend | Baja | Sí | ✅ "EcoAirlines" |
| HALL-11 | 404 no documentado en varios endpoints | Media | Sí | |
| HALL-12 | Check-in sin `Idempotency-Key` | Baja | Informativo | |
| HALL-13 | Respuestas sin body definido | Baja | Informativo | |
| HALL-14 | Inconsistencias menores de schemas | Baja | Informativo | |
| HALL-15 | `413`/`415` no documentados (se usa `400`) | Baja | Sí | |
| HALL-16 | `429` solo documentado en 2 endpoints | Media | Sí | |
| HALL-17 | Header `X-Request-Id` no documentado | Baja | Informativo | |
| HALL-18 | Cotización vencida en `/cancel`: `410` no documentado | Media | Sí | |
| HALL-19 | `POST /bookings` sin `404`: hold inexistente → `422` | Media | Sí | |
| HALL-20 | Errores de posventa no documentados | Media | Sí | |
| HALL-21 | `DateChangeRequest.assignedSeats` sin `passengerId` | Media | Sí | |
| HALL-22 | Arrays sin `minItems` en el contrato | Baja | Sí | |
| HALL-23 | Significado de `totalBaggage` | Baja | Sí | |
| HALL-24 | `PaymentReference` sin monto ni reglas de uso | Media | Sí | |
| HALL-25 | Edades de los tipos de pasajero no definidas | Baja | Sí | |
| HALL-26 | No hay catálogo de aeropuertos en el contrato | Baja | Informativo | |

---

## HALL-01 — Prefijo de ruta `/flights/v1`

- **Contrato:** `servers` = `https://api.booking-hub.com/flights/v1`. Por OpenAPI, los paths se resuelven como `/flights/v1/search`, etc.
- **Código actual:** la API responde en la raíz (`/search`), sin prefijo.
- **Riesgo:** un cliente generado desde el contrato apuntando a un servidor local con `/flights/v1` fallaría.
- **Opciones:** (a) `app.setGlobalPrefix('flights/v1')` en Nest; (b) dejarlo en la raíz y asumir que el gateway agrega el prefijo.
- **Acción provisional:** se deja configurable con `API_PREFIX` (vacío por defecto) y Swagger usa el valor activo. **No se cambia el comportamiento por defecto sin tu aprobación.**

## HALL-02 — Respuesta 401 no documentada

- **Contrato:** define `security: OAuth2Security` pero ningún endpoint documenta `401`. Además existe `ProblemDetails403` en `components.responses`, pero **ningún path lo referencia**.
- **Código actual:** el guard responde `401` sin token / token inválido y `403` sin scopes (correcto según HTTP/OAuth2).
- **Acción provisional:** se mantiene `401`/`403` (rechazar sin token es obligatorio por seguridad).
- **Pregunta al líder:** ¿se agregará `401` y se referenciará `403` en los endpoints protegidos en la próxima versión del contrato?

## HALL-03 — ¿Cómo obtiene el frontend un JWT?

- **Contrato:** la autenticación pertenece a otro dominio (`auth.booking-hub.com`, flujos `authorizationCode` y `clientCredentials`). Esta API no tiene endpoint de login, y no debe tenerlo.
- **Problema:** para que el frontend de demostración pueda reservar, necesita un token válido.
- **Opciones:**
  - (a) **Recomendada:** un pequeño servidor de autenticación de desarrollo **separado** (`Reto 1/dev-auth/`, fuera de la API de vuelos) que emite JWT firmados con un usuario de prueba. La API de vuelos no gana rutas nuevas.
  - (b) Un endpoint `/_dev/token` dentro de la API, deshabilitado en producción. Agrega una ruta fuera del contrato.
  - (c) Pegar manualmente en el frontend un token generado con `npm run token`.
- **Acción provisional:** ninguna hasta tu decisión; mientras tanto se usa la opción (c).
- **Decisión (2026-10-03):** permitido siempre que no infrinja el contrato. Se implementó la **opción (a)**: `Reto 1/dev-auth/`,
  un servidor de desarrollo sin dependencias (registro, login, JWT HS256 con `sub`, `scope`, `iss`, `aud`, `exp`). La API de vuelos
  no ganó ninguna ruta. No arranca con `NODE_ENV=production`. Los clientes finales reciben `flights:read/hold/book/cancel`;
  `flights:webhooks` queda para integraciones B2B.

## HALL-04 — Strings sin `maxLength`, `format` ni `pattern`

- **Contrato:** `firstName`, `lastName`, `documentNumber`, `nationality`, `contact.email`, `contact.phone`, `paymentReference`, `reason`, `secret`, `offerId`, etc. son `type: string` sin límites. `email` no tiene `format: email`; `nationality` no tiene patrón ISO; `BookingRequest.passengers` no tiene `minItems`.
- **Riesgo:** payloads enormes, datos basura, arrays vacíos de pasajeros aceptados.
- **Conflicto:** agregar `@IsEmail()` o `@MaxLength()` haría la API **más estricta que el contrato** (rechazaría peticiones válidas según el YAML).
- **Acción provisional:** solo protecciones que no contradicen el contrato: límite de tamaño de body (100kb), rechazo de caracteres de control y claves `__proto__`. Las validaciones de formato quedan pendientes de aprobación.
- **Propuesta para el contrato:** `maxLength` en strings, `format: email`, `pattern: ^[A-Z]{2}$` para nacionalidad, `minItems: 1` en pasajeros.

## HALL-05 — Enum `ProblemDetails.code` no cubre errores genéricos

- **Contrato:** `code` es requerido y su enum no tiene valores para no autenticado, sin permisos, no encontrado, conflicto de idempotencia o error interno.
- **Código actual:** usa `VALIDATION_FAILED` como comodín para 401, 403, 404, 409 de idempotencia y 500, lo que es semánticamente engañoso para el cliente.
- **Acción provisional:** se mantiene `VALIDATION_FAILED` (único valor que no rompe el schema) y se diferencia por `status` y `title`.
- **Propuesta para el contrato:** agregar `UNAUTHORIZED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`, `IDEMPOTENCY_CONFLICT`, `INTERNAL_ERROR`.

## HALL-06 — `POST /bookings`: `201` con estado `PENDING`

- **Contrato:** `201` = "Reserva creada y ticket emitido correctamente"; `202` = "pago o emisión continúa de forma asíncrona".
- **Código actual:** responde siempre `201` con `status: PENDING` y `grandTotal: 0.00`, una combinación contradictoria.
- **Acción provisional (incluida en CAMBIOS 5.5):** `201` solo con `CONFIRMED` y tickets `ISSUED`; `202` con `PENDING_PAYMENT`/`TICKET_ISSUING`.
- **Implementado (Fase 5):** pago autorizado → `201 CONFIRMED` con tickets `ISSUED`; pago en proceso → `202 PENDING_PAYMENT` con tickets
  `PENDING`, que pasan a `CONFIRMED`/`ISSUED` al confirmarse el pago.
- **Pregunta al líder:** ¿qué estado debe devolverse con `201`? El contrato no lo restringe explícitamente.

## HALL-07 — `HoldRequest.itinerarySelections[].cabinClass` sin enum

- **Contrato:** en `CabinPricing.cabinClass` es enum (`ECONOMY`, `PREMIUM_ECONOMY`, `BUSINESS`, `FIRST`), pero en `HoldRequest` es string libre.
- **Acción provisional:** se acepta cualquier string (como dice el contrato) y, si no coincide con una cabina de la oferta, se responde `409 OFFER_NO_LONGER_AVAILABLE`.
- **Propuesta:** reutilizar el enum en `HoldRequest`. Lo mismo ocurre con `SeatMapResponse.cabins[].cabinClass` y `BookingListResponse.items[].status` (string libre vs enum de `BookingDetail.status`).

## HALL-08 — Riesgo SSRF en `WebhookSubscription.url`

- **Contrato:** `url` es `format: uri`, sin restringir esquema ni host.
- **Riesgo:** un cliente puede registrar `http://localhost:...` o `http://169.254.169.254/` y hacer que el servidor envíe peticiones a la red interna cuando se despachen eventos.
- **Acción provisional (CAMBIOS 3.12):** en producción solo se aceptan `https` con host público; en desarrollo se permite `http://localhost` para pruebas. Es más estricto que el contrato.
- **Pregunta al líder:** ¿se aprueba esta restricción y se documenta en el contrato?

## HALL-09 — `secret` del webhook se devuelve en GET/POST

- **Contrato:** `WebhookSubscription` se usa como request y response; `secret` es `required` y **no** está marcado `writeOnly`. Por tanto `GET /webhooks` debe devolverlo.
- **Riesgo:** cualquiera que lea la lista de suscripciones obtiene el secreto de firma de los webhooks. Hoy, además, la lista no está filtrada por cliente (todos ven todos).
- **Acción provisional:** se mantiene el campo (lo exige el contrato), pero se filtra por propietario (CAMBIOS 2.6).
- **Propuesta para el contrato:** marcar `secret` como `writeOnly: true`.

## HALL-10 — Nombre de la aerolínea en el frontend

- No está definido. Se usará **"Hoja Verde Airlines"** como provisional. Indica el nombre definitivo si existe.
- **Decisión (2026-10-03):** **EcoAirlines**. El código ficticio de aerolínea del GDS simulado pasó de `HV` a `EA` (vuelos `EA300`, etc.).
- Aclaración: el diseño solo toma la **estructura** de la web de Avianca como referencia; no se usarán su logo, textos, imágenes ni marca.

## HALL-11 — `404` no documentado en endpoints con `{bookingId}`

- **Contrato:** `baggage-options`, `baggage`, `date-change/search`, `date-change`, `cancellation-quote`, `cancel` y `check-in` reciben `bookingId` pero **no documentan `404`**; `DELETE /webhooks/{id}` tampoco. Solo `GET /bookings/{bookingId}`, `tickets` y `boarding-passes` lo hacen.
- **Código actual:** responde `404` si la reserva no existe o no es del usuario (necesario para evitar IDOR).
- **Acción provisional:** se mantiene `404` (no hay alternativa segura dentro del contrato).
- **Propuesta:** documentar `404` en todos los endpoints con identificador en el path.

## HALL-12 — `POST /bookings/{bookingId}/check-in` sin `Idempotency-Key`

- Es la única operación `POST` que modifica estado sin exigir `Idempotency-Key`. Se respeta el contrato (no se exige) y se implementa como operación naturalmente idempotente (repetir el check-in devuelve el mismo resultado). Informativo.

## HALL-13 — Respuestas sin body definido

- `POST /bookings/{id}/cancel` → `200` sin schema; `202` de `baggage`, `date-change` y `cancel` sin schema. El cliente no sabe qué esperar.
- **Acción provisional:** se responden sin body (lo más fiel al contrato). Propuesta: devolver `BookingDetail`.

## HALL-14 — Inconsistencias menores

- `info.version: 1.5.0.0` no sigue SemVer (`MAJOR.MINOR.PATCH`).
- `PassengerBreakdown` no tiene `additionalProperties: false`, aunque lo tiene su padre `SearchRequest`.
- Los importes en `MoneyAmount`, `CancellationQuoteResponse` y `priceDifference` son `string` sin `pattern` decimal; `CancellationQuoteResponse.currency` no tiene el patrón `^[A-Z]{3}$` usado en `MoneyAmount`.
- `GET /bookings` `limit` tiene `maximum: 50` pero no `minimum`; `status` es string libre.
- `PassengerItem.associatedAdultId` no es obligatorio para `INFANT` (debería serlo por regla de negocio, que el contrato insinúa con `INFANT_SEAT_NOT_ALLOWED`).
- `POST /webhooks` no documenta `400` aunque recibe body validado.

## HALL-15 — Body demasiado grande y `Content-Type` incorrecto (`413`/`415`)

- **Contexto (Fase 3):** la API limita el body a 100kb y solo acepta `application/json`.
- **Problema:** lo semánticamente correcto en HTTP sería `413 Payload Too Large` y `415 Unsupported Media Type`, pero el contrato no
  los documenta en ningún endpoint.
- **Acción provisional:** se responde `400` ProblemDetails `VALIDATION_FAILED`, el código de error de cliente más documentado,
  indicando la causa en `invalidParams` (`payload too large`, `must be application/json`, `malformed JSON`).
- **Propuesta para el contrato:** documentar `413` y `415` como respuestas comunes de los endpoints con body.

## HALL-16 — `429` solo documentado en `/search` y `/seatmap`

- **Contrato:** `429` (con `Retry-After` y el código `RATE_LIMIT_EXCEEDED`) solo aparece en `POST /search` y `GET /offers/{offerId}/seatmap`.
- **Problema:** sin un límite global, el resto de endpoints quedaría expuesto a abuso (fuerza bruta de tokens, enumeración de ids,
  creación masiva de holds). Con el límite global, esos endpoints pueden devolver un `429` que su contrato no declara.
- **Acción provisional:** límite global generoso (300 peticiones/min por IP) y límites estrictos solo en los dos endpoints que lo
  documentan (30 y 60/min). Todo es configurable por variables de entorno.
- **Propuesta para el contrato:** documentar `429` en todos los endpoints, o declarar que el rate limiting general lo aplica el gateway.

## HALL-17 — Header `X-Request-Id` no documentado

- **Contexto (Fase 4):** todas las respuestas incluyen `X-Request-Id` (identificador de correlación para soporte y logs). Si el
  cliente envía un UUID en ese header, se respeta.
- **Impacto en el contrato:** ninguno incompatible. Es un header de respuesta adicional y opcional para el cliente; ningún schema cambia.
  No se agregó al body porque `ProblemDetails` tiene `additionalProperties: false`.
- **Propuesta:** documentarlo como header común de respuesta (y opcional de petición) en la próxima versión, para que los clientes
  sepan que pueden enviarlo y reportarlo al pedir soporte.

## HALL-18 — Cotización de cancelación vencida

- **Contrato:** `ProblemDetails410` se describe como "Recurso expirado (Hold o **Cotización**)" y existe el código `QUOTE_EXPIRED`,
  pero `POST /bookings/{bookingId}/cancel` solo documenta `200`, `202` y `409`.
- **Acción provisional (Fase 5):** cotización vencida → `409 QUOTE_EXPIRED`; `quoteId` desconocido o de otra reserva → `409 VALIDATION_FAILED`.
- **Propuesta:** agregar `410` a `/cancel` (como en `POST /bookings` y `date-change`).

## HALL-19 — `POST /bookings` no documenta `404`

- **Contrato:** `POST /bookings` documenta `400`, `409`, `410` y `422`. No hay respuesta para un `holdId` inexistente o de otro usuario.
- **Acción provisional (Fase 5):** `422 VALIDATION_FAILED` (la entidad referenciada no es procesable). Hold vencido → `410 OFFER_NO_LONGER_AVAILABLE`;
  hold ya usado o liberado → `409 OFFER_NO_LONGER_AVAILABLE`. El plan original (CAMBIOS 5.4) decía `404`; se corrigió en la revisión (REV-08).
- **Pregunta al líder:** ¿`422` es aceptable o se prefiere documentar `404`?

## HALL-20 — Errores de posventa no documentados

Casos reales que el contrato no cubre en los endpoints de posventa (acción provisional entre paréntesis):
- `GET /cancellation-quote` y `GET /baggage-options` solo documentan `200`. Una reserva cancelada o no confirmada no puede cotizarse
  (`409 ALREADY_CANCELLED` / `409 BOOKING_NOT_CONFIRMED`).
- `POST /baggage`, `/date-change/search` y `/date-change` no documentan `400`. Un `itineraryId` o `passengerId` que no está en la
  reserva es un error de la petición (`400 VALIDATION_FAILED`, igual que las validaciones de body).
- `POST /baggage` solo documenta `409`: los problemas de pago se informan con `409 PAYMENT_REFERENCE_INVALID` / `409 PAYMENT_NOT_AUTHORIZED`
  (en `POST /bookings` son `422`).
- **Propuesta:** documentar `400` y `409` en todos los endpoints de posventa, y `422` para pagos de forma uniforme.

## HALL-21 — `DateChangeRequest.assignedSeats` no indica el pasajero

- **Contrato:** cada ítem tiene solo `segmentId` y `seatNumber` (ninguno `required`). Con varios pasajeros no se sabe de quién es cada asiento.
- **Acción provisional (Fase 5):** los asientos de cada segmento se asignan **en orden** a los pasajeros con asiento, según el orden de la reserva.
  Más asientos que pasajeros → `409 VALIDATION_FAILED`.
- **Propuesta:** agregar `passengerId` (requerido) a esos ítems, como en `PassengerItem.assignedSeats`.

## HALL-22 — Arrays sin `minItems`

- **Contrato:** `HoldRequest.itinerarySelections`, `BookingRequest.passengers`, `DateChangeSearchRequest.changes` y `WebhookSubscription.events`
  no declaran `minItems`, y `PassengerItem.extraBaggage[].quantity` no declara `minimum`.
- **Problema detectado en la revisión (REV-02):** el código exigía mínimo 1 con `400`, **más estricto que el contrato**.
- **Acción (Fase 5):** se quitaron del DTO. La regla se aplica como negocio donde el contrato documenta `422`:
  hold sin selecciones → `422`; pasajeros que no coinciden con el hold → `422`; maleta con cantidad < 1 → `422`.
  `changes: []` devuelve cero opciones y una suscripción con `events: []` es válida (no recibirá eventos).
- **Propuesta:** declarar `minItems: 1` donde corresponda.

## HALL-23 — Significado de `BaggageAddedResponse.totalBaggage`

- **Contrato:** `totalBaggage` es un entero sin descripción: puede leerse como maletas extra compradas o como total facturado.
- **Acción provisional (Fase 5):** total de maletas facturadas del pasajero en ese itinerario = incluidas en la tarifa + extra compradas.
- **Propuesta:** agregar una `description` al campo.

## HALL-24 — `PaymentReference` sin monto ni reglas de uso

- **Contrato:** `PaymentReference` solo tiene `paymentReference`. Existen los códigos `AMOUNT_MISMATCH`, `PAYMENT_REFERENCE_INVALID` y
  `PAYMENT_NOT_AUTHORIZED`, pero no se define cómo se verifica el monto ni si una referencia puede usarse dos veces.
- **Riesgo:** sin una regla de uso único, un mismo pago podría aplicarse a varias reservas o maletas.
- **Acción provisional (Fase 5):** la Payment API simulada exige formato `pay_…`, rechaza referencias ya aplicadas a otra operación
  (`PAYMENT_REFERENCE_INVALID`) y simula rechazos (`declined`) y pagos asíncronos (`async` → `202`). `AMOUNT_MISMATCH` no se usa:
  la verificación del monto corresponde a la Payment API real.
- **Pregunta al líder:** confirmar con el dominio de pagos el contrato de verificación (monto, moneda, uso único).

## HALL-25 — Edades de `ADULT`, `YOUTH`, `CHILD` e `INFANT`

- **Contrato:** define los tipos de pasajero pero no sus rangos de edad, ni valida `birthDate` contra el tipo.
- **Acción provisional (Fase 6):** el frontend muestra como guía: adulto 15+, joven 12–14, niño 2–11, infante menor de 2 (en brazos).
  La API **no** valida la edad contra el tipo, porque el contrato no lo pide.
- **Propuesta:** documentar los rangos y si `birthDate` debe ser coherente con `passengerType` (error `422`).

## HALL-26 — No hay catálogo de aeropuertos

- **Contrato:** no expone un endpoint de aeropuertos o destinos. El frontend necesita una lista para los selectores de origen y destino.
- **Acción (Fase 6):** el frontend mantiene la lista de los 10 aeropuertos de la red (`frontend/src/data/airports.ts`). Si la red cambia,
  hay que actualizarla a mano. Informativo: no rompe el contrato.
- **Propuesta:** un `GET /airports` (o `/destinations`) público en una versión futura.
