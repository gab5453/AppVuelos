# ARQUITECTURA — AppVuelos / EcoAirlines

Documento técnico de la solución: componentes, capas, flujo de una compra, modelo de datos y eventos. Los diagramas están en
**Mermaid**: GitHub (y VS Code con la extensión de Mermaid) los dibujan directamente.

| Documento relacionado | Contenido |
|-----------------------|-----------|
| [`contract/vuelos-openapi.yaml`](contract/vuelos-openapi.yaml) | Contrato de la API (fuente de verdad) |
| [`contract/ecoairlines-extensions.yaml`](contract/ecoairlines-extensions.yaml) | Endpoints propios fuera del contrato |
| [`EVENTOS.md`](EVENTOS.md) | Catálogo y diseño de eventos (SOA/EDA) |
| [`EcoAirlines.API/README.md`](EcoAirlines.API/README.md) | Detalle de configuración, seguridad y pruebas |
| [`PRUEBASSW.md`](PRUEBASSW.md) | Guía de pruebas en Swagger |

---

## 1. Componentes

```mermaid
flowchart LR
  subgraph Clientes
    U[Cliente / Administrador<br/>navegador]
    BH[Booking central del grupo<br/>u otro sistema B2B]
  end

  subgraph Web["ecoairlines-web (React + Vite)"]
    UI[Marketplace y panel admin]
  end

  AUTH["dev-auth<br/>(emite JWT; en producción:<br/>proveedor OAuth2 real)"]

  subgraph API["API EcoAirlines (NestJS, 4 capas)"]
    direction TB
    L1["EcoAirlines.API<br/>controllers · JWT/scopes · ProblemDetails<br/>idempotencia · rate limit · Swagger"]
    L2["EcoAirlines.Business<br/>servicios · reglas · DTOs<br/>bus de eventos"]
    L3["EcoAirlines.DataManagement<br/>repositorios · gateways"]
    L4["EcoAirlines.DataAccess<br/>entidades · contextos de datos<br/>sistemas externos simulados"]
    L1 --> L2 --> L3 --> L4
  end

  subgraph Externos["Sistemas externos (hoy simulados)"]
    GDS[(GDS<br/>vuelos · cupos · asientos)]
    PAY[(Payment API<br/>referencias de pago)]
  end

  DB[("Datos por dominio<br/>hoy en memoria · destino: PostgreSQL")]
  SUB[Suscriptores de webhooks]

  U --> UI
  UI -- "login" --> AUTH
  UI -- "HTTPS + JWT" --> L1
  BH -- "HTTPS + JWT (contrato)" --> L1
  L1 -. "verifica firma del JWT" .-> AUTH
  L4 --> GDS
  L4 --> PAY
  L4 --> DB
  L3 -- "POST firmado (HMAC)" --> SUB
```

| Componente | Tecnología | Responsabilidad |
|------------|------------|-----------------|
| `ecoairlines-web` | React 19, Vite 8, TypeScript | Marketplace (búsqueda, compra, postventa, check-in) y panel de administración |
| `dev-auth` | Node sin dependencias | Simula el servidor OAuth2 del contrato: registro, login y JWT con scopes según el rol. Su documento OpenAPI (`dev-auth/openapi.yaml`) aparece en el selector de Swagger de la API, solo en desarrollo, para registrarse e iniciar sesión desde ahí |
| API EcoAirlines | NestJS 12, Node 24, TypeScript | Implementa las 22 operaciones del contrato y las extensiones propias |
| GDS simulado | `MockGdsService` | Horario publicado, búsqueda, precios, cupos, asientos, estado de vuelo |
| Payment API simulada | `MockPaymentApiService` | Verifica referencias de pago (aprobado, pendiente o rechazado). La API nunca ve tarjetas |
| Datos | Contextos de datos en memoria | Un contexto por base de datos futura (sección 5) |
| Webhooks | `HttpWebhookDispatcherGateway` | Entrega los eventos a los sistemas suscritos (sección 6) |

---

## 2. Capas de la API

Cada capa es un *workspace* npm (como un proyecto `.csproj` en una solución .NET) y **solo usa las capas inferiores**:

```mermaid
flowchart TB
  A["EcoAirlines.API — HTTP"] --> B["EcoAirlines.Business — negocio"]
  B --> C["EcoAirlines.DataManagement — acceso a datos (interfaces)"]
  C --> D["EcoAirlines.DataAccess — entidades y sistemas externos"]
```

| Capa | Carpetas | Ejemplo |
|------|----------|---------|
| API | `controllers/<dominio>`, `auth`, `middleware`, `interceptors`, `security`, `docs`, `observability` | `BookingsController` recibe `POST /bookings`, valida el DTO y decide `201` o `202` |
| Business | `services/<dominio>`, `rules`, `dto`, `exceptions`, `common/events` | `BookingsService.create`: valida el hold, los pasajeros y el pago, y asigna asientos |
| DataManagement | `interfaces/<dominio>`, `repositories/<dominio>`, `gateways/<dominio>` | `BookingRepository` (interfaz) y su implementación en memoria |
| DataAccess | `entities/<dominio>`, `context`, `external/gds`, `external/payment`, `seed` | `BookingRecord`, `BookingsDataContext`, `MockGdsService`, `timetable.ts` |

### Dominios

| Dominio | Del contrato | Responsabilidad |
|---------|:------------:|-----------------|
| search | ✅ | Búsqueda y mapa de asientos |
| offers | ✅ | Holds: cupo y precio congelados por 15 min |
| bookings | ✅ | Reservas, emisión de boletos, listado; fachada pública para los demás |
| post-sale | ✅ | Maletas, cambio de fecha, cancelación |
| check-in | ✅ | Check-in y pases de abordar |
| flight-status | ✅ | Estado operativo del vuelo |
| webhooks | ✅ | Suscripciones y entrega de eventos |
| customers | Extensión | Perfil del cliente |
| admin | Extensión | Panel: indicadores, ocupación, flota, estado de vuelos, **CRUD de rutas programadas**, eventos |

**Reglas que verifica `EcoAirlines.API/test/architecture.spec.ts`:**
- Ninguna capa importa una superior.
- Un dominio no toca los repositorios, gateways, entidades ni contextos de otro: solo su API pública (`BookingsFacade`, `HoldService`,
  `FlightStatusService`).
- Dependencias permitidas: `admin → bookings`, `admin → flight-status`, `bookings → offers`, `check-in → bookings`,
  `post-sale → bookings`.
- El código compartido (`common/`, como el bus de eventos) no depende de ningún dominio.

---

## 3. Flujo de una compra

```mermaid
sequenceDiagram
  autonumber
  actor C as Cliente
  participant W as ecoairlines-web
  participant A as dev-auth
  participant API as API (controllers)
  participant B as Business (servicios)
  participant G as GDS
  participant P as Payment API
  participant E as Bus de eventos
  participant S as Suscriptor (webhook)

  C->>W: Buscar UIO → BOG
  W->>API: POST /search (X-Device-Fingerprint)
  API->>B: CatalogService
  B->>G: itinerarios, precios y cupos
  API-->>W: 200 ofertas
  C->>W: Elegir tarifa
  W->>A: POST /login
  A-->>W: JWT (scopes según el rol)
  W->>API: POST /offers/hold + JWT + Idempotency-Key
  B->>G: retener cupos
  API-->>W: 201 holdId (vence en 15 min)
  C->>W: Pasajeros, asientos, maletas y referencia de pago
  W->>API: POST /bookings + JWT + Idempotency-Key
  B->>B: validar hold, pasajeros (edad, documento único), maletas
  B->>P: verificar paymentReference y monto
  B->>G: asignar asientos y consumir el hold
  B->>E: booking.confirmed, booking.ticket_issued
  API-->>W: 201 reserva CONFIRMED con boletos
  E-)S: POST firmado (después de responder)
```

**Si el pago queda pendiente** (`pay_async_…`), `POST /bookings` responde **202 `PENDING_PAYMENT`** y publica
`booking.ticket_issuing`. Un proceso diferido confirma la reserva y publica `booking.confirmed` y `booking.ticket_issued`.

**Garantías del flujo:**
- **El dueño sale del JWT:** el `sub` del token es el dueño del hold y de la reserva. El body nunca lo decide.
- **Idempotencia:** la misma `Idempotency-Key` devuelve la misma respuesta sin duplicar la reserva ni el cobro.
- **Orden de los pasos:** nada se consume ni se asigna si una validación previa falla.
- **Errores:** todos salen en formato `ProblemDetails` con el `code` del contrato.

---

## 4. Horario de vuelos y rutas programadas

- **Rutas programadas.** Cada una es una línea de ida y vuelta con sus días y su tipo de avión. Al arrancar hay **90 rutas de la red
  base**: todos los aeropuertos conectados con todos, con 2 vuelos diarios por sentido. El administrador puede **crear, editar y dar
  de baja** rutas desde el panel (`/admin/routes`).
- **`buildTimetable(routes)`** (`DataAccess/seed/timetable.ts`):
  - convierte las rutas en el horario semanal, vuelo por vuelo;
  - asigna aviones dedicados con base en el origen;
  - valida que ningún avión esté en dos lugares a la vez y que todos vuelvan a su base al cerrar la semana.
- **Publicación.** El horario se publica en el GDS, que vende **91 días** (13 semanas exactas) desde hoy. Cada día entra uno nuevo.
- **Rutas con pasajeros.** No se editan ni se dan de baja (`409`). Para esos vuelos se usa el estado operativo (`CANCELLED`, `DELAYED`).
- **Flota** (`/admin/aircraft`):
  - el administrador registra aviones (tipo y base; la matrícula se asigna sola), cambia su base o los retira (solo si no operan
    rutas);
  - al crear o editar una ruta puede **elegir los aviones**: deben ser del tipo de la ruta, tener base en el origen y alcanzar para
    los días elegidos;
  - si no elige, se conservan los que ya tenía y se agregan aviones nuevos a la flota si faltan.
- **Tipos de avión.** Son datos maestros (mapa de asientos, alcance, tiempo en tierra): se consultan en `/admin/aircraft-types`, no se
  editan.

```mermaid
flowchart LR
  ADM[Administrador] -- "POST/PUT/DELETE /admin/routes" --> RS[AdminRoutesService]
  RS -- "1" --> VAL["Validar: aeropuertos, alcance del avión,<br/>vuelos duplicados, rutas con pasajeros (409)"]
  RS -- "2 · publica el horario completo" --> GW[FlightOperationsGateway] --> GDS[("GDS: buildTimetable<br/>(422 si un avión quedaría en dos lugares)")]
  RS -- "3 · guarda la ruta" --> REPO[(scheduled_routes)]
  RS -- "4 · flight.schedule_changed" --> BUS[Bus de eventos]
```

---

## 5. Modelo de datos

**Estado actual:** los datos viven en memoria, en un **contexto de datos por dominio** (`DataAccess/src/context`). Cada contexto
equivale a una **base de datos futura**, y su dominio es el único que la usa. El diagrama muestra el **modelo relacional objetivo**
(PostgreSQL).

- **Dentro de un contexto:** relaciones normales con claves foráneas.
- **Entre contextos:** solo referencias por id (líneas punteadas). No hay claves foráneas entre bases distintas, para poder separar
  cada dominio como microservicio.

```mermaid
erDiagram
  %% bookings
  BOOKING {
    uuid booking_id PK
    string owner_id "sub del JWT"
    string pnr UK
    string status "CONFIRMED, PENDING_PAYMENT, CANCELLED..."
    decimal grand_total
    string currency
    string hold_id "ref. offers.HOLD"
    timestamp created_at
    timestamp updated_at
  }
  PASSENGER {
    string booking_id FK
    string passenger_id "p1, a1..."
    string passenger_type "ADULT, YOUTH, CHILD, INFANT"
    string associated_adult_id
    string first_name
    string last_name
    string document_type
    string document_number
    string nationality
    date birth_date
    string email
    string phone
  }
  SEAT_ASSIGNMENT {
    string booking_id FK
    string passenger_id FK
    string segment_id "EA104-20261201"
    string seat_number
  }
  EXTRA_BAGGAGE {
    string booking_id FK
    string passenger_id FK
    string itinerary_id
    int quantity
  }
  PURCHASED_FARE {
    string booking_id FK
    string itinerary_id
    string cabin_class
    string fare_brand
    decimal price
  }
  TICKET {
    uuid ticket_id PK
    string booking_id FK
    string passenger_id FK
    string e_ticket_number
    string status "ISSUED, PENDING, VOIDED, REFUNDED..."
    timestamp issued_at
  }
  TICKET_COUPON {
    uuid ticket_id FK
    string segment_id
    string status
    string coupon_number
  }
  BOOKING_CHANGE {
    string booking_id FK
    timestamp changed_at
    string description
  }
  BOOKING ||--|{ PASSENGER : tiene
  BOOKING ||--|{ PURCHASED_FARE : compra
  BOOKING ||--|{ TICKET : emite
  BOOKING ||--o{ BOOKING_CHANGE : historial
  PASSENGER ||--o{ SEAT_ASSIGNMENT : ocupa
  PASSENGER ||--o{ EXTRA_BAGGAGE : lleva
  PASSENGER ||--|| TICKET : recibe
  TICKET ||--|{ TICKET_COUPON : cubre

  %% offers
  HOLD {
    uuid hold_id PK
    string owner_id
    string offer_id
    string status "HELD, RELEASED, EXPIRED, CONSUMED"
    decimal locked_price
    int ttl_minutes
    timestamp expires_at
  }
  HOLD_SELECTION {
    uuid hold_id FK
    string itinerary_id
    string cabin_class
    string fare_brand
    decimal price
  }
  HOLD ||--|{ HOLD_SELECTION : retiene

  %% post-sale
  QUOTE {
    uuid quote_id PK
    string booking_id "ref. bookings.BOOKING"
    string kind "CANCELLATION o DATE_CHANGE"
    json payload
    timestamp expires_at
  }

  %% check-in
  CHECK_IN {
    string booking_id "ref. bookings.BOOKING"
    string segment_id
    string passenger_id
    string seat_number "null para infantes"
  }

  %% customers
  CUSTOMER_PROFILE {
    string owner_id PK "sub del JWT"
    string first_name
    string last_name
    string document_type
    string document_number
    date birth_date
    string email
    string phone
    timestamp updated_at
  }

  %% flight-status
  FLIGHT_STATUS_OVERRIDE {
    string flight_number PK
    date date PK
    string status
    timestamp actual_departure_at
    timestamp actual_arrival_at
    string updated_by
  }

  %% webhooks
  WEBHOOK_SUBSCRIPTION {
    uuid id PK
    string owner_id
    string url
    string secret
  }
  WEBHOOK_EVENT_TYPE {
    uuid subscription_id FK
    string event_type
  }
  WEBHOOK_SUBSCRIPTION ||--|{ WEBHOOK_EVENT_TYPE : escucha

  %% admin (schedule)
  SCHEDULED_ROUTE {
    string route_id PK "EA300-EA301"
    string origin
    string destination
    string outbound_flight_number UK
    string outbound_departure_local
    string inbound_flight_number UK
    string inbound_departure_local
    string weekdays "MON,WED,FRI"
    string aircraft_type
    string source "NETWORK o ADMIN"
    timestamp updated_at
    string updated_by
  }
  AIRCRAFT {
    string registration PK "HC-J27"
    string aircraft_type "A220-300, A320neo, 787-9"
    string base "aeropuerto donde empieza y termina su semana"
    string source "NETWORK o ADMIN"
    timestamp updated_at
    string updated_by
  }
  ROUTE_AIRCRAFT {
    string route_id FK
    string registration FK
    int position "orden en que cubre los días"
  }
  SCHEDULED_ROUTE ||--|{ ROUTE_AIRCRAFT : "operada por"
  AIRCRAFT ||--o{ ROUTE_AIRCRAFT : "opera"

  %% idempotency
  IDEMPOTENCY_KEY {
    string key PK "owner + operación + Idempotency-Key"
    string fingerprint "hash del body"
    string status "IN_PROGRESS, COMPLETED"
    int status_code
    json body
    timestamp expires_at "24 h"
  }

  BOOKING }o..|| HOLD : "se crea desde"
  QUOTE }o..|| BOOKING : "cotiza"
  CHECK_IN }o..|| BOOKING : "registra"
```

| Base de datos futura | Contexto actual | Dominio dueño | Tablas |
|----------------------|-----------------|---------------|--------|
| `bookings` | `BookingsDataContext` | bookings | BOOKING, PASSENGER, SEAT_ASSIGNMENT, EXTRA_BAGGAGE, PURCHASED_FARE, TICKET, TICKET_COUPON, BOOKING_CHANGE |
| `offers` | `OffersDataContext` | offers | HOLD, HOLD_SELECTION |
| `post-sale` | `PostSaleDataContext` | post-sale | QUOTE |
| `check-in` | `CheckInDataContext` | check-in | CHECK_IN |
| `customers` | `CustomersDataContext` | customers | CUSTOMER_PROFILE |
| `flight-status` | `FlightStatusDataContext` | flight-status | FLIGHT_STATUS_OVERRIDE |
| `webhooks` | `WebhooksDataContext` | webhooks | WEBHOOK_SUBSCRIPTION, WEBHOOK_EVENT_TYPE |
| `schedule` | `AdminDataContext` | admin | SCHEDULED_ROUTE, AIRCRAFT, ROUTE_AIRCRAFT |
| `idempotency` | `IdempotencyDataContext` | transversal | IDEMPOTENCY_KEY |

**Datos que no son nuestros:** el inventario (cupos y asientos) vive en el **GDS** y los pagos en la **Payment API**. Son sistemas
externos: la API los consulta mediante gateways y no los copia en sus tablas.

**Paso a PostgreSQL:** se reemplazan las implementaciones de `DataManagement/src/repositories` por repositorios con TypeORM, el mismo
ORM de la plantilla del grupo. Las interfaces, los servicios, los controllers y el contrato no cambian.

---

## 6. Eventos (SOA/EDA)

```mermaid
flowchart LR
  subgraph Productores
    BK[bookings]
    PS[post-sale]
    CI[check-in]
    AD[admin]
  end
  BUS{{DomainEventBus<br/>bus interno}}
  BK & PS & CI & AD -- publish --> BUS
  BUS -- subscribe --> WH[WebhookDeliveryService]
  WH -- "POST + X-EcoAirlines-Signature" --> EXT[Booking central · notificaciones · contabilidad]
  BUS -. "historial" .-> OBS["/admin/events (panel)"]
```

El catálogo completo de eventos, el formato, la firma, los reintentos y el camino hacia un broker (RabbitMQ o Kafka) están en
[`EVENTOS.md`](EVENTOS.md).

---

## 7. Seguridad y operación (resumen)

| Tema | Implementación |
|------|----------------|
| Autenticación | JWT verificado: firma, `exp`, `iss`, `aud`; rechaza `alg: none`. En producción, un proveedor OAuth2 real (`AUTH_JWKS_URL`) |
| Autorización | Scopes del contrato (`flights:*`) y propios (`ecoairlines:profile`, `ecoairlines:admin`). Recurso ajeno → `404` |
| Entrada | DTOs con las reglas del contrato, `additionalProperties: false`, body ≤ 100 kb, saneamiento de claves peligrosas |
| Abuso | Rate limit por IP (`429` con `Retry-After`) |
| Cabeceras | helmet, CORS con lista blanca, HSTS en producción |
| Trazabilidad | `X-Request-Id` en cada respuesta, log de acceso sin datos sensibles, observabilidad en `/admin/observability` |
| Webhooks | URL anti-SSRF en producción (también al enviar), firma HMAC-SHA256 con el `secret` |
| Configuración | Se valida completa al arrancar; en producción, sin la configuración segura, la API no inicia |
