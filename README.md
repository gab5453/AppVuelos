# AppVuelos — EcoAirlines

Plataforma web para una aerolínea ficticia con identidad ecológica, construida a partir de un **contrato REST (OpenAPI 3.0)**.
Proyecto académico de *Integración de Sistemas* (Reto 1), desarrollado con prácticas profesionales: contrato como fuente de verdad,
arquitectura modular, seguridad, pruebas automatizadas y trazabilidad de cada decisión.

> EcoAirlines es ficticia: vuelos, precios y cifras ambientales son ilustrativos.

## En línea (Azure)

| | URL |
|---|-----|
| **Web** (marketplace y panel de administración) | https://nice-hill-090e19c10.1.azurestaticapps.net |
| **API · Swagger** | https://ecoairlines-api-gv-fjfaa7b5geg3hphs.brazilsouth-01.azurewebsites.net/docs |

Clientes de prueba: `demo@ecoairlines.test` / `EcoDemo2026` y `maria@ecoairlines.test` / `EcoMaria2026`. La clave del administrador se
entrega aparte.

En Swagger se obtiene el token desde el documento **"dev-auth"** del selector (`POST /login`) y se pega en **Authorize**.

El despliegue (Static Web Apps, App Service, PostgreSQL Flexible Server y GitHub Actions) está en
[`DESPLIEGUE_AZURE.md`](DESPLIEGUE_AZURE.md).

## Estructura

La API está organizada en **4 capas**, como una solución .NET con 4 proyectos (`.sln` + `.csproj`). Aquí cada capa es un
workspace npm con su `package.json` y su `tsconfig.json`, y cada una solo usa las capas inferiores:

```
EcoAirlines.API  →  EcoAirlines.Business  →  EcoAirlines.DataManagement  →  EcoAirlines.DataAccess
```

| Carpeta / archivo | Contenido |
|-------------------|-----------|
| [`EcoAirlines.API/`](EcoAirlines.API) | **API REST** (NestJS + TypeScript): controllers, autenticación, seguridad, ProblemDetails, idempotencia y Swagger en `/docs` |
| [`EcoAirlines.Business/`](EcoAirlines.Business) | **Lógica de negocio**: services, DTOs del contrato, reglas y excepciones |
| [`EcoAirlines.DataManagement/`](EcoAirlines.DataManagement) | **Patrón repositorio**: interfaces, repositorios y gateways hacia el GDS y la Payment API |
| [`EcoAirlines.DataAccess/`](EcoAirlines.DataAccess) | **Datos**: entidades, un contexto de datos por base de datos futura, GDS y Payment API simulados, seed |
| [`contract/`](contract) | Contrato [`vuelos-openapi.yaml`](contract/vuelos-openapi.yaml): fuente de verdad, no se modifica. Anexo [`ecoairlines-extensions.yaml`](contract/ecoairlines-extensions.yaml): endpoints propios fuera del contrato (perfil, cambio de asiento, administración y observabilidad) |
| [`ecoairlines-web/`](ecoairlines-web) | **Sitio web** (React + TypeScript + Vite), verde y blanco |
| [`dev-auth/`](dev-auth) | Servidor de **autenticación de desarrollo**: emite los JWT que verifica la API (sin dependencias) |
| [`CAMBIOS.md`](CAMBIOS.md) | Plan por fases, aprobado antes de implementar, con el resultado y las desviaciones de cada fase |
| [`HALLAZGOS.md`](HALLAZGOS.md) | Hallazgos verificados: entorno local, despliegue en la nube, plantilla del booking y contrato |
| [`ARQUITECTURA.md`](ARQUITECTURA.md) | **Arquitectura**: componentes, capas, flujo de compra y modelo de datos (diagramas Mermaid) |
| [`EVENTOS.md`](EVENTOS.md) | **Eventos (SOA/EDA)**: catálogo, bus interno, webhooks firmados y evolución hacia un broker |
| [`PRUEBASSW.md`](PRUEBASSW.md) | Guía de pruebas manuales en Swagger, incluidos los errores 400–429 |
| [`CRITERIOS.md`](CRITERIOS.md) | Estado frente a la rúbrica de evaluación y descripción de cada parte para la defensa |
| [`DESPLIEGUE_AZURE.md`](DESPLIEGUE_AZURE.md) | Despliegue en Azure paso a paso, URLs públicas y problemas frecuentes |
| [`AUDITORIA.md`](AUDITORIA.md) | Auditoría técnica de Gemini sobre la primera versión (histórica) |
| [`CLAUDE.md`](CLAUDE.md) / [`GEMINI.md`](GEMINI.md) | Reglas del programador (Claude) y del auditor (Gemini) |

## Requisitos

- **Node.js 24** (LTS; recomendado ≥ 24.15) y npm.
- Puertos libres: **3000** (API), **4000** (dev-auth) y **5173** (frontend).

## Puesta en marcha

En tres terminales:

```bash
# 1) API — http://localhost:3000  (Swagger: http://localhost:3000/docs). Desde la raíz del repositorio:
npm install
npm run start:dev

# 2) Autenticación de desarrollo — http://localhost:4000
cd dev-auth
npm start

# 3) Frontend — http://localhost:5173
cd ecoairlines-web
npm install
npm run dev
```

Abrir **http://localhost:5173** (con `localhost`, no `127.0.0.1`). Usuarios de prueba: clientes `demo@ecoairlines.test` / `EcoDemo2026`, `maria@ecoairlines.test` / `EcoMaria2026` y `luis@ecoairlines.test` / `EcoLuis2026`; administrador `admin@ecoairlines.test` / `EcoAdmin2026`
(panel de administración y observabilidad en `/admin`).

Para probar en Swagger los endpoints protegidos, generar un token con `npm run token` (en la raíz) y pegarlo en *Authorize* → `DevBearer`.

## Calidad

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e && npm run build   # API (raíz)
cd ecoairlines-web && npm run lint && npm run build                                   # frontend
```

Las pruebas e2e validan **cada respuesta real de la API contra los schemas del contrato** y exigen cubrir todas las combinaciones
operación + status documentadas. La prueba de arquitectura verifica el sentido de las dependencias entre capas y que ningún dominio
acceda a los datos de otro. Detalle en [`EcoAirlines.API/README.md`](EcoAirlines.API/README.md).

## Seguridad (resumen)

JWT verificado (firma, expiración, emisor, audiencia y algoritmos permitidos), scopes OAuth2 del contrato, propiedad de los recursos
por usuario, cabeceras HTTP seguras, CORS por lista blanca, límite de peticiones (`429`), validación y saneamiento de entradas,
idempotencia y errores uniformes en formato ProblemDetails. Los secretos que aparecen en el código son **solo de desarrollo**: la API
se niega a arrancar con ellos en producción.

## Flujo de trabajo

1. Cada cambio se propone primero en `CAMBIOS.md` y se aprueba antes de implementarse.
2. El contrato **no se modifica**: las inconsistencias se registran en `HALLAZGOS.md`.
3. Gemini audita el resultado (`AUDITORIA.md`) y el responsable del proyecto supervisa el funcionamiento antes de cada commit.
