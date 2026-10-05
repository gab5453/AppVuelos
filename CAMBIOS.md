# CAMBIOS — AppVuelos (EcoAirlines)

> **Versión 1 · actualizado el 2026-10-04.** Desde aquí comienza formalmente la **versión 1** de la página.
> Todo cambio se propone en este archivo, se aprueba y solo después se implementa. Lo que no esté aquí **no se hace**.
> Marca cada fase con ✅ (aprobada), ❌ (rechazada) o ✏️ (aprobada con cambios).
> El detalle de la versión 0 (fases 1 a 8, con resultados y desviaciones) está en git: `git show adb6c48:CAMBIOS.md`.

---

## 1. Contexto y reglas de la versión 1

### Requisitos del booking (fase RDA1)
1. **Solo API REST**, tanto el backend como el frontend (el frontend consume únicamente REST). No se implementa gRPC ni GraphQL.
2. **E-commerce de aerolínea por persona**, **desplegado en la nube** (Render, según la plantilla del booking).
3. **Funcionamiento individual primero:** en RDA1 no hay integración entre plataformas. Se sigue el contrato para que la integración
   de RDA2 sea simple.
4. **El contrato no se modifica.** `vuelos/contract/vuelos-openapi.yaml` es idéntico al de la plantilla. Las inconsistencias van a `HALLAZGOS.md`.

### Plantilla del booking (`Vuelos-Integracion-Sistemas-main`)
- Es un **ejemplo estructural**: sus endpoints devuelven `{}`. Lo obligatorio es el contrato.
- Convenciones que marca: prefijo `/api/v1`, Swagger en `/api/docs`, PostgreSQL con TypeORM, `.env` con `DATABASE_URL` y despliegue en Render.
  Las diferencias con nuestro código están en `HALLAZGOS.md` (sección PLT) y requieren decisión.

### Roles
| Rol | Quién | Responsabilidad |
|-----|-------|-----------------|
| Programador principal | Claude | Propone en este archivo, implementa lo aprobado y verifica (tipos, lint, pruebas y prueba en navegador) |
| Auditor técnico | **Gemini** | Audita contra el contrato y sus reglas (`vuelos/GEMINI.md`); registra en `AUDITORIA.md` (raíz) |
| Supervisor | Responsable del proyecto | Aprueba fases, verifica el funcionamiento y decide los hallazgos con el líder de booking |

### Flujo de cada fase (desde la versión 1)
1. **Propuesta** en este archivo → 2. **aprobación** del supervisor → 3. **implementación** en una rama (`feature/...`) →
4. **verificación** (tipos, lint, unitarias, e2e de conformidad con el contrato, prueba en navegador) → 5. **auditoría de Gemini** →
6. **supervisión del funcionamiento** → 7. **commit**, Pull Request y merge a `main`, con una etiqueta de versión cuando corresponda.

---

## 2. Punto de partida: versión 0 (etiqueta `v0.1.0`, commit `adb6c48`)

| Fase | Contenido | Estado |
|------|-----------|--------|
| 1 | Swagger publicado desde el YAML del contrato (`/docs`) y conformidad de rutas | ✅ |
| 2 | JWT verificado (firma, `exp`, `iss`, `aud`, algoritmos), JWKS para producción, propiedad de holds y webhooks | ✅ |
| 3 | Helmet, CORS por lista blanca, límite de peticiones (`429`), límite y `Content-Type` del body, saneamiento, `additionalProperties`, SSRF | ✅ |
| 4 | ProblemDetails uniforme, `X-Request-Id`, logs estructurados sin datos sensibles, validación del entorno al arrancar | ✅ |
| 5 | GDS simulado: búsqueda, holds con cupos y expiración, reservas con tickets, listado, check-in, pases QR, estado de vuelo, posventa | ✅ |
| 6 | Frontend React "eco" (EcoAirlines), `dev-auth` separado, recorrido completo verificado en navegador | ✅ |
| 7 | 126 pruebas unitarias y 96 e2e; **cada respuesta se valida contra los schemas del contrato**; seguimiento de la auditoría (13/13) | ✅ |
| 8 | Monorepo publicado en `github.com/gab5453/AppVuelos` (`.gitignore`, README, revisión de secretos) | ✅ |
| — | `HALLAZGOS.md` y `HALLAZGOS2.md` fusionados y verificados contra el código (este cambio) | ✅ |

**Estado verificado al iniciar la versión 1:**
- El código cumple el contrato: 22 operaciones y todas las respuestas documentadas validadas, salvo `cancel 202`, que no se produce.
- Funciona en local.
- **Todavía no está listo para la nube:** ver los hallazgos NUBE-01 a NUBE-04.

---

## 3. Auditoría de Gemini y fases ejecutadas de la versión 1

### Seguimiento de la auditoría de Gemini (`AUDITORIA.md`, 04/10)

| Hallazgo | Severidad | Estado | Dónde se trata |
|----------|-----------|--------|----------------|
| Acoplamiento: post-sale y check-in usan el repositorio y los ports de bookings | CRITICAL | ✅ Corregido | **V1.A** (abajo) |
| Servicios de aplicación devuelven códigos HTTP (`statusCode: 201 \| 202`) | HIGH | ⏳ Pendiente | Propuesto como V1.B |
| `404` no documentado en endpoints de posventa | MEDIUM | 📋 Ya registrado | HALLAZGOS **HALL-11** (requiere cambio de contrato: lo decide el líder de booking) |
| `202` de `/cancel` documentado pero nunca producido | LOW | 📋 Ya registrado | HALLAZGOS sección 7 y prueba de conformidad (`NOT_PRODUCIBLE`) |
| `/cancel` sin `ForbidUnknownPropertiesGuard` | LOW | ⏳ Pendiente de decisión | Ver nota de V1.B |

### V1.A — División de datos por dominio — ✅ IMPLEMENTADA (04/10, rama `feature/division-datos-por-dominio`)

**Origen:** hallazgo CRITICAL de Gemini. Solicitado por el supervisor: separar ahora **qué datos pertenecen a cada dominio**, para
que al crear las bases de datos de cada microservicio sea evidente qué va en cada una. **No** se separan todavía las bases de datos
ni los procesos: sigue siendo un monolito modular, como permite RDA1.

**Diagnóstico (medido en el código antes del cambio):** `post-sale` y `check-in` **escribían directamente** en el repositorio de reservas
(5 puntos) y leían su estado interno (`booking.internal`) 19 veces. Además usaban los ports de bookings hacia el GDS y la Payment API,
y los check-ins se guardaban **dentro de la reserva**.

**Cambios:**
1. **bookings → API pública `BookingsFacade`** (`bookings/application/bookings.facade.ts`). Es la única forma en que otros dominios
   leen o modifican una reserva:
   - `findOwned`: devuelve un **`BookingSnapshot`**, una copia de solo lectura sin `ownerId`.
   - `recordBaggagePurchase`, `recordSeatAssignments`, `markChangePending`, `applyItineraryChange` y `cancel`.
   - `BookingsModule` ahora **solo exporta** `BookingsFacade` y `BookingOwnershipGuard`. El repositorio y los ports son privados.
2. **check-in, dueño de sus datos:** nuevo `CheckInRepositoryPort`, con su adaptador en memoria. Los check-ins salieron de `booking.internal`.
   Nuevo port propio hacia el GDS (`DepartureControlPort`).
3. **post-sale, con ports propios:** `PostSaleGdsPort` (inventario, asientos, horarios, tarifas, alternativas) y `PostSalePaymentPort`.
   Cancelación, cambio de fecha y maletas modifican la reserva solo mediante la fachada.
4. **Sistemas externos únicos:** la Payment API simulada pasó a `infrastructure/mock-payment/`, igual que el GDS. Así una referencia de
   pago sigue sin poder usarse dos veces, aunque la consulten dominios distintos.
5. **Código compartido sin datos (librería) en `common/`:** asignación de asientos (`common/seating`), errores de pago
   (`common/payments`) y política comercial (`common/policies`, con `MAX_EXTRA_BAGS`).
6. **Prueba de arquitectura** (`src/architecture.spec.ts`): falla si un dominio importa algo que no sea la API pública de otro, o si
   accede a su repositorio o ports. Se comprobó que detecta una violación con un archivo temporal, que luego se eliminó.
7. Cada repositorio indica en su comentario **a qué base de datos futura pertenece**.

**Mapa de propiedad de datos** (guía para crear las bases de datos de cada microservicio):

| Base de datos futura | Dominio dueño | Datos | Quién más los usa y cómo |
|----------------------|---------------|-------|--------------------------|
| `offers` | offers | Holds (oferta, tarifas, pasajeros, precio congelado, estado) | bookings, solo mediante `HoldService` (en microservicios: API de offers) |
| `bookings` | bookings | Reservas: pasajeros, asientos, maletas, tickets, historial, tarifas compradas | post-sale y check-in, solo mediante `BookingsFacade` (en microservicios: API o eventos de bookings) |
| `post-sale` | post-sale | Cotizaciones de cancelación y ofertas de cambio de fecha | Nadie |
| `check-in` | check-in | Check-ins por segmento y pasajero (los pases de abordar se derivan) | Nadie |
| `webhooks` | webhooks | Suscripciones | Nadie |
| — | search, flight-status | Sin datos propios: consultan el GDS | — |
| *Externo* | GDS | Itinerario de vuelos, inventario de cupos, mapa y asignación de asientos | Cada dominio con **su propio port** |
| *Externo* | Payment API | Pagos y referencias ya usadas | bookings y post-sale, cada uno con **su propio port** |
| *Por servicio* | transversal | Claves de idempotencia y contadores de límite de peticiones | Cada servicio la suya (o Redis compartido con prefijo) |

**Dependencias que quedan entre dominios** (verificadas por la prueba de arquitectura): `bookings → offers`, `check-in → bookings`
y `post-sale → bookings`, todas a través de la API pública.

**Verificación:** tipos ✅, lint ✅, unitarias **130/130** ✅ (+3 de arquitectura y el guard ampliado), e2e **96/96** ✅. Incluyen la
conformidad de cada respuesta con el contrato, así que el comportamiento HTTP no cambió. Build ✅. El contrato está intacto (mismo hash).

**Decisiones para revisar:**
- El guard de propiedad sigue en bookings y lo usan post-sale y check-in. En microservicios cada servicio verificaría la propiedad
  llamando a la API de bookings; hoy lo hace a través de la fachada, que es el mismo punto de corte.
- Los pases de abordar se calculan solo con los segmentos actuales de la reserva. Así un check-in de un vuelo reemplazado por un
  cambio de fecha deja de contar sin que post-sale tenga que avisar a check-in (antes se borraba desde post-sale).
- Un cambio de fecha con pago pendiente (`202`) aplica el cambio con la reserva tal como estaba al confirmarlo.
- Pendiente de commit: esperando la **auditoría de Gemini** y tu **supervisión**, según el flujo de la versión 1.

### V1.B — Propuesta (⏳ pendiente de aprobación): servicios sin detalles HTTP
*Origen: hallazgo HIGH de Gemini.*
- Los servicios devolverán un **resultado de negocio**, por ejemplo `{ outcome: 'COMPLETED' | 'PENDING' }`. Cada controller lo
  traducirá al código del contrato (`201`/`202` en reservas, `200`/`202` en maletas y cambio de fecha).
- Hallazgo LOW de `/cancel`: agregar `ForbidUnknownPropertiesGuard` **rechazaría propiedades extra que el contrato permite**, porque
  `CancelBookingRequest` no declara `additionalProperties: false`. Hoy se descartan en silencio, que es lo correcto según el contrato.
  **Recomiendo no aplicarlo** y registrarlo como respuesta a la auditoría.

---

## 4. Plan de la versión 1 — ⏳ PENDIENTE DE APROBACIÓN

> Orden propuesto: primero que **se vea y funcione** (V1.0), luego lo que exige RDA1 para la nube (V1.1 a V1.4) y al final las mejoras (V1.5 y V1.6).
> Cada fase se audita y se commitea por separado.

### V1.0 — Saneamiento del entorno y la documentación
*Resuelve OPS-01, OPS-03 y DOC-01. No toca código de la aplicación.*
- Cerrar los procesos que ocupan los puertos (la API vieja en el 3000 y los servicios de la sesión anterior en 3001, 4000 y 5173), con tu autorización.
- Corregir "25 operaciones" → **22** en `vuelos/README.md` (en `vuelos/AUDITORIA.md` ya no aplica: reemplazada por `AUDITORIA.md`).
- ✅ *Hecho por el supervisor:* `vuelos/AGENTS.md` → `vuelos/GEMINI.md` (resuelve DOC-02) y la nueva `AUDITORIA.md` de Gemini en la raíz.

### V1.1 — Alineación con la plantilla y la ruta base
*Requiere decidir PLT-01 y PLT-02 con el líder de booking.*
- Prefijo global **configurable** (`API_PREFIX`). El valor por defecto será el que decida el líder: `/flights/v1` (contrato) o `/api/v1` (plantilla).
- Ruta de Swagger acordada (`/api/docs` o `/docs`), sirviendo el YAML del contrato tal cual.
- Ajustar el frontend, las pruebas e2e y los README a la nueva ruta. Las pruebas de conformidad garantizan que nada se rompa.

### V1.2 — Persistencia en PostgreSQL
*Resuelve NUBE-02 y PLT-03.*
- TypeORM + PostgreSQL (`DATABASE_URL`), con `docker-compose.yml` para desarrollo local, como la plantilla.
- Adaptadores nuevos detrás de los *ports* existentes: reservas, holds, idempotencia, webhooks y cotizaciones. Sin cambios en controllers ni contrato.
- Se mantiene el adaptador en memoria para las pruebas.

### V1.3 — Preparación del despliegue
*Resuelve NUBE-01, NUBE-03 y NUBE-04.*
- Swagger usable en la nube: servidor "Try it out" con la URL pública (`PUBLIC_API_URL`) y `SWAGGER_ENABLED` configurable. Sigue siendo un overlay en memoria; el contrato no cambia.
- Autenticación en la nube según la decisión de NUBE-03: `dev-auth` desplegado con un secreto real, o el proveedor del booking.
- `Dockerfile`/`render.yaml` para la API, `dev-auth` y el frontend estático, y una guía de variables de entorno por servicio.

### V1.4 — Despliegue en Render y verificación en la nube
- Desplegar la API, PostgreSQL, `dev-auth` y el frontend.
- Verificar con las URLs públicas: Swagger y "Try it out", el recorrido completo en navegador y CORS.
- Documentar las URLs en el README.

### V1.5 — Frontend en Vue *(pendiente de confirmación)*
- Migrar `frontend/` de React a **Vue 3 + TypeScript + Vite + Vue Router + Pinia**, consumiendo solo REST.
- Se reutilizan sin cambios la capa API, los tipos del contrato, las utilidades y los estilos. Se reescriben las páginas y componentes.
- Se hace en una rama propia y reemplaza a React solo cuando pase la misma verificación en navegador.

### V1.6 — Mejoras opcionales
- Emisión real de eventos de webhooks (hoy el despachador es *noop*).
- Resolver los `HALL` que el líder de booking decida (ver `HALLAZGOS.md`, sección 6).

---

## 5. Restricciones permanentes

- **No modificar** `vuelos/contract/vuelos-openapi.yaml`, `vuelos/CLAUDE.md` ni `vuelos/GEMINI.md` sin autorización explícita.
- No subir secretos reales al repositorio: las variables sensibles se configuran en el proveedor de la nube.
- Toda desviación respecto al plan aprobado se registra en la fase correspondiente de este archivo.
