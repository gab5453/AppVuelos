# HALLAZGOS — AppVuelos (EcoAirlines)

> **Versión 1 · revisado el 2026-10-05 contra el código** (commit `adb6c48`, etiqueta `v0.1.0`).
> Fusiona el antiguo `HALLAZGOS.md` (contrato) y `HALLAZGOS2.md` (puesta en marcha), y suma la comparación con la **plantilla del booking**
> (`Vuelos-Integracion-Sistemas-main`) y los requisitos de **RDA1**: API REST, funcionamiento individual y despliegue en la nube (Render).
> El contrato `contract/vuelos-openapi.yaml` **no se modifica**. Es idéntico (mismo hash) al de la plantilla.
>
> **Para decidir con el líder de booking:** completar la columna *Decisión*. Las versiones anteriores de este archivo y de
> `HALLAZGOS2.md` están en el historial de git (`git show adb6c48:HALLAZGOS.md`).

**Estados:** 🔴 bloquea ver, usar o desplegar · 🟠 importante · 🟡 menor · ⚪ informativo · ✅ resuelto.
**Prefijos:** `OPS` = entorno local · `NUBE` = despliegue RDA1 · `PLT` = plantilla del booking · `EXT` = extensiones fuera del contrato · `HALL` = contrato · `DOC` = documentación y proceso.

---

## 1. Resumen y prioridades

| ID | Prioridad | Hallazgo | Requiere decisión | Decisión |
|----|-----------|----------|-------------------|----------|
| OPS-01 | ✅ | API vieja (02/10) ocupa el puerto 3000: `/docs` da 404 | Resuelto (05/10: ya no corre) | |
| OPS-02 | ✅ | El frontend apunta por defecto al 3000 (la API vieja) | Resuelto con OPS-01 | |
| OPS-03 | ✅ | Servicios de la sesión anterior siguen ocupando 3001, 4000 y 5173 | Resuelto (05/10: ya no corren) | |
| NUBE-01 | 🔴 | Swagger no queda usable en la nube (apagado en producción y "Try it out" sin la URL pública) | Sí | |
| NUBE-02 | 🔴 | Datos en memoria: en Render se pierden al reiniciar o "dormir" el servicio | Sí | |
| NUBE-03 | 🔴 | `dev-auth` no arranca en producción y la API exige configuración de auth explícita | Sí | |
| NUBE-04 | 🟠 | No hay `Dockerfile` ni configuración de Render; el repo es monorepo | No | |
| PLT-01 | 🔴 | Tres rutas base distintas: contrato `/flights/v1`, plantilla `/api/v1`, código en la raíz | **Sí** | |
| PLT-02 | 🟠 | Swagger: la plantilla usa `/api/docs`, el código `/docs` | Sí | |
| PLT-03 | 🟠 | La plantilla usa PostgreSQL + TypeORM; el código usa memoria | Sí (ver NUBE-02) | |
| PLT-04 | 🟡 | Los DTOs de la plantilla son más estrictos que el contrato | Informativo | |
| PLT-05 | ⚪ | Entidad `Vuelo` y `CreateVueloDto` de la plantilla no existen en el contrato | Informativo | |
| PLT-06 | ⚪ | Estructura interna distinta (un módulo frente a varios dominios) | Informativo | |
| DOC-01 | ✅ | Documentación dice "25 operaciones"; son **22** | Resuelto (V1.C) | |
| DOC-02 | ✅ | Gemini CLI no lee `AGENTS.md` por defecto | Resuelto (`GEMINI.md`) | |
| OPS-04 | 🟠 | `127.0.0.1:5173` no abre; solo `localhost` | No | |
| OPS-05 | 🟠 | Si el 5173 está ocupado, Vite cambia de puerto y CORS bloquea | No | |
| OPS-06 | 🟡 | Node 24.12 < 24.15 que piden algunas dependencias | No | |
| EXT-01 | 🟠 | Endpoints propios fuera del contrato (perfil, cambio de asiento, administración, observabilidad) | **Sí**: acordar con el líder de booking | |
| EXT-02 | ⚪ | La plantilla del grupo expone la administración sin autenticación; aquí exige `ecoairlines:admin` | Informativo | |
| EXT-03 | 🟡 | El estado que fija el administrador no se refleja en `FlightSegment.status` de la búsqueda | Sí (si se quiere reflejar) | |
| HALL-01…26 | — | Inconsistencias del contrato (sección 6). 2 resueltas, 24 abiertas | Sí | ver tabla |

---

## 2. Entorno local (`OPS`) — impiden ver o usar el proyecto hoy

### OPS-01 ✅ Una API vieja ocupa el puerto 3000 *(resuelto: el 05/10 ya no había procesos en el puerto)*
- **Verificado hoy:** PID **28580**, `node dist/main.js`, iniciado el **02/10/2026 21:01**, antes de la Fase 1. Es un proceso huérfano: su terminal ya
  se cerró. `GET /docs` → 404, `/search` → 0 ofertas, y no envía `X-Request-Id` ni cabeceras de seguridad.
- **Impacto:** `localhost:3000/docs` no muestra Swagger y `npm run start:dev` falla con `EADDRINUSE`.
- **Acción:** `Stop-Process -Id 28580` y luego `cd vuelos; npm run start:dev`.

### OPS-02 ✅ El frontend usa por defecto el puerto 3000 *(resuelto con OPS-01)*
- `ecoairlines-web/src/config.ts` (antes `frontend/`) → `http://localhost:3000`. Contra la API vieja, el JWT real de `dev-auth` da **403** al reservar, porque esa
  versión usa el verificador simulado antiguo.
- **Acción:** se resuelve con OPS-01. Si la API corre en otro puerto, crear `ecoairlines-web/.env` con `VITE_API_URL`.

### OPS-03 ✅ Siguen corriendo los servicios que levanté en la sesión anterior *(resuelto: el 05/10 ya no corrían; desde V1.C los procesos de prueba se detienen al terminar)*
- PIDs **21772** (API en 3001), **16720** (dev-auth en 4000) y **40972** (Vite en 5173), del 04/10 19:24.
- **Impacto:** si levantas el proyecto tú, el 4000 y el 5173 ya están ocupados. `npm start` de dev-auth falla, y Vite toma otro puerto,
  con lo que CORS lo bloquea (OPS-05).
- **Acción:** `Stop-Process -Id 21772, 16720, 40972`.

### OPS-04 🟠 `http://127.0.0.1:5173` rechaza la conexión *(antes H2-03)*
- Vite escucha solo en `localhost` (IPv6 `::1` en Windows con Node 17+). Además, CORS solo permite `http://localhost:5173`.
- **Acción:** usar `http://localhost:5173`.

### OPS-05 🟠 Puerto 5173 ocupado → CORS bloquea *(antes H2-04)*
- `npm run dev` no usa `--strictPort`. Si cambia a 5174, la API lo rechaza.
- **Acción:** liberar el 5173 o agregar el puerto real a `CORS_ORIGINS`.

### OPS-06 🟡 Versión de Node *(antes H2-06)*
- Instalado 24.12.0. `@nestjs/cli` pide ≥ 24.15 (advertencias `EBADENGINE`). Todo funciona; se recomienda actualizar a la última LTS 24.

---

## 3. Despliegue en la nube — RDA1 (`NUBE`) *(nuevo)*

> RDA1: *"Cada equipo debe construir su aplicativo para que funcione de manera independiente y subir su API correspondiente a Render."*
> El proyecto **funciona en local**, pero hoy **no queda listo para usarse en la nube** sin estos ajustes.

### NUBE-01 🔴 Swagger no es usable en la nube
- **Verificado en el código:**
  - `isSwaggerEnabled()` apaga `/docs` cuando `NODE_ENV=production` (`swagger.setup.ts:93`).
  - El servidor de "Try it out" se arma como `http://localhost:${port}` (`main.ts:40`), y el overlay solo existe fuera de producción (`main.ts:39`).
    En producción solo quedan los `servers` del contrato (`api.booking-hub.com`), que no existen.
- **Impacto:** en Render, o no hay Swagger, o "Try it out" envía las peticiones a una URL equivocada. Es justo lo que usarían los evaluadores.
- **Propuesta (fase V1.3):** URL pública configurable (p. ej. `PUBLIC_API_URL`) para el servidor de Swagger y `SWAGGER_ENABLED=true` en Render.
  **El contrato no cambia**: es el mismo overlay en memoria.

### NUBE-02 🔴 Persistencia en memoria
- Holds, reservas, idempotencia, rate limiting, webhooks y usuarios de `dev-auth` viven en memoria.
- **Impacto en Render:** el plan gratuito duerme el servicio tras inactividad, y cada reinicio o redeploy **borra todas las reservas**.
- **Propuesta (fase V1.2):** PostgreSQL con TypeORM, como la plantilla (ver PLT-03). Los repositorios ya están detrás de *ports*, así que
  se cambian los adaptadores sin tocar controllers ni contrato.

### NUBE-03 🔴 Autenticación en la nube
- `dev-auth/server.mjs:15` termina el proceso con `NODE_ENV=production`. La API en producción exige `AUTH_ISSUER`, `AUTH_AUDIENCE` y un
  `AUTH_JWT_SECRET` propio (≥ 32 caracteres, distinto al de desarrollo), o bien un `AUTH_JWKS_URL`.
- **Decisión necesaria:** ¿quién emite tokens en la nube durante RDA1? Opciones: (a) desplegar `dev-auth` como servicio aparte con un
  secreto compartido real (habría que permitirle arrancar en la nube); (b) que el booking central provea el proveedor OAuth2.

### NUBE-04 🟠 Falta la configuración de despliegue
- No hay `Dockerfile`, `render.yaml` ni `.dockerignore` en el repo (la plantilla sí trae Docker para PostgreSQL).
- Monorepo: en Render cada servicio necesita su *Root Directory*: `vuelos` (Web Service), `dev-auth` (Web Service) y `frontend`
  (Static Site, con `VITE_API_URL` y `VITE_AUTH_URL` definidos **al compilar**).
- `CORS_ORIGINS` debe contener la URL pública del frontend.

---

## 4. Plantilla del booking (`PLT`) *(nuevo)*

> La plantilla declara que su código es **"ejemplo estructural"** (todos sus endpoints devuelven `{}`). Lo obligatorio es el contrato,
> idéntico al nuestro. Estas diferencias importan para la **integración en RDA2**.

### PLT-01 🔴 Tres rutas base distintas *(amplía el antiguo HALL-01)*
| Fuente | Ruta base | Ejemplo |
|--------|-----------|---------|
| Contrato (`servers`) | `/flights/v1` | `https://api.booking-hub.com/flights/v1/search` |
| Plantilla (`main.ts`) | `/api/v1` | `http://localhost:3000/api/v1/search` |
| Nuestro código | raíz | `http://localhost:3000/search` |
- **Impacto:** en RDA2 el booking central llamará a una ruta concreta. Si no coincide, todas las llamadas darán 404.
- **Pregunta al líder:** ¿qué ruta base se usará en la integración? Sugerencia: la del contrato (`/flights/v1`). Se implementa con un
  prefijo configurable (`API_PREFIX`), sin tocar el contrato.

### PLT-02 🟠 Ruta de Swagger
- Plantilla: `/api/docs` (Swagger generado con decoradores `@nestjs/swagger`). Nuestro código: `/docs` (sirve el YAML del contrato tal cual).
- Mantener el YAML original es más fiel al contrato. Solo hace falta acordar la ruta.

### PLT-03 🟠 Persistencia
- La plantilla trae `TypeOrmModule` con PostgreSQL (`DATABASE_URL`) y `docker-compose.yml` (postgres:16). Nuestro código usa repositorios
  en memoria. Se resuelve junto con NUBE-02.

### PLT-04 🟡 Los DTOs de la plantilla no siguen al pie de la letra el contrato
- Exigen campos que el contrato marca como **opcionales**: `CancelBookingRequest.reason`, y `DateChangeRequest.payment` y `assignedSeats`.
- Activan `forbidNonWhitelisted` en toda la API: rechazan propiedades extra incluso en schemas que el contrato no marca como `additionalProperties: false`.
- Validan fechas con `IsDateString`, que acepta fecha-hora, cuando el contrato pide `format: date`.
- **Nuestro código sigue el contrato** en los tres casos (comprobado por la prueba de conformidad). Si se compara contra la plantilla,
  la diferencia está justificada.

### PLT-05 ⚪ Entidad `Vuelo` y `CreateVueloDto`
- La plantilla incluye un CRUD de vuelos (`aerolinea`, `codigoVuelo`, `precioBase`…) que **no existe en el contrato**. No se expone
  como endpoint. Nuestro catálogo equivalente vive en el GDS simulado.

### PLT-06 ⚪ Estructura interna
- La plantilla usa un único módulo `vuelos` con un controller. Nuestro código usa 7 dominios (search, offers, bookings, post-sale,
  check-in, flight-status, webhooks), como pide `CLAUDE.md`. La integración es por HTTP según el contrato, así que la estructura interna
  no afecta. Solo importan PLT-01 y PLT-02.

---

## 4b. Extensiones fuera del contrato (`EXT`) *(nuevo, V1.D)*

> Endpoints PROPIOS de EcoAirlines, documentados en `contract/ecoairlines-extensions.yaml` y publicados en Swagger aparte
> (`/docs/extensions.json`). El contrato `vuelos-openapi.yaml` no cambia. Sus campos son los de la plantilla del grupo de vuelos
> (`APIVUELOSV1DIEGOCEVALLOS`), para coincidir al integrarse con el booking.

### EXT-01 🟠 Endpoints propios que el booking debe conocer
- `GET/PUT /customers/me` (perfil, scope `ecoairlines:profile`), `PUT /bookings/{bookingId}/seat` (cambio de asiento, `flights:book`),
  `GET /admin/dashboard-stats`, `PUT /admin/flights/{flightNumber}/status`, `GET /admin/flights/{flightNumber}/passengers` y
  `GET /admin/observability` (`ecoairlines:admin`).
- **Impacto:** los scopes `ecoairlines:*` no existen en el authorization server del contrato (`auth.booking-hub.com`); hoy los emite `dev-auth`.
- **Acción:** acordar con el líder de booking si estas rutas pasan al contrato (o a un contrato propio de la aerolínea) y cómo se
  emiten los scopes y el rol de administrador.

### EXT-02 ⚪ La plantilla del grupo no protege la administración
- En la plantilla, `/admin/*` no exige autenticación y `POST /admin/login` compara credenciales fijas y devuelve un token que nadie
  verifica. Aquí se conservan **las rutas y los campos**, pero el acceso exige un JWT con `ecoairlines:admin` (401 sin token, 403 con token
  de cliente) y el login lo hace el servidor de autenticación, no la API.

### EXT-03 🟡 Estado operativo fijado por el administrador
- `GET /flights/{flightNumber}/status` devuelve el estado que fija el administrador, pero el campo `status` de cada `FlightSegment` en la
  búsqueda y en las reservas sigue saliendo del GDS.
- **Acción:** decidir si debe reflejarse también ahí (requiere que search consulte a flight-status: una dependencia nueva entre dominios).

## 5. Documentación y proceso (`DOC`)

### DOC-01 ✅ "25 operaciones" es incorrecto: son 22 *(resuelto el 05/10 en `EcoAirlines.API/README.md`; `vuelos/AUDITORIA.md` ya no existe)*
- Aparece en `CAMBIOS.md` (resultados de las fases 1 y 7), `vuelos/AUDITORIA.md` (AUD-012) y `vuelos/README.md` (tabla de pruebas e2e).
  Las pruebas no usan un número fijo: calculan la lista desde el contrato.

### DOC-02 ✅ Gemini no leerá `AGENTS.md` automáticamente *(resuelto por el supervisor: hoy es `GEMINI.md`, en la raíz)*
- Cambiaste el rol de auditor a **Gemini** en `vuelos/AGENTS.md` (cambio aún sin commit). Gemini CLI carga por defecto **`GEMINI.md`**;
  no hay `GEMINI.md` ni `~/.gemini/settings.json` con `contextFileName`.
- **Impacto:** Gemini auditaría sin las reglas de auditoría.
- **Acción:** crear `GEMINI.md` (o configurar `"contextFileName": ["AGENTS.md"]`). Además, `vuelos/AUDITORIA.md` y `README.md` todavía
  nombran a OpenCode como auditor.

---

## 6. Contrato (`HALL`) — estado verificado contra el código

| ID | Tema | Estado | Qué hace hoy el código (verificado) | Pregunta o propuesta para el contrato | Decisión |
|----|------|--------|-------------------------------------|---------------------------------------|----------|
| HALL-01 | Ruta base | 🔴 Abierto | Rutas en la raíz | **Ampliado en PLT-01** | |
| HALL-02 | `401` no documentado; `403` definido pero sin usar | 🟠 Abierto | `401` sin token/token inválido, `403` sin scope | Documentar `401` y `403` | |
| HALL-03 | Login para el frontend | ✅ Resuelto | `dev-auth/` separado; la API no ganó rutas | — (ver NUBE-03 para la nube) | Permitido (03/10) |
| HALL-04 | Strings sin `maxLength`/`format` | 🟠 Abierto | Body ≤ 100 KB, sin caracteres de control ni `__proto__` | `maxLength`, `format: email`, `minItems` | |
| HALL-05 | Enum `code` sin valores genéricos | 🟠 Abierto | `VALIDATION_FAILED` para 401/403/404/500 | Agregar `UNAUTHORIZED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`… | |
| HALL-06 | `201` frente a `PENDING` | 🟡 Implementado provisional | `201 CONFIRMED`; `202 PENDING_PAYMENT` → `CONFIRMED` | Confirmar el estado del `201` | |
| HALL-07 | `cabinClass` libre en HoldRequest | 🟡 Abierto | Acepta cualquier string; si no existe en la oferta → `422` | Reutilizar el enum | |
| HALL-08 | SSRF en URL de webhooks | 🟠 Implementado provisional | En producción: solo `https` y host público | Documentar la restricción | |
| HALL-09 | `secret` devuelto en GET/POST de webhooks | 🟠 Abierto | Se devuelve (lo exige el schema), filtrado por dueño | `writeOnly: true` | |
| HALL-10 | Nombre de la marca | ✅ Resuelto | EcoAirlines, código `EA` | — | EcoAirlines (03/10) |
| HALL-11 | `404` no documentado en endpoints con `{bookingId}` | 🟠 Abierto | `404` si no existe o es ajena (evita IDOR) | Documentar `404` | |
| HALL-12 | Check-in sin `Idempotency-Key` | ⚪ Informativo | Operación idempotente | — | |
| HALL-13 | Respuestas sin body (`cancel 200`, varios `202`) | 🟡 Abierto | Sin body, como el contrato | Devolver `BookingDetail` | |
| HALL-14 | Inconsistencias menores (versión no SemVer, `limit` sin mínimo…) | 🟡 Abierto | `limit` exige ≥ 1 | Ajustes menores | |
| HALL-15 | `413`/`415` no documentados | 🟡 Abierto | Se responde `400` | Documentar `413`/`415` | |
| HALL-16 | `429` solo en 2 endpoints | 🟠 Abierto | Límite global de 300/min y estricto en search/seatmap | Documentar `429` global | |
| HALL-17 | Header `X-Request-Id` | ⚪ Informativo | En todas las respuestas, no en el body | Documentarlo | |
| HALL-18 | Cotización vencida en `/cancel` | 🟠 Abierto | `409 QUOTE_EXPIRED` | Agregar `410` a `/cancel` | |
| HALL-19 | `POST /bookings` sin `404` | 🟠 Abierto | Hold inexistente o ajeno → `422` | ¿`422` o documentar `404`? | |
| HALL-20 | Errores de posventa no documentados | 🟠 Abierto | `400` itinerario o pasajero ajeno; `409` pagos en baggage | Documentar `400`/`409` | |
| HALL-21 | `DateChangeRequest.assignedSeats` sin `passengerId` | 🟠 Abierto | Asigna en orden a los pasajeros con asiento | Agregar `passengerId` | |
| HALL-22 | Arrays sin `minItems` | 🟡 Abierto | Regla de negocio con `422` | `minItems: 1` | |
| HALL-23 | Significado de `totalBaggage` | 🟡 Abierto | Incluidas + extra | Agregar `description` | |
| HALL-24 | `PaymentReference` sin monto ni uso único | 🟠 Abierto | Mock: formato `pay_…`, uso único; `async`/`declined` simulados | Confirmar con el dominio de pagos | |
| HALL-25 | Edades por tipo de pasajero | 🟡 Abierto | No se valida edad contra tipo; el frontend muestra rangos guía | Documentar rangos | |
| HALL-26 | Sin catálogo de aeropuertos | ⚪ Informativo | El frontend mantiene una lista de 10 | `GET /airports` futuro | |

> El detalle de cada `HALL` (contexto, evidencia y opciones) está en la versión anterior: `git show adb6c48:HALLAZGOS.md`.

---

## 7. Comportamientos esperados (no son fallas)

- **Recargar la página cierra la sesión:** el token vive solo en memoria, por seguridad.
- **Reiniciar la API borra reservas y holds** mientras la persistencia sea en memoria (NUBE-02).
- **Endpoints protegidos en Swagger:** generar un token con `cd vuelos; npm run token` y usarlo en *Authorize* → `DevBearer`.
- **`POST /bookings/{id}/cancel` nunca devuelve `202`:** la cancelación del GDS simulado es síncrona.
