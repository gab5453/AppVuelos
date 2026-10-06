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
