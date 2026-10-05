# AppVuelos — EcoAirlines

Plataforma web para una aerolínea ficticia con identidad ecológica, construida a partir de un **contrato REST (OpenAPI 3.0)**.
Proyecto académico de *Integración de Sistemas* (Reto 1), desarrollado con prácticas profesionales: contrato como fuente de verdad,
arquitectura modular, seguridad, pruebas automatizadas y trazabilidad de cada decisión.

> EcoAirlines es ficticia: vuelos, precios y cifras ambientales son ilustrativos.

## Estructura

| Carpeta / archivo | Contenido |
|-------------------|-----------|
| [`vuelos/`](vuelos) | **API REST** (NestJS + TypeScript). Implementa [`vuelos/contract/vuelos-openapi.yaml`](vuelos/contract/vuelos-openapi.yaml) y publica Swagger en `/docs` |
| [`frontend/`](frontend) | **Sitio web** (React + TypeScript + Vite), verde y blanco |
| [`dev-auth/`](dev-auth) | Servidor de **autenticación de desarrollo**: emite los JWT que verifica la API (sin dependencias) |
| [`CAMBIOS.md`](CAMBIOS.md) | Plan por fases, aprobado antes de implementar, con el resultado y las desviaciones de cada fase |
| [`HALLAZGOS.md`](HALLAZGOS.md) | Hallazgos verificados: entorno local, despliegue en la nube, plantilla del booking y contrato |
| [`vuelos/AUDITORIA.md`](vuelos/AUDITORIA.md) | Auditoría técnica y su seguimiento |

## Requisitos

- **Node.js 24** (LTS; recomendado ≥ 24.15) y npm.
- Puertos libres: **3000** (API), **4000** (dev-auth) y **5173** (frontend).

## Puesta en marcha

En tres terminales:

```bash
# 1) API — http://localhost:3000  (Swagger: http://localhost:3000/docs)
cd vuelos
npm install
npm run start:dev

# 2) Autenticación de desarrollo — http://localhost:4000
cd dev-auth
npm start

# 3) Frontend — http://localhost:5173
cd frontend
npm install
npm run dev
```

Abrir **http://localhost:5173** (con `localhost`, no `127.0.0.1`). Usuario de prueba: `demo@ecoairlines.test` / `EcoDemo2026`.

Para probar en Swagger los endpoints protegidos, generar un token con `cd vuelos && npm run token` y pegarlo en *Authorize* → `DevBearer`.

## Calidad

```bash
cd vuelos   && npx tsc --noEmit && npm run lint && npm test && npm run test:e2e
cd frontend && npm run lint && npm run build
```

Las pruebas e2e validan **cada respuesta real de la API contra los schemas del contrato** y exigen cubrir todas las combinaciones
operación + status documentadas. Detalle en [`vuelos/README.md`](vuelos/README.md).

## Seguridad (resumen)

JWT verificado (firma, expiración, emisor, audiencia y algoritmos permitidos), scopes OAuth2 del contrato, propiedad de los recursos
por usuario, cabeceras HTTP seguras, CORS por lista blanca, límite de peticiones (`429`), validación y saneamiento de entradas,
idempotencia y errores uniformes en formato ProblemDetails. Los secretos que aparecen en el código son **solo de desarrollo**: la API
se niega a arrancar con ellos en producción.

## Flujo de trabajo

1. Cada cambio se propone primero en `CAMBIOS.md` y se aprueba antes de implementarse.
2. El contrato **no se modifica**: las inconsistencias se registran en `HALLAZGOS.md`.
3. Gemini audita el resultado (`vuelos/AUDITORIA.md`) y el responsable del proyecto supervisa el funcionamiento antes de cada commit.
