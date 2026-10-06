# Proyecto Vuelos - Reto 1

## Objetivo

Implementar un backend REST con NestJS basado estrictamente en el contrato OpenAPI ubicado en:

`contract/vuelos-openapi.yaml`

El contrato OpenAPI es la fuente de verdad de la API.

## Regla principal

NO modificar, completar, reinterpretar ni inventar el contrato OpenAPI durante la implementación.

El código debe adaptarse al contrato y no al contrario.

Si se detecta una inconsistencia entre el contrato y el código existente:

1. Identificar la inconsistencia.
2. Explicarla.
3. Mantener el contrato como fuente de verdad.
4. No modificar el contrato salvo autorización explícita del estudiante.

## Arquitectura

El proyecto debe ser un monolito modular preparado para una futura migración a microservicios.

Los módulos de negocio deben mantenerse aislados y con responsabilidades claras.

Dominios principales:

* search
* offers
* bookings
* post-sale
* check-in
* flight-status
* webhooks

Las dependencias entre dominios deben ser mínimas.

No colocar toda la lógica de negocio en AppService.

## API-first

Cada implementación debe comenzar revisando:

* path
* método HTTP
* parámetros
* headers
* request body
* response body
* códigos HTTP
* security
* scopes
* schemas
* enums
* formatos
* restricciones de validación

del contrato OpenAPI.

## DTOs

Los DTOs deben representar exactamente las estructuras definidas en OpenAPI.

Respetar:

* required
* optional
* enum
* format
* pattern
* minimum
* maximum
* minItems
* maxItems
* additionalProperties
* nullable
* readOnly

No agregar propiedades públicas que contradigan el contrato.

## Seguridad

El contrato utiliza OAuth2.

No simular una implementación OAuth2 real en producción.

La arquitectura debe permitir agregar posteriormente un proveedor real de autenticación.

Los endpoints protegidos deben diseñarse alrededor de:

* autenticación
* scopes
* usuario actual
* ownerId derivado del JWT

Nunca aceptar ownerId como un dato controlado por el cliente cuando el contrato indique que proviene del JWT.

## Pagos

La API de vuelos NO procesa:

* tarjetas
* 3DS
* autorización
* captura
* reembolsos financieros

La API únicamente recibe paymentReference cuando corresponda.

## Idempotencia

Los endpoints que requieren `Idempotency-Key` deben conservar ese requisito.

No eliminarlo simplemente para facilitar el desarrollo.

La arquitectura debe permitir implementar posteriormente almacenamiento de claves idempotentes.

## Errores

Utilizar el modelo ProblemDetails definido en OpenAPI.

No inventar estructuras de error alternativas.

Respetar los códigos documentados:

* 400
* 403
* 404
* 409
* 410
* 422
* 429

## Implementación progresiva

No implementar todo el sistema de una sola vez.

Trabajar por fases:

1. Inspección del contrato.
2. Arquitectura.
3. Infraestructura común.
4. Módulo Search.
5. Módulo Offers/Hold.
6. Módulo Bookings.
7. Postventa.
8. Tickets y emisión.
9. Check-in y Boarding Pass.
10. Flight Status.
11. Webhooks.
12. Pruebas.
13. Auditoría del contrato.

Después de cada fase ejecutar:

* typecheck
* lint
* tests
* pruebas de endpoints afectados

## Regla para cambios

Antes de modificar varios archivos:

* explicar qué se va a modificar
* justificar por qué
* indicar qué parte del contrato se está implementando

Evitar cambios innecesarios.

No reemplazar una arquitectura modular por una arquitectura monolítica simple para ahorrar trabajo.

## Calidad

Preferir:

* TypeScript estricto
* interfaces claras
* dependency injection de NestJS
* servicios pequeños
* repositories/interfaces para persistencia
* adapters para dependencias externas
* tests unitarios
* tests e2e

Preparar la arquitectura para reemplazar implementaciones mock por infraestructura real posteriormente.

## Restricción de negocio

El objetivo actual es Reto 1.

Se permite utilizar implementaciones mock o in-memory cuando todavía no exista infraestructura externa.

Sin embargo, las interfaces deben permitir reemplazarlas posteriormente sin cambiar los controllers ni el contrato HTTP.

## Antes de programar

Cuando se solicite una tarea nueva:

1. Leer el contrato OpenAPI.
2. Leer la estructura actual.
3. Identificar el módulo afectado.
4. Explicar brevemente el plan.
5. Implementar.
6. Ejecutar verificaciones.
7. Resumir los cambios y las pruebas realizadas.
