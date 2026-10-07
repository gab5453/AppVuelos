# CAMBIOS — AppVuelos (EcoAirlines)

> **Versión 1 · actualizado el 2026-10-05.** Desde aquí comienza formalmente la **versión 1** de la página.
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
4. **El contrato no se modifica.** `contract/vuelos-openapi.yaml` es idéntico al de la plantilla. Las inconsistencias van a `HALLAZGOS.md`.

### Plantilla del booking (`Vuelos-Integracion-Sistemas-main`)
- Es un **ejemplo estructural**: sus endpoints devuelven `{}`. Lo obligatorio es el contrato.
- Convenciones que marca: prefijo `/api/v1`, Swagger en `/api/docs`, PostgreSQL con TypeORM, `.env` con `DATABASE_URL` y despliegue en Render.
  Las diferencias con nuestro código están en `HALLAZGOS.md` (sección PLT) y requieren decisión.

### Roles
| Rol | Quién | Responsabilidad |
|-----|-------|-----------------|
| Programador principal | Claude | Propone en este archivo, implementa lo aprobado y verifica (tipos, lint, pruebas y prueba en navegador) |
| Auditor técnico | **Gemini** | Audita contra el contrato y sus reglas (`GEMINI.md`); registra en `AUDITORIA.md` (raíz) |
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

### V1.C — Cambio parte 3: arquitectura en 4 capas — ✅ IMPLEMENTADA (05/10, rama `feature/arquitectura-4-capas`, sin commit)

**Origen:** pedido del supervisor. Un compañero del grupo de vuelos compartió su plantilla (`APIVUELOSV1DIEGOCEVALLOS-main`, solución
.NET 9). Se adopta una **estructura de 4 capas**, con el nombre EcoAirlines. No se copia su código: se reorganiza el nuestro.

**Decisión de tecnología (05/10):** se mantiene **NestJS + TypeScript**. Se conservan así la lógica ya validada contra el contrato, la
seguridad y las 226 pruebas. Pasar a .NET implicaba reescribir toda la API.

**Estructura objetivo** (equivalente a `Aerocache.sln` con sus 4 `.csproj`):

```
Reto 1/
├── package.json                  # "solución": workspaces npm de las 4 capas + scripts (build, test, lint)
├── tsconfig.json                 # compila la solución en orden (referencias entre proyectos = ProjectReference)
├── contract/vuelos-openapi.yaml  # contrato (movido sin cambios desde vuelos/contract)
├── EcoAirlines.API/              # REST: controllers, guards, middleware, auth, seguridad, Swagger, main.ts (= Program.cs)
├── EcoAirlines.Business/         # lógica de negocio: services, DTOs, reglas, excepciones
├── EcoAirlines.DataManagement/   # patrón repositorio: interfaces, repositorios y gateways a sistemas externos
├── EcoAirlines.DataAccess/       # datos: entidades, contextos de datos (= DbContext), seed y sistemas externos simulados
├── ecoairlines-web/              # frontend (antes frontend/), igual que aerocache-web
└── dev-auth/                     # autenticación de desarrollo (sin cambios)
```

**Dependencias entre capas** (las mismas referencias que los `.csproj` de la plantilla):

| Capa | Puede usar | Contenido (de dónde sale) |
|------|------------|---------------------------|
| **API** | Business, DataManagement, DataAccess | Controllers, guards y decoradores (de `modules/*/presentation`), auth, seguridad, observabilidad, filtro ProblemDetails, interceptor de idempotencia, Swagger, `main.ts` y `app.module.ts`. El módulo raíz arma las 3 capas, como `Program.cs` |
| **Business** | DataManagement, DataAccess | Services y `BookingsFacade` (de `application/`), DTOs (de `presentation/dto`), reglas de negocio (de `domain/`), `ProblemDetailsException`, validación de DTOs, asignación de asientos y tareas diferidas. `BusinessModule` = `AddBusiness()` |
| **DataManagement** | DataAccess | Interfaces de repositorios y gateways (de `domain/ports`), repositorios en memoria y adaptadores al GDS y a la Payment API (de `infrastructure/`). `DataManagementModule` = `AddDataManagement()` |
| **DataAccess** | — | Entidades (los `*Record`), **un contexto de datos por base de datos futura**, GDS y Payment API simulados, seed de la red de vuelos y tipos base del contrato (dinero, pasajeros). `DataAccessModule` = `AddDataAccess()` |

**Lo que se conserva de V1.A (división de datos):** dentro de cada capa los archivos se agrupan **por dominio** (`services/bookings`,
`repositories/check-in`, etc.). La plantilla usa un único `DbContext` y un `UnitOfWork` con todas las tablas. Aquí hay **un contexto por
base de datos futura** (offers, bookings, post-sale, check-in, webhooks, idempotencia), para no volver a mezclar los datos que separó V1.A.
El `UnitOfWork` se agregará con PostgreSQL (V1.2), uno por base de datos.

**Prueba de arquitectura ampliada:** además de las reglas por dominio de V1.A, falla si una capa usa una capa superior (por ejemplo,
DataAccess importando Business) o si un dominio accede al repositorio, la entidad o el contexto de datos de otro.

**Sin cambios:** el contrato (mismo hash), las rutas, los códigos HTTP, las respuestas y el frontend (solo cambia de carpeta).
`vuelos/CLAUDE.md` y `vuelos/GEMINI.md` pasan a la raíz **sin modificar su contenido**: sus rutas (`contract/vuelos-openapi.yaml`)
siguen siendo válidas.

**Cómo funciona cada capa como "proyecto"** (equivalencias con la plantilla .NET):

| Plantilla (.NET) | EcoAirlines (NestJS) |
|------------------|----------------------|
| `Aerocache.sln` | `package.json` raíz (`workspaces`) + `tsconfig.json` raíz (compila las 4 capas en orden con `tsc -b`) |
| `Aerocache.X.csproj` + `ProjectReference` | `EcoAirlines.X/package.json` (dependencias `@ecoairlines/...`) + `tsconfig.json` (`references`) |
| `using Aerocache.Business.Services;` | `import { ... } from '@ecoairlines/business/services/...'` |
| `DependencyInjection.AddX()` | `XModule` de NestJS en cada capa (`DataAccessModule`, `DataManagementModule`, `BusinessModule`) |
| `Program.cs` | `EcoAirlines.API/src/main.ts` + `app.module.ts` |
| `AerocacheDbContext` (uno) | Un contexto de datos por base de datos futura (`EcoAirlines.DataAccess/src/context/*.context.ts`) |
| `IGenericRepository` / `GenericRepository` | Interfaces por dominio (`DataManagement/src/interfaces/<dominio>`) y repositorios (`repositories/<dominio>`) |
| — | Gateways a sistemas externos (`DataManagement/src/gateways/<dominio>`): GDS y Payment API |

**Resultado (05/10):**
- **166 archivos movidos con `git mv`** (se conserva su historial) y sus imports reescritos de forma automática según el mapa de destino.
  Se eliminaron los 10 módulos NestJS por dominio, reemplazados por un módulo por capa.
- **Cambio de vocabulario:** los *ports* y *adapters* pasan a llamarse **repositorios** y **gateways**, como en el patrón repositorio de la
  plantilla (`HOLD_REPOSITORY_PORT` → `HOLD_REPOSITORY`, `OfferInventoryPort` → `OfferInventoryGateway`, etc.). La única excepción es
  `HoldGatewayPort`, en Business, porque comunica dos dominios (bookings → offers) y será la llamada HTTP entre microservicios.
- **Entidades separadas de las interfaces:** `HoldRecord`, `BookingRecord`, `PurchasedFare`, `CheckInRecord`, `StoredQuote` y
  `WebhookSubscriptionRecord` estaban dentro de los ports; ahora están en `DataAccess/src/entities/<dominio>`.
- **Sin duplicados:** el enum de eventos de webhooks y `HoldStatus` se definen una sola vez, en DataAccess, y los DTOs los reutilizan.
- `frontend/` → **`ecoairlines-web/`** (solo cambio de carpeta y del nombre del paquete).
- `vuelos/` desaparece. `contract/`, `CLAUDE.md` y `GEMINI.md` están en la raíz con **el mismo contenido** (blobs de git idénticos) y el
  contrato conserva su hash (`2f842515…`).
- **Scripts nuevos en la raíz:** `npm run build`, `typecheck`, `start`, `start:dev` (compila en modo watch y reinicia la API), `token`, `test`,
  `test:e2e` y `lint`.
- Documentación actualizada: `README.md`, `EcoAirlines.API/README.md` (con la sección "Arquitectura en 4 capas"; de paso se corrige
  DOC-01: 22 operaciones), `ecoairlines-web/README.md` y las rutas de `HALLAZGOS.md`.

**Verificación (05/10):**
- Tipos ✅ (4 capas + pruebas), lint ✅, build de la solución ✅ (`tsc -b` en orden DataAccess → DataManagement → Business → API).
- Unitarias **133/133** ✅: las mismas 127 de antes, más 6 de la nueva prueba de arquitectura.
- e2e **96/96** ✅, incluida la **conformidad de cada respuesta con el contrato**: el comportamiento HTTP no cambió.
- **Prueba de arquitectura con control negativo:** se crearon 4 archivos que rompían una regla cada uno (DataAccess importando
  Business, post-sale usando el repositorio de reservas, check-in usando el contexto de datos de bookings, código compartido usando un
  service de bookings). Los 4 fueron detectados, y los archivos se eliminaron.
- **API real desde `dist`** (Node resolviendo los paquetes de las capas): Swagger `200`, búsqueda `200`, hold `201`, reserva `201`, el
  asiento elegido queda ocupado en el GDS compartido, y las opciones de maletas y la cotización de cancelación responden `200`.
- **Integración de los 3 procesos:** el JWT emitido por `dev-auth` es aceptado por la API (`200`), CORS permite
  `http://localhost:5173` y `ecoairlines-web` compila y se sirve (`200`). Los procesos se detuvieron al terminar.

**Desviaciones y decisiones para revisar:**
- **Sin `UnitOfWork` ni repositorio genérico** (sí los tiene la plantilla): con datos en memoria no aportan nada, y un `UnitOfWork` con todas
  las tablas mezclaría otra vez los datos de los dominios (el CRITICAL de V1.A). Se propone agregarlos en V1.2 (PostgreSQL), **uno por base
  de datos**.
- **Sin interfaces de services en Business** (`IBookingService` en la plantilla): NestJS inyecta las clases directamente; agregarlas solo
  duplicaría las firmas.
- **Los tipos base del contrato** (dinero, pasajeros, itinerarios) viven en `DataAccess/src/common`, porque es la capa que todas las
  demás pueden usar. Es lo mismo que hace la plantilla con sus entidades.
- **`npm run start:dev`** ya no usa el CLI de Nest, que compila un solo proyecto. Ahora usa `tsc -b -w` + `node --watch` con
  `EcoAirlines.API/scripts/dev.mjs`.
- No se agregaron `Dockerfile` ni `docker-compose.yml` (la plantilla los trae): corresponden a V1.3, todavía sin aprobar.

**Pendiente:** auditoría de Gemini y supervisión del funcionamiento antes del commit, según el flujo de la versión 1.

### V1.D — Cambio parte 4: módulos de cliente y administrador + observabilidad — ✅ IMPLEMENTADA (05/10, sin commit)

**Origen:** pedido del supervisor. El contrato no cubre la administración ni el perfil del cliente, así que se agregan **módulos propios,
fuera del contrato**. Se toman los campos y las funciones de la plantilla del compañero (`APIVUELOSV1DIEGOCEVALLOS-main`), para tener la
misma forma cuando se integre con el booking. La observabilidad se basa en `Ejemplo 1/paginaCristianoRonaldo` y solo la ve un administrador.

**Regla para lo que no está en el contrato:** las 22 operaciones del contrato no cambian. Las rutas nuevas viven bajo `/admin/*` y
`/customers/*`, que el contrato no usa, y se documentan en un **anexo OpenAPI propio** (`contract/ecoairlines-extensions.yaml`) que Swagger
muestra aparte. `vuelos-openapi.yaml` no se toca, y la prueba de Swagger seguirá exigiendo que cada ruta del contrato exista.

#### 1. Lo que hay en la plantilla del compañero (análisis)

| Función | Endpoint de la plantilla | Campos | Observación |
|---------|--------------------------|--------|-------------|
| Login de administrador | `POST /admin/login` | Pide `email`, `password`. Devuelve `success`, `token`, `email`, `name`, `role` | Credenciales fijas en el código y token falso (`AEROCACHE-ADMIN-JWT-<guid>`) que **nadie verifica** |
| Panel de indicadores | `GET /admin/dashboard-stats` | `totalBookings`, `confirmedBookings`, `cancelledBookings`, `totalPassengers`, `totalRevenue`, `totalFlightsToday`, `routeStats[]` (`route`, `flightsCount`, `bookingsCount`, `totalRevenue`), `flightOccupancies[]` (`flightId`, `flightNumber`, `route`, `scheduledDeparture`, `status`, `totalSeats`, `bookedSeats`, `availableSeats`, `occupancyPercentage`), `recentBookings[]` (`BookingDetail` del contrato) | **Sin autenticación**: cualquiera lo consulta. Rutas y ocupación con valores fijos (150 asientos, 74 simulados) |
| Cambiar estado de un vuelo | `PUT /admin/flights/{flightNumber}/status` | Pide `status` (`SCHEDULED`, `BOARDING`, `DEPARTED`, `DELAYED`, `ARRIVED`, `CANCELLED`). Devuelve `FlightStatus` del contrato | Sin autenticación |
| Pasajeros de un vuelo | `GET /admin/flights/{flightNumber}/passengers` | Devuelve `PassengerItem[]` del contrato | Sin autenticación; asiento inventado si falta |
| Cliente: "Mis viajes" | Usa `GET /bookings?pnr=` del contrato | — | Sin token: cualquiera ve una reserva sabiendo el PNR |
| Cliente: cambiar asiento | `PUT /bookings/{bookingId}/seat` | Pide `passengerId`, `newSeatNumber`. Devuelve `bookingId`, `passengerId`, `seatNumber`, `message` | Fuera del contrato, sin autenticación |

La plantilla **no tiene un módulo de cliente propiamente dicho**: el cliente es quien compra y gestiona sus viajes. Los únicos campos de
persona que usa son los de `PassengerItem` del contrato (`firstName`, `lastName`, `documentType`, `documentNumber`, `nationality`,
`birthDate`, `gender`, `contact.email`, `contact.phone`).

#### 2. Lo que se propone implementar (mismos campos, con seguridad)

**Módulo administrador** (dominio nuevo `admin`, solo con token de administrador):

| Endpoint | Campos (iguales a la plantilla) | Cómo se calcula aquí |
|----------|----------------------------------|----------------------|
| `GET /admin/dashboard-stats` | Todos los de `AdminDashboardStatsDto` | Datos reales: reservas mediante `BookingsFacade` (nueva consulta de solo lectura de todas las reservas), ocupación con el inventario del GDS y estado de cada vuelo |
| `PUT /admin/flights/{flightNumber}/status` | `{ status }` → `FlightStatus` | El estado elegido queda como **ajuste operativo** del dominio flight-status (nueva tabla, BD futura `flight-status`). `GET /flights/{n}/status` del contrato lo respeta |
| `GET /admin/flights/{flightNumber}/passengers` | `PassengerItem[]` | Pasajeros de reservas confirmadas que vuelan ese vuelo, con su asiento real |
| `GET /admin/observability` | Ver punto 3 | Métricas del backend |

- **Login del administrador:** como hoy, lo hace `dev-auth` (no la API), con un usuario administrador de desarrollo
  (`admin@ecoairlines.test`). Su JWT lleva el scope propio **`ecoairlines:admin`** y `role: ADMIN`. La respuesta de `/login` agrega los
  campos de la plantilla (`email`, `name`, `role`), para que el frontend reconozca al administrador.
- **Sin token, la API responde `401`; con un token de cliente, `403`.** A diferencia de la plantilla, ningún dato de administración es público.

**Módulo cliente** (dominio nuevo `customers`, con el token del propio cliente):

| Endpoint | Campos | Para qué |
|----------|--------|----------|
| `GET /customers/me` / `PUT /customers/me` | Los mismos de `PassengerItem`, sin `passengerId` ni `passengerType` | Perfil del cliente (BD futura `customers`); el checkout lo usa para **autocompletar** al primer pasajero |
| `PUT /bookings/{bookingId}/seat` | Igual que la plantilla: `{ passengerId, newSeatNumber }` → `{ bookingId, passengerId, seatNumber, message }` | Cambio de asiento: libera el anterior y ocupa el nuevo en el GDS, con las mismas reglas que la reserva (cabina, ocupado, infante) |

"Mis viajes" ya existe con `GET /bookings` del contrato (con token: cada cliente ve solo lo suyo), así que no se duplica.

#### 3. Observabilidad (solo administrador)

Inspirada en el panel de Ejemplo 1 (rendimiento, errores, interacciones, entorno), en dos partes:

- **Backend:** el log de acceso que ya existe alimenta una memoria circular. `GET /admin/observability` devuelve peticiones por ruta y
  status, latencias (promedio y p95), errores 4xx/5xx recientes con su `X-Request-Id`, tiempo encendida y uso de memoria. **Nunca
  incluye** headers, bodies, tokens ni query strings, igual que el log actual.
- **Frontend:** un recolector como `CR7Observability` (tiempos de carga, errores de JS y promesas, recursos que fallan, clics y visibilidad
  de la pestaña), guardado **solo en el navegador** (`localStorage`). No se envía a ningún servidor.
- **Página `/admin/observabilidad`** en `ecoairlines-web`, solo para administradores. Muestra ambas partes y tiene los botones de Ejemplo 1
  (actualizar, evento de prueba, descargar el JSON y limpiar).

#### 4. Encaje en las 4 capas y en la división de datos

- **Dominios nuevos:** `admin` (sin datos propios: consulta los de otros dominios por su API pública) y `customers` (BD futura `customers`).
  flight-status pasa a tener datos propios (los ajustes operativos).
- **Dependencias nuevas entre dominios**, que la prueba de arquitectura documentará: `admin → bookings`, `admin → flight-status`.
- **Frontend:** página de administración (indicadores, vuelos con cambio de estado, pasajeros, observabilidad), perfil del cliente y
  botón "Cambiar asiento" en el detalle de la reserva.
- **Pruebas:** e2e de los endpoints nuevos (sin token `401`, token de cliente `403`, administrador `200`), cambio de asiento y prueba de
  que las 22 operaciones del contrato siguen cumpliendo sus schemas.

**Decisiones del supervisor (05/10):** ✅ aprobada. Módulo cliente = **perfil + cambio de asiento**. Las rutas propias quedan
registradas en HALLAZGOS (**EXT-01 a EXT-03**), para acordarlas con el líder de booking antes de la integración (RDA2).

#### 5. Resultado de la implementación (05/10) — ✅ IMPLEMENTADA, sin commit

**Backend, capa por capa:**
- **DataAccess:**
  - Entidades `CustomerProfileRecord` y `FlightStatusOverride`, con contextos de datos `customers` y `flight-status` (BD futuras).
  - El GDS simulado agrega consultas operativas de solo lectura: vuelos de una fecha, "hoy" en el origen y ocupación por vuelo.
- **DataManagement:**
  - Repositorios de perfiles y de ajustes operativos.
  - `findAll` en el repositorio de reservas.
  - Gateway `FlightOperationsGateway` (vuelos del día, rutas de la red y `segmentId` de un vuelo).
- **Business:**
  - `CustomerProfileService` (dominio customers).
  - `SeatChangeService` (dominio bookings: ocupa el nuevo asiento antes de liberar el anterior, con las mismas reglas que la reserva).
  - `AdminService` (dominio admin, sin datos propios).
  - `FlightStatusService` ahora aplica el ajuste del administrador y lo registra.
  - `BookingsFacade.listAll()` (copias de solo lectura).
  - Check-in muestra en el pase el asiento vigente de la reserva.
- **API:**
  - Controllers `AdminController`, `ObservabilityController`, `CustomerProfileController` y `SeatChangeController`.
  - Scopes propios `ecoairlines:admin` y `ecoairlines:profile`.
  - Métricas HTTP (`HttpMetricsStore` + middleware): guardan el patrón de la ruta, nunca la URL real.
  - CORS permite `PUT`.
  - Swagger con selector entre el contrato y el anexo `contract/ecoairlines-extensions.yaml`.
- **dev-auth:**
  - Administrador de desarrollo `admin@ecoairlines.test` / `EcoAdmin2026`, con `role: ADMIN` y scopes `flights:read flights:webhooks ecoairlines:admin`.
  - Los clientes reciben además `ecoairlines:profile`.
  - Nadie puede registrarse como administrador.
  - `npm run token` incluye los scopes propios.

**Frontend (`ecoairlines-web`):**
- **Sesión con rol:** la sesión conoce el rol (`isAdmin`). `RequireAdmin` protege `/admin` y `/admin/observabilidad`, y el administrador ve su propio menú.
- **Mi perfil (`/mi-perfil`):** autocompleta al primer pasajero en el checkout.
- **Cambiar asiento:** nueva pestaña en el detalle de la reserva.
- **Panel de administración:** indicadores; vuelos de hoy con su ocupación, cambio de estado y pasajeros; rutas; reservas recientes.
- **Observabilidad:**
  - Métricas del backend.
  - Panel del navegador con las secciones de Ejemplo 1: rendimiento, errores JS y de promesas, recursos, clics, visibilidad y JSON.
  - Botones de Ejemplo 1: actualizar, evento de demostración, descargar JSON y limpiar.
  - El recolector (`lib/observability.ts`) guarda solo en `localStorage` y nunca registra el valor de los campos.

**Verificación (05/10):**
- Tipos ✅, lint ✅ (backend y frontend), build ✅ (solución y frontend).
- Unitarias **136/136** ✅: 133 previas + 3 del almacén de métricas.
- e2e **113/113** ✅: 96 previas + 3 de Swagger + 14 de extensiones.
  - Las 22 operaciones del contrato siguen validándose contra sus schemas.
  - Cada respuesta nueva se valida contra el anexo OpenAPI.
  - Toda ruta fuera del contrato debe estar documentada en el anexo, y el anexo no puede redefinir operaciones del contrato.
- **e2e de extensiones:**
  - Permisos: sin token 401, token de cliente 403, administrador 200.
  - Indicadores y pasajeros reflejan una reserva real.
  - El estado fijado por el administrador sale en `GET /flights/{n}/status` del contrato, y DEPARTED guarda la hora real.
  - Perfil: 404 antes de guardarlo, aislado por cliente y con validación de campos.
  - Cambio de asiento: libera el anterior; 409 si está ocupado o es de otra cabina, 422 si es de un infante, 404 si la reserva es ajena; el pase de abordar se actualiza.
  - La observabilidad no contiene PNR, tokens ni ids en las rutas.
- **Prueba de arquitectura:** dominios `customers` y `admin`, y dependencias nuevas `admin → bookings` y `admin → flight-status`, solo por API pública.
- **Procesos reales:**
  - El login de dev-auth devuelve `role` y los scopes de cada rol.
  - Panel: administrador `200`, cliente `403`, sin token `401`.
  - Perfil: el cliente lo guarda (`PUT 200`); el administrador sin ese scope recibe `403`.
  - Preflight CORS de `PUT` permitido; `/docs/extensions.json` `200`.
  - Las páginas `/admin`, `/admin/observabilidad` y `/mi-perfil` se sirven correctamente.
  - Los procesos se detuvieron al terminar.

**Desviaciones respecto a la plantilla (para revisar):**
- **Sin `POST /admin/login` en la API:** el login lo hace el servidor de autenticación (como en el resto del proyecto). La respuesta de
  `/login` incluye los campos de la plantilla (`name`, `email`, `role`) y el `access_token`, que reemplaza a su `token`.
- `PUT /admin/flights/{n}/status` y `GET /admin/flights/{n}/passengers` aceptan `?date=` (opcional, por defecto hoy en el origen),
  porque aquí cada número de vuelo opera a diario.
- `ChangeSeatRequest` agrega `segmentId` (opcional), necesario cuando la reserva tiene varios vuelos; la respuesta agrega `segmentId`.
- `scheduledDeparture` va en ISO 8601 con desfase (como el resto del contrato) y no en `dd/MM/yyyy HH:mm`.
- Los importes del panel (`totalRevenue`) son números, como en la plantilla; los del contrato siguen siendo strings decimales.

---

### V1.E — Cambio parte 5: correcciones del frontend, horario de 91 días y horario de la flota — ✅ IMPLEMENTADA (06/10, sin commit)

**Origen:** revisión del supervisor (06/10), con capturas.

**1. Correcciones del frontend (`ecoairlines-web`):**
- **Selector de pasajeros tapado:** el bloque verde del inicio (`.hero`) tenía `overflow: hidden` y recortaba el desplegable, así que
  solo se veía "Adultos". Ahora no recorta (el fondo SVG se recorta solo) y queda por encima de la sección siguiente.
- **Espacio excesivo en el login:** `.field` tiene `flex: 1 1 160px` para las filas del buscador; dentro de un contenedor en columna
  (login, paneles de la reserva), esos 160 px se volvían altura. Ahí ahora usa `flex: 0 0 auto`.
- **Fecha por defecto:**
  - La ida es **hoy** (antes hoy + 7), la vuelta hoy + 7 y el segundo tramo de multidestino hoy + 7.
  - Si la ida pasa a ser posterior a la vuelta, la vuelta se mueve sola.
  - Los calendarios no permiten fechas después de los 91 días publicados.
- **Login del administrador:** entraba al inicio en vez de `/admin`, por una carrera entre la redirección del login y la del rol.
  Ahora la página redirige según el rol.

**2. Horario generado (`EcoAirlines.DataAccess/src/seed/timetable.ts`), con las pautas del supervisor:**
- **Rutas:** directas **todos con todos** entre los 10 aeropuertos (90 rutas). Elección del supervisor: todos con todos.
- **2 vuelos diarios por ruta y sentido:** una ola de mañana (06:00–08:00) y una de noche (19:00–21:00), en hora local del origen.
  Cada destino sale 15 min después del anterior; por ejemplo, Quito → Lima a las 07:00 y a las 20:00. Son 180 vuelos por día.
- **Horario por día de la semana:** cada vuelo declara los días que opera. Hoy todos operan los 7 días, pero la estructura admite un
  horario distinto para cada día, que se repite cada semana.
- **Ventana de venta de 91 días exactos (13 semanas, múltiplo de 7):**
  - Se reserva desde hoy hasta hoy + 90.
  - Cada día que pasa entra uno nuevo con el horario de su día de la semana; por ejemplo, el martes de la semana 13 repite el horario
    de hoy martes.
  - Fuera de la ventana, la búsqueda no devuelve vuelos y el hold no se acepta.
  - Elección del supervisor: 91 días.
- **Avión según la distancia:** A220-300 (< 1 500 km), A320neo (< 4 500 km) o 787-9.
- **Números de vuelo:** cambian. `EA` + (100 + 20 × origen + 2 × destino + ola) da EA100–EA297; Quito → Bogotá es EA104 y EA105.
  La red anterior (EA200–EA503, fija en `network.ts`) se eliminó.

**3. Plan de flota (`EcoAirlines.DataAccess/src/external/gds/fleet-planner.ts`):**
- **Cómo se calcula:**
  - En cada aeropuerto y tipo de avión, el avión que queda listo (llegada + tiempo en tierra de 35, 45 o 90 min) toma la siguiente
    salida, en orden de llegada, sobre una semana que se repite.
  - Las cadenas resultantes forman ciclos. Un ciclo de `m` semanas necesita `m` aviones, así que **se agregan los aviones que hagan
    falta**: hoy son 100 (26 A220, 42 A320neo y 32 787-9).
  - Por construcción, **ningún avión está en dos lugares a la vez**.
- Un primer intento con simulación semanal no se estabilizaba (los aviones intercambiaban vuelos cada semana); se reemplazó por este
  método exacto.
- **Extensión `GET /admin/fleet-schedule?date=`:**
  - Devuelve cada avión con los vuelos que opera ese día.
  - Solo para administradores; más allá de los 91 días responde `400`.
  - Está documentada en el anexo `contract/ecoairlines-extensions.yaml`.
- **En la página de observabilidad:** nueva sección "Horario de la flota", con calendario, buscador por avión, vuelo o aeropuerto,
  resumen por tipo de avión y los vuelos de cada avión en orden.

**Verificación (06/10):**
- Tipos ✅, lint ✅ (backend y frontend), build ✅.
- Unitarias **143/143** ✅, incluidas las nuevas:
  - El plan de flota se valida durante **98 días seguidos**: cada vuelo tiene avión del tipo correcto, cada avión sale del aeropuerto
    donde aterrizó y después de su tiempo en tierra, y todos los aviones vuelan.
  - Se validan la ventana de 91 días y la repetición por día de la semana.
- e2e **115/115** ✅, con la conformidad con el contrato y 2 nuevas del horario de la flota.
- **Navegador (Edge headless, capturas):**
  - El selector de pasajeros muestra los 4 tipos sin cortarse.
  - El login quedó sin espacios vacíos.
  - El buscador propone hoy y hoy + 7, con máximo hoy + 90.
  - El administrador entra a `/admin` y ve el horario de los 100 aviones.
- **API real:**
  - Una búsqueda para hoy devuelve solo los vuelos que aún no salen.
  - El día 91 tiene vuelos y el 92 no.

**Para revisar:**
- Con rutas directas todos con todos, las conexiones siguen apareciendo, pero después de los 2 vuelos directos.
- Rutas largas sin escala (por ejemplo Cuenca → Madrid o Santiago → Madrid) existen solo porque se pidieron todos con todos.
  Comercialmente se podrían limitar.

### V1.F — Cambio parte 6: asientos vacíos, 3 clientes, horarios variados y filtro por aeropuerto — ✅ IMPLEMENTADA (06/10, sin commit)

**Origen:** pedido del supervisor (06/10). Reemplaza parte de V1.E: las olas fijas de horario y la flota de 100 aviones.

**1. Asientos sin "clientes fantasma":**
- Antes, cada vuelo nacía con un 35–74 % de asientos ocupados por pasajeros simulados.
- Ahora **los vuelos empiezan vacíos**. Solo los que salen en los **7 días siguientes al arranque de la API** tienen una ocupación
  moderada (20–49 %), para observar el mapa de asientos funcionando.
- El corte se fija al primer uso, así que un vuelo vacío **no se llena solo con el paso de los días**. Eso evitaría que un pasajero
  simulado "tome" un asiento que ya eligió un cliente real.

**2. Tres clientes de prueba** (en `dev-auth`):
- `demo@ecoairlines.test` / `EcoDemo2026` (existente).
- `maria@ecoairlines.test` / `EcoMaria2026` (María Torres).
- `luis@ecoairlines.test` / `EcoLuis2026` (Luis Andrade).
- Los tres son CUSTOMER. Se actualizaron el aviso de la página de login y los README.

**3. Horarios más variados** (`timetable.ts`):
- Las 2 olas fijas (06:00–08:00 y 19:00–21:00) se reemplazan por **2 franjas**: mañana (06:00–11:45) y tarde/noche (13:00–21:30).
- Cada franja tiene una lista de horas, y cada ruta toma una hora distinta de cada una, rotando según el aeropuerto de origen. Así hay
  salidas a lo largo de todo el día (11:00, 13:45, 14:30, 15:15, 16:00…) y **ningún aeropuerto repite hora**.
- Ejemplos desde Quito:
  - Bogotá: 07:30 y 14:30.
  - Lima: 09:00 y 16:00.
  - México: 11:00 y 19:30.
- **Flota recalculada:** 97 aviones (19 A220, 40 A320neo y 38 787-9). Sigue validada: ningún avión vuela a dos lugares a la vez.

**4. Filtro por aeropuerto en Observabilidad** (sección "Horario de la flota"):
- Nuevo selector de **aeropuerto** y de qué ver: **llegadas (destino)** por defecto, salidas o ambas.
- Muestra el resumen del aeropuerto (llegadas, salidas y aviones que pasan) y un **tablero ordenado por hora local**.
  - En las llegadas indica el origen y la hora de salida; en las salidas, el destino y la hora de llegada.
  - El tablero también indica el avión de cada vuelo.
  - La tabla de aviones se limita a los que tocan ese aeropuerto.
- El horario es **por fecha de salida**: los vuelos largos que salen ese día aparecen como llegadas de la madrugada siguiente, con
  la fecha indicada.

**Verificación (06/10):**
- Tipos ✅, lint ✅, build ✅.
- Unitarias **145/145** ✅ (+2 de ocupación simulada); e2e **115/115** ✅.
  - La prueba de "asiento ocupado" ahora usa el asiento de otro cliente, no el de un pasajero simulado.
- **API real:**
  - Un vuelo de dentro de 2 días tiene 50 de 122 asientos ocupados; uno de dentro de 30 días, 0.
  - Los 3 clientes inician sesión y sus tokens funcionan en la API.
- **Navegador:** con el administrador, el filtro Madrid → llegadas muestra sus 18 llegadas del día con origen y avión.
- **Nota:** en el puerto 4000 quedó corriendo un `dev-auth` anterior (PID 27468, iniciado a las 13:00 del 06/10), que no detuve por
  no tener certeza de su origen. Hasta reiniciarlo, ese proceso no reconoce a los dos clientes nuevos.

### V1.G — Cambio parte 7: panel admin por fecha, origen o ruta — ✅ IMPLEMENTADA (06/10, sin commit)

**Origen:** pedido del supervisor (06/10). Que el administrador vea cómo se reservan los asientos de los vuelos de cualquier día, por
punto de origen o por ruta. Por defecto, el día en que abre el panel.

**Backend:**
- **Nueva extensión `GET /admin/flights?date=&origin=&destination=`** (scope `ecoairlines:admin`):
  - Devuelve la ocupación de los vuelos de una fecha (por defecto hoy, en Quito).
  - Con `origin`, solo los que salen de ese aeropuerto; con `origin` y `destination`, los de esa ruta.
  - Valida los códigos IATA y responde `400` más allá de los 91 días publicados.
  - Documentada en el anexo OpenAPI.
- **`FlightOccupancy`** conserva los campos de la plantilla y agrega:
  - `date`: fecha local del vuelo.
  - `reservedSeats`: asientos tomados por clientes de EcoAirlines (holds vigentes + reservas).
  - `simulatedSeats`: pasajeros simulados de la primera semana.
  - Se cumple `bookedSeats = reservedSeats + simulatedSeats`.
- `GET /admin/dashboard-stats` reutiliza la misma consulta para "vuelos de hoy".

**Frontend:**
- La pestaña "Vuelos de hoy" pasa a ser **"Vuelos y asientos"** (`AdminFlightsPanel`), con filtros de **fecha** (hoy por defecto, hasta
  hoy + 90), **origen**, **destino (ruta)** y número de vuelo, más un botón "Hoy, todos".
- Resumen de la selección: vuelos, asientos tomados por clientes, simulados, libres y ocupación.
- En la tabla, las columnas "Clientes" y "Simulados" y los vuelos con clientes resaltados.
- El cambio de estado y la lista de pasajeros usan la fecha del vuelo elegido, no siempre hoy.

**Incidente durante la implementación:**
- Al agregar la ruta al anexo, un reemplazo de texto en Node interpretó la secuencia `$'` del patrón `'^[A-Z]{3}$'` como "texto
  después de la coincidencia" y duplicó partes del YAML.
- Se reconstruyó desde el último commit y se reaplicaron los cambios de V1.E y V1.G con inserciones literales. El diff final contiene
  solo lo agregado.

**Verificación (06/10):**
- Tipos ✅, lint ✅, build ✅.
- e2e **118/118** ✅ (+3), que comprueban:
  - por defecto, los 180 vuelos de hoy, con `bookedSeats = reservedSeats + simulatedSeats`;
  - filtro por origen (18 vuelos) y por ruta (2), y que una reserva a 40 días se refleja en su vuelo;
  - códigos y fechas inválidos (`400`) y token de cliente (`403`).
- **Navegador con datos reales:**
  - El administrador abre el panel en "hoy, todos los vuelos".
  - Al elegir 26/10 y Quito → Bogotá ve los 2 vuelos; el vuelo reservado aparece resaltado.
  - "Ver" muestra los pasajeros con su asiento.

### V1.H — Cambio parte 8: horario semanal fijo por avión — ✅ IMPLEMENTADA (06/10, sin commit)

**Origen:** pedido del supervisor (06/10). Los vuelos se repetían cada semana, pero no el avión que los operaba. Ejemplo:
- HC-W01 operaba EA116 UIO → MAD el martes 6/10 y EA216 LIM → MAD el martes 13/10.
- Se pidió un estándar: el mismo día de la semana, el mismo avión hace los mismos vuelos durante las 13 semanas. Además, que una ruta
  nueva se pueda crear con solo origen, destino, día y avión.

**Diseño (`EcoAirlines.DataAccess/src/seed/timetable.ts`, reescrito):**
- **`TimetableBuilder`**:
  - `addAircraft(tipo, base)` da de alta un avión y devuelve su matrícula.
  - `addFlight({ flightNumber, origin, destination, weekday, departureLocal, registration })` agrega un vuelo de un día de la
    semana con su avión. Rechaza aviones inexistentes, rutas inválidas, números de vuelo con otra ruta u hora y un vuelo con dos aviones el mismo día.
  - `build()` valida las rotaciones y lanza "Horario inválido" si algo falla.
- **`validateRotations`** recorre la semana de cada avión como un ciclo: cada vuelo sale de donde aterrizó el anterior, después
  del tiempo en tierra, y el último de la semana deja al avión listo para el primero de la siguiente.
- **Generación automática** con el mismo builder: por cada par de ciudades hay dos líneas de ida y vuelta (una con base en cada
  ciudad). Cada avión hace la ida y su vuelta; en las rutas largas se usan varios aviones que se alternan los días.
- `fleet-planner.ts` queda como una consulta del horario: la matrícula depende solo del número de vuelo y del día de la semana.
- Se mantienen 180 vuelos diarios, todos con todos, 2 por ruta, 7 días.

**Contrapartida:** la flota pasa de 97 a **149 aviones** (26 A220, 56 A320neo y 67 787-9). Cada línea tiene aviones dedicados
que vuelven a su base, en lugar de encadenar vuelos libremente.

**Frontend:** el horario de la flota vuelve a mostrar la base de cada avión y explica el horario semanal fijo.

**Verificación (06/10):**
- Tipos ✅, lint ✅, build ✅.
- Unitarias **147/147** ✅, que comprueban:
  - el mismo avión el mismo día de la semana durante 13 semanas;
  - ningún avión en dos lugares durante 98 días y que todos los aviones vuelan;
  - que el builder acepta una ruta nueva válida y rechaza superposiciones o aviones que no vuelven a su base.
- e2e **118/118** ✅.
- **API real:** HC-W01 (base UIO) hace EA281 MAD → UIO los martes 6/10, 13/10 y 29/12, y EA116 UIO → MAD los miércoles. HC-J01
  hace EA100 UIO → GYE 06:00 y EA121 GYE → UIO 14:30 todos los días.

### V1.I — Cambio parte 9: asientos y equipaje del grupo en un solo panel — ✅ IMPLEMENTADA (06/10, sin commit)

**Origen:** pedido del supervisor (06/10), con Avianca como referencia. Con varios pasajeros, elegir asientos y maletas era
incómodo: cada pasajero tenía su propio mapa y sus propios selectores dentro de su formulario.

**Frontend (solo checkout; no cambia la API ni el contrato):**
- **`pages/checkout/SeatSelectionPanel.tsx`** — "Selección de asientos":
  - una pestaña por tramo, con ✓ cuando todos tienen asiento;
  - la lista de pasajeros a la izquierda (asiento, "Quitar") y el mapa a la derecha;
  - se elige al pasajero y con un clic queda su asiento; luego pasa solo al siguiente sin asiento;
  - en el mapa, los asientos del grupo muestran las iniciales del acompañante y al tocarlos se cambia a ese pasajero;
  - botón "Siguiente tramo".
- **`pages/checkout/BaggageSelectionPanel.tsx`** — "Equipaje adicional":
  - una pestaña por vuelo, los pasajeros con lo que suma cada uno y un contador − / + (máximo 3 por vuelo);
  - lo que incluye la tarifa (artículo personal, mano y bodega, o "no incluido");
  - "Mismo equipaje para todos los vuelos" y el total de todos los vuelos.
- `SeatMapPicker` acepta `companions`, `onCompanionClick` y `showSummary` (opcionales). El cambio de asiento de
  "Mis viajes" sigue igual.
- `CheckoutPage` quita los extras de cada pasajero. El cuerpo de `POST /bookings` (`assignedSeats`, `extraBaggage`) no cambia.

**Verificación (06/10):**
- Lint ✅, build ✅.
- **Navegador con la API real** (3 adultos, UIO ⇄ GYE):
  - 3 clics en el mapa asignan 4E, 5A y 5D a cada pasajero en orden;
  - 2 + 1 maletas suman $105; con "Mismo equipaje para todos los vuelos" suman $210, y el total a pagar se actualiza;
  - la vista móvil (390 px) apila la lista y el detalle sin desbordes.

### V1.J — Cambio parte 10: documento único, edad según el tipo y columna de maletas — ✅ IMPLEMENTADA (06/10, sin commit)

**Origen:** pedido del supervisor (06/10). Al reservar 5 pasajeros LIM → BOG, se aceptaron:
- la misma cédula 5 veces;
- adultos nacidos este año.

Además, en "Mis viajes" la columna "Maletas extra" mostraba un número que se confundía con el total de maletas.

**Backend** (`EcoAirlines.Business/src/rules/bookings/passenger-identity-rules.ts` y `BookingsService.create`):
- **Edad según el tipo**, medida el día del primer vuelo:
  - adulto 15+, joven 12–14, niño 2–11;
  - el infante debe seguir teniendo menos de 2 años el día del último vuelo;
  - la fecha de nacimiento no puede ser posterior al viaje.
- **Documento:**
  - de 5 a 20 letras o dígitos (se ignoran espacios, puntos y guiones);
  - la cédula ecuatoriana (`NATIONAL_ID` + `EC`) se valida con su dígito verificador (módulo 10);
  - no puede vencer antes del último vuelo.
- **Documento único:**
  - no se repite dentro de la reserva (país + número); los nombres sí pueden repetirse (gemelos);
  - la misma persona tampoco puede estar en otra reserva activa del mismo vuelo; las reservas canceladas o fallidas no cuentan.
- Todo responde `422 VALIDATION_FAILED` con el campo en `invalidParams`, sin consumir el hold ni verificar el pago. Ver HALLAZGOS EXT-04.

**Frontend:**
- El checkout aplica las mismas reglas (`lib/passenger-validation.ts`):
  - el error aparece bajo el campo ("Este documento ya lo tiene el pasajero 1.", "Tendrá 0 años el día del vuelo…");
  - el calendario de nacimiento limita las fechas al rango de cada tipo, y la etiqueta lo dice ("15 años o más");
  - no deja pagar mientras haya errores.
- En el detalle de la reserva, la columna pasa a **"Maletas (Extra)"** con el formato `total (extra)`: las incluidas en la tarifa de cada
  vuelo más las extra pagadas. Por ejemplo, 2 incluidas + 2 extra = `4 (2)`. El infante muestra "—".

**Pruebas:**
- El helper de e2e genera un documento único por pasajero y una fecha de nacimiento acorde a su tipo.

**Verificación (06/10):**
- Tipos ✅, lint ✅ (API y web), build ✅.
- Unitarias **161/161** ✅, 14 de ellas de las reglas nuevas.
- e2e **120/120** ✅, 2 nuevas:
  - documento repetido, cédula inválida y adulto recién nacido responden 422; gemelos con distinto documento, 201;
  - la misma persona en otra reserva del mismo vuelo responde 422, y tras cancelar la primera ya puede reservar.
- **Navegador:** 2 adultos con la cédula 1350519375 y uno nacido el 01/01/2026. Aparecen los dos errores bajo los campos y el
  calendario limita a los adultos hasta el 20/10/2011.

### V1.K — Cambio parte 11: CRUD de rutas, eventos (SOA/EDA) y documentación técnica — ✅ IMPLEMENTADA (06/10, sin commit)

**Origen:** pedido del supervisor (06/10), a partir de `CRITERIOS.md`. Hay que cerrar los criterios 2 (CRUD de administración), 8 (eventos)
y 9 (documentación: arquitectura y modelo de datos).

**1. CRUD de rutas programadas (criterio 2):**
- **Horario:**
  - `timetable.ts` arma el horario a partir de **rutas programadas** (`RouteDefinition`: ida y vuelta, días y tipo de avión);
  - `generateRoutes()` crea la red base de 90 rutas;
  - `buildTimetable(routes)` asigna los aviones con `TimetableBuilder` y lanza `TimetableError` si hay conflictos.
- **GDS:** cada instancia guarda su propio horario (antes era una constante global) y `publishRoutes` lo reemplaza. Así, cada prueba
  e2e arranca con el horario base.
- **Datos:**
  - `AdminDataContext` (futura base `schedule`, tabla `scheduled_routes`) y `ScheduledRouteRepository`;
  - `FlightOperationsGateway` suma `publishRoutes`, `aircraftByRoute` y `customerSeatsOn`.
- **`AdminRoutesService`:**
  - valida aeropuertos, alcance del avión (`422`) y vuelos duplicados (`409`);
  - rechaza editar o borrar rutas con cupos vendidos o retenidos (`409`);
  - publica el horario completo en el GDS (`422` si no se puede operar), y solo entonces guarda la ruta.
  - Los números nuevos van desde EA300.
- **Endpoints** (extensión, `ecoairlines:admin`): `GET/POST /admin/routes`, `GET/PUT/DELETE /admin/routes/{routeId}`, documentados en el anexo.
- **Web:** pestaña "Rutas programadas" (`RoutesPanel`):
  - filtro por aeropuerto y formulario con origen, destino, horas, días y avión (automático o elegido);
  - las rutas creadas aparecen primero;
  - "Editar" y "Dar de baja" se deshabilitan si la ruta tiene pasajeros.
  - La pestaña anterior "Rutas" pasa a llamarse "Ventas por ruta".

**2. Eventos de dominio y webhooks (criterio 8):**
- **Bus interno** `DomainEventBus` (código compartido de Business):
  - `publish` / `subscribe`;
  - los consumidores corren después de responder y un fallo no rompe la operación;
  - historial de los últimos 100 eventos con sus entregas.
- **Publicadores (9 eventos del contrato):**
  - `booking.confirmed`, `booking.ticket_issuing`, `booking.ticket_issued` (al crear la reserva o al confirmar un pago pendiente);
  - `booking.changed` (cambio de fecha o de asiento), `booking.baggage_added`, `booking.cancelled` (con `refundAmount`), `booking.checked_in`;
  - `flight.cancelled` y `flight.schedule_changed` (estado de vuelo fijado por el administrador y CRUD de rutas).
- **Dueño de la reserva:** `BookingsFacade.eventSubject` lo entrega solo para publicar. El snapshot de la reserva sigue sin `ownerId`,
  como exige su prueba.
- **`WebhookDeliveryService`:**
  - escucha el bus;
  - entrega los `booking.*` solo a las suscripciones del dueño y los `flight.*` a todas;
  - repite la política anti-SSRF antes de enviar.
- **`HttpWebhookDispatcherGateway`:**
  - POST con `X-EcoAirlines-Event`, `X-EcoAirlines-Delivery` y `X-EcoAirlines-Signature` (`t=…,v1=HMAC-SHA256(secret, "t.cuerpo")`);
  - 3 intentos ante red, `429` o `5xx`;
  - 5 s por intento, sin seguir redirecciones.
- **Variable `WEBHOOK_DELIVERY`:** `http` o `log`. Por defecto, `log` en pruebas; se valida al arrancar.
- **Panel:** `GET /admin/events` (extensión) y la sección "Eventos de dominio y webhooks" en Observabilidad.
- **Corrección OBS-1:** la URL de un webhook debe ser `http(s)://` en todos los entornos (`400`). Antes, en desarrollo, se aceptaba
  `no-es-url`.

**3. Documentación (criterio 9):**
- **`ARQUITECTURA.md`:**
  - componentes, capas y dominios, secuencia de la compra, rutas programadas, eventos y seguridad;
  - **modelo de datos** entidad-relación con 9 bases por dominio.
  - Son 6 diagramas Mermaid.
- **`EVENTOS.md`:**
  - catálogo de los 12 eventos (productor, momento, datos, consumidores, estado), formato, firma con código de verificación,
    reintentos, cómo probarlo y evolución (*outbox*, broker, microservicios);
  - 2 diagramas.
- **`AUDITORIA.md`:** se marca como histórica, con una tabla del estado real de cada hallazgo. El HIGH (V1.B) sigue pendiente.
- **Otros documentos actualizados:** `CRITERIOS.md` (2, 8 y 9 pasan a ✅), `README.md`, `EcoAirlines.API/README.md`, `HALLAZGOS.md`
  EXT-01 y `PRUEBASSW.md`.

**Verificación (06/10):**
- Tipos ✅, lint ✅ (API y web), build ✅.
- Unitarias **168/168** ✅. Las nuevas cubren:
  - rutas programadas en `fleet-planner.spec.ts`;
  - el bus de eventos (orden, aislamiento de un consumidor que falla, historial).
- e2e **130/130** ✅. Las nuevas son:
  - `admin-routes.e2e-spec.ts`: búsqueda, flota y estado de vuelo ven la ruta nueva; validaciones `400`/`409`/`422`; edición; baja;
    bloqueo con pasajeros;
  - `events.e2e-spec.ts`: un suscriptor local verifica la firma HMAC, el filtrado por dueño, `flight.*` a todos, 3 reintentos ante
    `503`, `/admin/events` y la URL sin esquema.
- **Los 8 diagramas Mermaid** se dibujaron sin errores con mermaid 11.
- **Navegador con la pila completa:**
  - se creó la ruta GYE ⇄ MDE (EA300/EA301, avión HC-J27) y quedó primera en la lista;
  - un A220 a Madrid muestra el error de alcance;
  - una reserva, su cancelación y un vuelo cancelado llegaron a un suscriptor externo (4 eventos `DELIVERED`, firma
    `t=…,v1=…`) y aparecen en Observabilidad.

**Pendiente:**
- Base de datos real (criterio 5): las rutas y los webhooks siguen en memoria.
- Despliegue (criterio 1).
- Eventos `hold.expired`, `booking.failed` y `booking.ticket_failed`: diseñados en `EVENTOS.md`.

### V1.L — Cambio parte 12: dev-auth desde Swagger y CRUD de la flota — ✅ IMPLEMENTADA (06/10, sin commit)

**Origen:** preguntas del supervisor (06/10):
- dónde se guardan los clientes;
- por qué no se pueden crear desde Swagger;
- cómo darse permisos en Swagger;
- si se deben poder agregar aviones.

Se decidió:
- **Swagger:** puede llamar a dev-auth sin que la API gane lógica de autenticación.
- **Flota:** CRUD de aviones.
- **Tipos de avión:** solo consulta, porque definen el mapa de asientos.

**1. dev-auth en Swagger (solo desarrollo):**
- `dev-auth/openapi.yaml` documenta `POST /register`, `POST /login` y `GET /health`, con ejemplos: cliente, administrador y contraseña
  incorrecta.
- La API lo publica como tercer documento del selector (`/docs/dev-auth.json`), con `servers` = `DEV_AUTH_URL` (por defecto
  `http://localhost:4000`). En producción no se publica.
- "Try it out" llama directamente a dev-auth desde el navegador:
  - el CORS de dev-auth admite por defecto `http://localhost:3000`;
  - la CSP de `/docs` agrega `connect-src` a dev-auth fuera de producción.
- **La API no gana rutas ni lógica de autenticación**: el contrato delega el registro y el login a un servidor OAuth2 externo.

**2. CRUD de la flota:**
- **Horario** (`timetable.ts`):
  - `buildTimetable(routes, fleet)` recibe la flota registrada;
  - una ruta puede indicar `aircraft` (sus aviones, en orden), que deben ser del tipo de la ruta, tener base en el origen y alcanzar
    para los días (si no, `TimetableError` dice cuántos hacen falta);
  - con `autoAddAircraft` agrega los que falten;
  - un avión sin vuelos ya no es error: queda disponible;
  - las matrículas nuevas no repiten las existentes.
  - El reparto de días se separó en `planRoundTrips` (cuántos aviones hacen falta) y `assignRoundTrips` (con cuáles).
  - Se exportan `AIRCRAFT_MAX_ROUTE_KM` y `REGISTRATION_PREFIX`.
- **Datos:**
  - `AdminDataContext.aircraft` (futura tabla `aircraft`) y `AircraftRepository`;
  - las rutas guardan sus aviones (`ScheduledRouteRecord.aircraft`, futura tabla `route_aircraft`);
  - la red base arranca con sus 149 aviones y las rutas con sus aviones fijos. La reconstrucción da el mismo horario: hay una prueba
    que lo comprueba.
- **`SchedulePublisher`:** publica en el GDS rutas y flota en cada cambio (`422` si no se puede operar) y guarda en la flota los aviones
  que el horario agregó solos.
- **`AdminFleetService`:**
  - `GET /admin/aircraft-types` (asientos por cabina, alcance, tiempo en tierra, cuántos hay);
  - `GET/POST /admin/aircraft`: la matrícula es la siguiente libre del tipo, p. ej. HC-J27;
  - `GET/PUT/DELETE /admin/aircraft/{registration}`: cambiar base o retirar, solo si no opera rutas (`409`).
- **Rutas** (`POST/PUT /admin/routes`) aceptan `aircraft` (matrículas):
  - el tipo se deduce del primer avión si no se indica;
  - al editar sin elegir, se conservan los aviones que siguen sirviendo y se agregan los que falten.
- **Web:**
  - pestaña **"Flota"** (`FleetPanel`): tarjetas por tipo, registro, filtros por base y tipo, "solo disponibles", cambiar base y
    retirar (deshabilitado si el avión opera rutas);
  - en "Rutas programadas", el formulario muestra los aviones del tipo con base en el origen y su estado (disponible, N rutas,
    esta ruta) para elegirlos;
  - si no se elige ninguno, se asignan solos.
- **Documentación:** anexo OpenAPI (rutas nuevas, schemas `Aircraft`, `AircraftTypeInfo`, campo `aircraft`), `ARQUITECTURA.md` (tablas
  AIRCRAFT y ROUTE_AIRCRAFT), `CRITERIOS.md`, `PRUEBASSW.md` (token desde dev-auth en Swagger y casos de flota), `HALLAZGOS.md` EXT-01 y
  `EcoAirlines.API/README.md`.

**Verificación (06/10):**
- Tipos ✅, lint ✅ (API y web), build ✅.
- Unitarias **173/173** ✅. Las 5 nuevas cubren:
  - la red base reconstruida es idéntica;
  - avión elegido y avión libre;
  - avión compartido entre dos rutas (válido si encaja, `TimetableError` si se superpone);
  - aviones insuficientes, de otra base, de otro tipo o inexistentes;
  - matrículas sin repetir.
- e2e **137/137** ✅, con 7 nuevas:
  - `admin-fleet.e2e-spec.ts` (5): tipos y flota base; alta con HC-N57; ruta con el avión elegido; bloqueos `409`; errores `422`; aviones
    automáticos;
  - `swagger.e2e-spec.ts` (2): el documento de dev-auth y la CSP en desarrollo, y su ausencia en producción.
- Diagramas Mermaid: 8/8 se dibujan.
- **Navegador:**
  - desde Swagger, `POST /login` de dev-auth respondió `200` con el token, y con contraseña incorrecta `401`;
  - en el panel se registró HC-J27 (A220, UIO) y se creó UIO ⇄ CUE eligiéndolo: "Ruta creada… con HC-J27".

### V1.M — Cambio parte 13: PostgreSQL y preparación para Azure — ✅ IMPLEMENTADA (06/10, sin commit)

**Origen:** pedido del supervisor (06/10): subir el proyecto a Azure con la web, la API, PostgreSQL y dev-auth
(`DESPLIEGUE_AZURE.md`). También cierra el criterio 5 (base de datos) y los hallazgos NUBE-01 a NUBE-04.

**1. PostgreSQL (criterio 5):**
- **Tablas** (`DataAccess/src/database`):
  - `PersistentTable` se usa como un `Map`: los repositorios no cambian y las lecturas son en memoria;
  - con `DATABASE_URL`, cada `set`/`delete` se escribe en PostgreSQL, en orden, en `<esquema>.<tabla>` (`id text`, `data jsonb`,
    `updated_at`);
  - `DatabaseService` crea esquemas y tablas, carga las filas al arrancar, aplica los datos iniciales si la tabla está vacía y espera
    las escrituras pendientes al apagar.
  - Sin `DATABASE_URL`, todo sigue en memoria (desarrollo y pruebas).
- **Esquemas:** un esquema por base de datos del diseño: `bookings`, `offers`, `post_sale`, `check_in`, `customers`, `flight_status`,
  `webhooks`, `idempotency`, `schedule` (rutas y flota), más `gds` y `payment` para los sistemas externos simulados. En total
  15 tablas.
- **Sistemas simulados:** el GDS persiste cupos, asientos asignados y el inicio de la ocupación simulada, para que tras un reinicio
  coincidan con las reservas. La Payment API persiste las referencias usadas. Al arrancar, `SchedulePublisher` vuelve a publicar
  el horario guardado.
- **Decisión:** cada agregado es un documento JSONB (reserva con pasajeros y boletos, hold con sus selecciones…). La memoria es
  la copia de trabajo, así que la API corre como **una sola instancia**.
- **Fechas:** `revive` convierte de nuevo a `Date` los campos de fecha que JSON guarda como texto (holds, cotizaciones,
  idempotencia).
- Driver: `pg` (sin ORM).

**2. dev-auth en la nube:**
- con `DATABASE_URL` guarda las cuentas en `auth.users` (se cargan al arrancar y cada registro se guarda antes de responder);
- los usuarios de prueba tienen un `sub` fijo derivado del correo, así sus reservas siguen siendo suyas tras un reinicio;
- `ADMIN_PASSWORD` cambia la clave del administrador;
- en Azure (`WEBSITE_SITE_NAME`) se niega a arrancar sin un `AUTH_JWT_SECRET` propio de al menos 32 caracteres.

**3. Swagger en la nube:**
- con `PUBLIC_API_URL`, el overlay también funciona en producción: servidor público y esquema de token para Authorize;
- el documento de dev-auth usa `DEV_AUTH_URL`, y la CSP de `/docs` admite esa URL;
- ambas variables se validan al arrancar (http(s), y https en producción).

**4. Web:** `public/staticwebapp.config.json`, para que una recarga en una ruta interna devuelva `index.html`, más cabeceras de
seguridad.

**5. GitHub Actions:**
- `azure-static-web-apps-….yml`: compila con Node 24, lint y las URLs públicas (`VITE_*`), y sube `dist`.
- `deploy-api.yml`:
  - `npm ci`, tipos, lint, unitarias y e2e;
  - `npm prune --omit=dev` y paquete con `node_modules` (enlaces de los workspaces copiados), el `dist` de las 4 capas y los
    contratos;
  - `azure/webapps-deploy`.
- `deploy-auth.yml`: `npm ci --omit=dev` y despliegue de `dev-auth`.
- Cada flujo corre solo si cambió su parte.

**Verificación (06/10):**
- Tipos ✅, lint ✅ (API y web), build ✅.
- Unitarias **174/174** ✅ (+1: validación de `PUBLIC_API_URL` y `DEV_AUTH_URL`).
- e2e **137/137** ✅ en memoria, más **`persistence.e2e-spec.ts`** con PostgreSQL 16 en Docker (`TEST_DATABASE_URL`):
  - se crean avión, ruta, reserva con asiento, perfil y webhook;
  - se apaga la API y se vuelve a levantar;
  - todo sigue: la reserva, el asiento ocupado en el GDS, la ruta a la venta, el avión en servicio, el perfil, el webhook, y la
    referencia de pago usada se rechaza.
- **dev-auth con PostgreSQL:** un cliente registrado y el usuario de prueba inician sesión tras reiniciar con el **mismo `sub`**;
  registrar el mismo correo responde `409`. Sin base sigue en memoria; en Azure sin secreto propio se niega a arrancar.
- **Paquete de la API simulado como en GitHub Actions** (60 MB, sin TypeScript) y ejecutado con `NODE_ENV=production` y las
  variables de Azure: conecta con PostgreSQL (15 tablas, 90 rutas y 149 aviones cargados), Swagger con la URL pública y token, CSP
  con dev-auth, y la búsqueda responde.

**Pendiente (del supervisor, en Azure):**
- corregir `DATABASE_URL`;
- `SCM_DO_BUILD_DURING_DEPLOYMENT=false`;
- variables nuevas de dev-auth;
- secretos de publicación en GitHub;
- primera ejecución de los workflows.

---

## 4. Plan de la versión 1 — ⏳ PENDIENTE DE APROBACIÓN

> Orden propuesto: primero que **se vea y funcione** (V1.0), luego lo que exige RDA1 para la nube (V1.1 a V1.4) y al final las mejoras (V1.5 y V1.6).
> Cada fase se audita y se commitea por separado.

### V1.0 — Saneamiento del entorno y la documentación
*Resuelve OPS-01, OPS-03 y DOC-01. No toca código de la aplicación.*
- Cerrar los procesos que ocupan los puertos (la API vieja en el 3000 y los servicios de la sesión anterior en 3001, 4000 y 5173), con tu autorización.
- ✅ *Hecho en V1.C:* "25 operaciones" → **22** en `EcoAirlines.API/README.md` (antes `vuelos/README.md`).
- ✅ *Hecho por el supervisor:* `vuelos/AGENTS.md` → `vuelos/GEMINI.md` (resuelve DOC-02) y la nueva `AUDITORIA.md` de Gemini en la raíz.

### V1.1 — Alineación con la plantilla y la ruta base
*Requiere decidir PLT-01 y PLT-02 con el líder de booking.*
- Prefijo global **configurable** (`API_PREFIX`). El valor por defecto será el que decida el líder: `/flights/v1` (contrato) o `/api/v1` (plantilla).
- Ruta de Swagger acordada (`/api/docs` o `/docs`), sirviendo el YAML del contrato tal cual.
- Ajustar el frontend, las pruebas e2e y los README a la nueva ruta. Las pruebas de conformidad garantizan que nada se rompa.

### V1.2 — Persistencia en PostgreSQL
*Resuelve NUBE-02 y PLT-03.*
- TypeORM + PostgreSQL (`DATABASE_URL`), con `docker-compose.yml` para desarrollo local, como la plantilla.
- Tras V1.C: cada contexto de `EcoAirlines.DataAccess` pasa a ser una conexión (una base de datos por dominio) y se agregan repositorios
  PostgreSQL en `EcoAirlines.DataManagement` detrás de las interfaces existentes, con un `UnitOfWork` por base de datos. Business, los
  controllers y el contrato no cambian.
- Se mantienen los repositorios en memoria para las pruebas.

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
- Migrar `ecoairlines-web/` de React a **Vue 3 + TypeScript + Vite + Vue Router + Pinia**, consumiendo solo REST.
- Se reutilizan sin cambios la capa API, los tipos del contrato, las utilidades y los estilos. Se reescriben las páginas y componentes.
- Se hace en una rama propia y reemplaza a React solo cuando pase la misma verificación en navegador.

### V1.6 — Mejoras opcionales
- Emisión real de eventos de webhooks (hoy el despachador es *noop*).
- Resolver los `HALL` que el líder de booking decida (ver `HALLAZGOS.md`, sección 6).

---

## 5. Restricciones permanentes

- **No modificar** `contract/vuelos-openapi.yaml`, `CLAUDE.md` ni `GEMINI.md` sin autorización explícita (desde V1.C están en la raíz).
- No subir secretos reales al repositorio: las variables sensibles se configuran en el proveedor de la nube.
- Toda desviación respecto al plan aprobado se registra en la fase correspondiente de este archivo.
